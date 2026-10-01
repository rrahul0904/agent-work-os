import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { assertPlanAuthorized, createActionPlan } from './execution-safety.js';
import { findCommand } from './adapters.js';

export const PERSISTENT_COMPUTE_VERSION = 'persistent-compute/v1';

const WORKER_SOURCE = String.raw`
import contextlib
import io
import json
import sys
import traceback

scope = {"__name__": "__agent_work_os_cell__"}

def trim_pair(stdout, stderr, limit):
    out_b = stdout.encode("utf-8", errors="replace")
    err_b = stderr.encode("utf-8", errors="replace")
    total = len(out_b) + len(err_b)
    if total <= limit:
        return stdout, stderr, False
    kept_out = out_b[:limit]
    remaining = max(0, limit - len(kept_out))
    kept_err = err_b[:remaining]
    return (
        kept_out.decode("utf-8", errors="ignore"),
        kept_err.decode("utf-8", errors="ignore"),
        True,
    )

print(json.dumps({"type": "ready"}), flush=True)

for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    try:
        request = json.loads(raw)
        request_id = request["id"]
        code = request["code"]
        max_output_bytes = int(request["max_output_bytes"])
    except Exception as exc:
        print(json.dumps({"type": "protocol_error", "message": str(exc)}), flush=True)
        continue

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    ok = True
    error_type = None
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            exec(compile(code, "<agent-work-os-cell>", "exec"), scope, scope)
    except BaseException as exc:
        ok = False
        error_type = type(exc).__name__
        stderr_buffer.write(traceback.format_exc())

    stdout, stderr, truncated = trim_pair(
        stdout_buffer.getvalue(),
        stderr_buffer.getvalue(),
        max_output_bytes,
    )
    print(json.dumps({
        "type": "result",
        "id": request_id,
        "ok": ok,
        "error_type": error_type,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": truncated,
    }), flush=True)
`;

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value, field, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate <= 0) throw new TypeError(`${field} must be a positive integer`);
  return candidate;
}

function codeDigest(code) {
  return createHash('sha256').update(code).digest('hex');
}

function minimalChildEnv() {
  const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'];
  const env = { PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

export function findPythonExecutable() {
  const configured = process.env.AGENT_WORK_OS_PYTHON;
  if (configured) return configured;
  return findCommand('python3')?.executable ?? findCommand('python')?.executable ?? null;
}

export function createPythonCellPlan({ workspaceId, code }) {
  const source = nonEmptyString(code, 'code');
  const digest = codeDigest(source);
  return createActionPlan({
    workspaceId,
    actions: [{
      id: `python:${digest}`,
      capability: 'python',
      kind: 'python_cell',
      target: `sha256:${digest}`,
      summary: 'execute an explicitly approved Python cell in the weak host-process backend',
    }],
  });
}

export class PersistentPythonWorker {
  constructor({
    workspaceRoot,
    pythonExecutable = findPythonExecutable(),
    allowWeakHostProcess = false,
    networkPolicy = 'inherited',
    perCellTimeoutMs = 2_000,
    maxOutputBytes = 32_768,
    maxCellsBeforeRestart = 50,
  } = {}) {
    this.workspaceRoot = path.resolve(nonEmptyString(workspaceRoot, 'workspaceRoot'));
    this.pythonExecutable = pythonExecutable ? nonEmptyString(pythonExecutable, 'pythonExecutable') : null;
    this.allowWeakHostProcess = allowWeakHostProcess === true;
    this.networkPolicy = nonEmptyString(networkPolicy, 'networkPolicy');
    this.perCellTimeoutMs = positiveInteger(perCellTimeoutMs, 'perCellTimeoutMs', 2_000);
    this.maxOutputBytes = positiveInteger(maxOutputBytes, 'maxOutputBytes', 32_768);
    this.maxCellsBeforeRestart = positiveInteger(maxCellsBeforeRestart, 'maxCellsBeforeRestart', 50);
    this.child = null;
    this.stdout = null;
    this.pending = null;
    this.sequence = 0;
    this.cellsExecuted = 0;
    this.consumedAuthorizations = new Set();

    if (!this.allowWeakHostProcess) {
      throw new Error('persistent Python requires explicit allowWeakHostProcess=true');
    }
    if (this.networkPolicy !== 'inherited') {
      throw new Error('network isolation is unavailable for the weak host-process backend');
    }
    if (!this.pythonExecutable) {
      throw new Error('no Python executable was found');
    }
  }

  isolationReceipt() {
    return Object.freeze({
      version: PERSISTENT_COMPUTE_VERSION,
      classification: 'weak-host-process',
      processIsolation: 'separate-process',
      filesystemIsolation: 'not-enforced',
      networkIsolation: 'not-enforced',
      networkPolicy: 'inherited',
      environment: 'allowlisted-minimal-env',
      shell: false,
    });
  }

  async #ensureWorkspace() {
    const info = await lstat(this.workspaceRoot);
    if (!info.isDirectory()) throw new Error('workspaceRoot must be a directory');
  }

  async #ensureStarted() {
    if (this.child && this.child.exitCode === null && !this.child.killed) return;
    await this.#ensureWorkspace();
    this.child = spawn(
      this.pythonExecutable,
      ['-I', '-u', '-c', WORKER_SOURCE],
      {
        cwd: this.workspaceRoot,
        env: minimalChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      },
    );
    this.cellsExecuted = 0;
    this.stdout = readline.createInterface({ input: this.child.stdout });

    this.stdout.on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        if (this.pending) this.#finishPending({
          status: 'protocol_error',
          stdout: '',
          stderr: 'worker emitted non-JSON output',
          truncated: false,
          errorType: 'ProtocolError',
        });
        return;
      }
      if (message.type === 'ready') return;
      if (message.type === 'protocol_error') {
        if (this.pending) this.#finishPending({
          status: 'protocol_error',
          stdout: '',
          stderr: String(message.message ?? 'worker protocol error'),
          truncated: false,
          errorType: 'ProtocolError',
        });
        return;
      }
      if (message.type !== 'result' || !this.pending || message.id !== this.pending.id) return;
      this.#finishPending({
        status: message.ok ? 'completed' : 'error',
        stdout: String(message.stdout ?? ''),
        stderr: String(message.stderr ?? ''),
        truncated: message.truncated === true,
        errorType: message.error_type ?? null,
      });
    });

    this.child.stderr.on('data', (chunk) => {
      if (!this.pending) return;
      const text = String(chunk);
      this.pending.processStderr = `${this.pending.processStderr ?? ''}${text}`.slice(0, this.maxOutputBytes);
    });

    this.child.once('exit', (code, signal) => {
      const hadPending = this.pending;
      this.child = null;
      this.stdout?.close();
      this.stdout = null;
      if (hadPending) {
        this.#finishPending({
          status: 'worker_exit',
          stdout: '',
          stderr: hadPending.processStderr || `Python worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
          truncated: false,
          errorType: 'WorkerExit',
          workerRestarted: true,
        });
      }
    });
  }

  #finishPending({ status, stdout, stderr, truncated, errorType, workerRestarted = false }) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    this.cellsExecuted += 1;
    const receipt = Object.freeze({
      version: PERSISTENT_COMPUTE_VERSION,
      requestId: pending.id,
      codeSha256: pending.codeSha256,
      planId: pending.planId,
      authorizationId: pending.authorizationId,
      status,
      stdout,
      stderr,
      truncated,
      errorType,
      workerRestarted,
      isolation: this.isolationReceipt(),
    });
    pending.resolve(receipt);

    if (this.cellsExecuted >= this.maxCellsBeforeRestart) {
      this.#stopProcess();
    }
  }

  #stopProcess() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    this.stdout?.close();
    this.stdout = null;
    if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
  }

  async runCell({ code, plan, authorization }) {
    if (this.pending) throw new Error('a Python cell is already running');
    const source = nonEmptyString(code, 'code');
    assertPlanAuthorized(plan, authorization);
    if (this.consumedAuthorizations.has(authorization.authorizationId)) {
      throw new Error('authorization receipt has already been consumed');
    }

    const digest = codeDigest(source);
    const expectedTarget = `sha256:${digest}`;
    const matching = plan.actions?.filter(
      (action) => action.capability === 'python'
        && action.kind === 'python_cell'
        && action.target === expectedTarget,
    ) ?? [];
    if (matching.length !== 1) throw new Error('action plan does not authorize this exact Python cell');

    this.consumedAuthorizations.add(authorization.authorizationId);
    await this.#ensureStarted();
    const requestId = `cell-${++this.sequence}`;

    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.pending;
        if (!pending || pending.id !== requestId) return;
        this.pending = null;
        this.#stopProcess();
        resolve(Object.freeze({
          version: PERSISTENT_COMPUTE_VERSION,
          requestId,
          codeSha256: digest,
          planId: plan.planId,
          authorizationId: authorization.authorizationId,
          status: 'timeout',
          stdout: '',
          stderr: `Python cell exceeded ${this.perCellTimeoutMs}ms`,
          truncated: false,
          errorType: 'Timeout',
          workerRestarted: true,
          isolation: this.isolationReceipt(),
        }));
      }, this.perCellTimeoutMs);
      timer.unref?.();

      this.pending = {
        id: requestId,
        codeSha256: digest,
        planId: plan.planId,
        authorizationId: authorization.authorizationId,
        timer,
        resolve,
        processStderr: '',
      };

      const payload = JSON.stringify({
        id: requestId,
        code: source,
        max_output_bytes: this.maxOutputBytes,
      });
      this.child.stdin.write(`${payload}\n`);
    });
  }

  async close() {
    if (this.pending) throw new Error('cannot close while a Python cell is running');
    this.#stopProcess();
  }
}
