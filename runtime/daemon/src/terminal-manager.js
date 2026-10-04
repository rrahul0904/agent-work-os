import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 36;
const MIN_COLS = 40;
const MAX_COLS = 300;
const MIN_ROWS = 10;
const MAX_ROWS = 120;
const MAX_INPUT_CHARS = 32_768;
const MAX_SNAPSHOT_CHARS = 131_072;
const DEFAULT_POLL_MS = 350;
const SAFE_KEYS = new Set([
  'Enter', 'Escape', 'Tab', 'BSpace', 'DC', 'IC',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PPage', 'NPage',
  'C-c', 'C-d', 'C-z', 'C-l', 'C-a', 'C-e', 'C-u', 'C-k', 'C-w'
]);

export class TmuxTerminalManager {
  constructor({ executable = 'tmux', run = runTmux, pollMs = DEFAULT_POLL_MS, clock = () => new Date() } = {}) {
    this.executable = executable;
    this.run = run;
    this.pollMs = pollMs;
    this.clock = clock;
    this.sessions = new Map();
  }

  capability(version) {
    return { name: 'terminal', executable: this.executable, version, transport: 'tmux-snapshot-v1' };
  }

  async start(sessionId, input, emit) {
    const id = cleanSessionId(sessionId);
    const cwd = cleanCwd(input?.cwd);
    const cols = dimension(input?.cols, DEFAULT_COLS, MIN_COLS, MAX_COLS);
    const rows = dimension(input?.rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS);
    const name = tmuxSessionName(id);
    if (await this.exists(id)) throw new Error('terminal_session_already_exists');

    await this.run(this.executable, ['new-session', '-d', '-s', name, '-c', cwd, '-x', String(cols), '-y', String(rows)]);
    if (!(await this.exists(id))) throw new Error('terminal_health_check_failed');

    const state = {
      sessionId: id,
      name,
      cols,
      rows,
      emit,
      lastSnapshotDigest: undefined,
      closed: false,
      pollTimer: undefined
    };
    this.sessions.set(id, state);
    emit({
      kind: 'health',
      healthy: true,
      provider: 'terminal',
      sessionId: id,
      source: 'tmux.has-session',
      at: this.#nowIso()
    });
    emit({ kind: 'status', status: 'running', message: 'tmux terminal is live', at: this.#nowIso() });
    await this.capture(id, { force: true });
    this.#schedule(state);
    return { sessionId: id, name, cols, rows };
  }

  async attach(sessionId, emit) {
    const id = cleanSessionId(sessionId);
    const existing = this.sessions.get(id);
    if (existing) {
      existing.emit = emit ?? existing.emit;
      return existing;
    }
    if (!(await this.exists(id))) throw new Error('terminal_session_not_found');
    const state = {
      sessionId: id,
      name: tmuxSessionName(id),
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      emit,
      lastSnapshotDigest: undefined,
      closed: false,
      pollTimer: undefined
    };
    this.sessions.set(id, state);
    this.#schedule(state);
    return state;
  }

  async input(sessionId, input, emit) {
    const state = await this.#state(sessionId, emit);
    if (input?.text !== undefined) await this.#pasteText(state, input.text);
    if (input?.key !== undefined) await this.#sendKey(state, input.key);
    if (input?.text === undefined && input?.key === undefined) throw new Error('terminal_input_required');
    await this.capture(state.sessionId, { force: true });
  }

  async resize(sessionId, input, emit) {
    const state = await this.#state(sessionId, emit);
    const cols = dimension(input?.cols, state.cols, MIN_COLS, MAX_COLS);
    const rows = dimension(input?.rows, state.rows, MIN_ROWS, MAX_ROWS);
    await this.run(this.executable, ['resize-window', '-t', state.name, '-x', String(cols), '-y', String(rows)]);
    state.cols = cols;
    state.rows = rows;
    await this.capture(state.sessionId, { force: true });
    return { cols, rows };
  }

  async capture(sessionId, { force = false } = {}) {
    const state = this.sessions.get(cleanSessionId(sessionId));
    if (!state || state.closed) return undefined;
    const result = await this.run(this.executable, ['capture-pane', '-p', '-J', '-S', '-200', '-t', `${state.name}:0.0`]);
    const text = String(result.stdout ?? '').slice(-MAX_SNAPSHOT_CHARS);
    const digest = sha256(text);
    if (force || digest !== state.lastSnapshotDigest) {
      state.lastSnapshotDigest = digest;
      state.emit?.({
        kind: 'terminal.snapshot',
        text,
        digest,
        cols: state.cols,
        rows: state.rows,
        at: this.#nowIso()
      });
    }
    return { text, digest, cols: state.cols, rows: state.rows };
  }

  async stop(sessionId, emit) {
    const id = cleanSessionId(sessionId);
    const state = this.sessions.get(id);
    const name = state?.name ?? tmuxSessionName(id);
    if (await this.exists(id)) await this.run(this.executable, ['kill-session', '-t', name]);
    if (state?.pollTimer) clearTimeout(state.pollTimer);
    if (state) state.closed = true;
    this.sessions.delete(id);
    (emit ?? state?.emit)?.({ kind: 'status', status: 'stopped', at: this.#nowIso() });
  }

  async exists(sessionId) {
    const name = tmuxSessionName(cleanSessionId(sessionId));
    try {
      await this.run(this.executable, ['has-session', '-t', name]);
      return true;
    } catch {
      return false;
    }
  }

  async close() {
    for (const state of this.sessions.values()) {
      state.closed = true;
      if (state.pollTimer) clearTimeout(state.pollTimer);
    }
    this.sessions.clear();
  }

  async #state(sessionId, emit) {
    const id = cleanSessionId(sessionId);
    const current = this.sessions.get(id);
    if (current) {
      if (emit) current.emit = emit;
      return current;
    }
    return this.attach(id, emit);
  }

  async #pasteText(state, value) {
    const text = String(value ?? '');
    if (!text) return;
    if (text.length > MAX_INPUT_CHARS) throw new Error('terminal_input_too_large');
    if (text.includes('\0')) throw new Error('terminal_input_nul_forbidden');
    const buffer = `awo-${crypto.randomBytes(8).toString('hex')}`;
    // Text is supplied only through stdin. It is never interpolated into a shell
    // string or passed as a tmux command argument.
    await this.run(this.executable, ['load-buffer', '-b', buffer, '-'], { input: text });
    await this.run(this.executable, ['paste-buffer', '-d', '-b', buffer, '-t', `${state.name}:0.0`]);
  }

  async #sendKey(state, value) {
    const key = String(value ?? '').trim();
    if (!SAFE_KEYS.has(key)) throw new Error('terminal_key_not_allowed');
    await this.run(this.executable, ['send-keys', '-t', `${state.name}:0.0`, key]);
  }

  #schedule(state) {
    if (!this.pollMs || state.closed || state.pollTimer) return;
    state.pollTimer = setTimeout(async () => {
      state.pollTimer = undefined;
      if (state.closed) return;
      try {
        if (!(await this.exists(state.sessionId))) {
          state.closed = true;
          this.sessions.delete(state.sessionId);
          state.emit?.({ kind: 'status', status: 'stopped', message: 'tmux session ended', at: this.#nowIso() });
          return;
        }
        await this.capture(state.sessionId);
      } catch (error) {
        state.emit?.({ kind: 'error', message: `terminal_capture_failed:${error.message}`, at: this.#nowIso() });
      }
      this.#schedule(state);
    }, this.pollMs);
    state.pollTimer.unref?.();
  }

  #nowIso() {
    const value = this.clock();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }
}

export async function runTmux(executable, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > MAX_SNAPSHOT_CHARS * 2) stdout = stdout.slice(-MAX_SNAPSHOT_CHARS); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 16_384) stderr = stderr.slice(-16_384); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(`tmux_exit_${code ?? 'unknown'}:${stderr.trim().slice(-1000)}`));
    });
    if (input !== undefined) child.stdin.end(String(input));
    else child.stdin.end();
  });
}

function cleanSessionId(value) {
  const id = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('terminal_session_id_invalid');
  return id;
}

function tmuxSessionName(sessionId) {
  return `awo-${sessionId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}`;
}

function cleanCwd(value) {
  const cwd = String(value ?? '').trim();
  if (!cwd || !path.isAbsolute(cwd) || cwd.includes('\0')) throw new Error('terminal_cwd_invalid');
  return cwd;
}

function dimension(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
