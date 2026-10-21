/**
 * Opt-in, read-only Proschi CLI adapter. This is a preflight boundary, NOT an
 * OS sandbox, production capacity test, or authority to ship architecture.
 * The caller must supply a reviewed/pinned local CLI entrypoint and sandbox
 * untrusted workspaces at the operating-system boundary.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ACTIONS = new Set(['check', 'parse', 'test', 'analyze']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

async function inspectFile(root, target, extension) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('Missing file path');
  const resolved = path.resolve(root, target);
  if (!within(root, resolved)) throw new Error('File must be contained in workspace');
  const relative = path.relative(root, resolved);
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are forbidden');
    if (current === resolved && !stat.isFile()) throw new Error('Expected regular file');
  }
  if (extension && path.extname(resolved) !== extension) throw new Error('Expected ' + extension + ' source');
  if (!within(root, await realpath(resolved))) throw new Error('Real path escapes workspace');
  return resolved;
}

/**
 * @param {{workspaceRoot:string,diagramPath:string,cliEntrypoint:string,
 * action?:'check'|'parse'|'test'|'analyze',timeoutMs?:number,maxOutputBytes?:number}} opts
 * @returns {Promise<object>} A transport/evidence receipt, not a simulation certification.
 */
export async function runProschiPreflight(opts) {
  const { workspaceRoot, diagramPath, cliEntrypoint } = opts ?? {};
  const action = opts?.action ?? 'test';
  if (!ACTIONS.has(action)) throw new Error('Unsupported read-only action');
  if (!path.isAbsolute(workspaceRoot ?? '')) throw new Error('Workspace root must be absolute');
  if (!path.isAbsolute(cliEntrypoint ?? '')) throw new Error('CLI entrypoint must be absolute');
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const maxOutputBytes = opts?.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid timeout');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 128 || maxOutputBytes > 4 * 1024 * 1024) throw new Error('Invalid output cap');

  const root = await realpath(workspaceRoot);
  const [diagram, cli] = await Promise.all([
    inspectFile(root, diagramPath, '.proschi'),
    (async () => {
      const p = await realpath(cliEntrypoint);
      if (!(await lstat(p)).isFile()) throw new Error('CLI must be a regular file');
      return p;
    })(),
  ]);
  const [source, cliBytes] = await Promise.all([readFile(diagram), readFile(cli)]);
  if (source.length > 256 * 1024) throw new Error('Diagram exceeds 256 KiB');
  // Imports can cross a workspace boundary in upstream parser. P1 rejects
  // imports until a separately tested, recursive import resolver exists.
  if (/^\s*import\s+['"]/m.test(source.toString('utf8'))) throw new Error('Imports unsupported in P1 preflight');
  const argv = [cli, action, ...(action === 'parse' ? [] : ['--format', 'json']), './' + path.relative(root, diagram)];
  const evidence = { schema: 'architecture-preflight/v1', action,
    diagram: path.relative(root, diagram), sourceSha256: sha256(source),
    cliSha256: sha256(cliBytes), simulationKind: 'model_estimate_not_measurement' };

  return await new Promise(resolve => {
    let stdout = '', stderr = '', total = 0, reason = null, finished = false;
    const child = spawn(process.execPath, argv, {
      cwd: root, shell: false, windowsHide: true,
      env: { PATH: process.env.PATH ?? '', HOME: os.tmpdir(),
        TMPDIR: os.tmpdir(), LANG: 'C', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { reason = 'timeout'; child.kill('SIGKILL'); }, timeoutMs);
    const capture = stream => chunk => {
      total += chunk.length;
      if (total > maxOutputBytes) { reason = 'output_limit'; child.kill('SIGKILL'); return; }
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', capture('stdout'));
    child.stderr.on('data', capture('stderr'));
    child.on('error', err => { reason = 'spawn_error:' + (err.code ?? 'unknown'); });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      let result = null;
      if (!reason) {
        try { result = JSON.parse(stdout); }
        catch { reason = 'invalid_json'; }
      }
      if (!reason && code !== 0) reason = 'cli_nonzero_exit';
      resolve({ ...evidence, status: reason ? 'failed' : 'completed',
        failureReason: reason, exitCode: code, signal,
        stdoutBytes: Buffer.byteLength(stdout), stderr: stderr.slice(0, 4096), result });
    });
  });
}
