import assert from 'node:assert/strict';
import test from 'node:test';
import { TmuxTerminalManager } from '../src/terminal-manager.js';

function fakeTmux() {
  const calls = [];
  const sessions = new Set();
  let snapshot = '$ ready\n';
  const run = async (_executable, args, options = {}) => {
    calls.push({ args: [...args], input: options.input });
    const action = args[0];
    const target = args[args.indexOf('-t') + 1];
    if (action === 'new-session') { sessions.add(args[args.indexOf('-s') + 1]); return { stdout: '' }; }
    if (action === 'has-session') {
      if (!sessions.has(target)) throw new Error('missing');
      return { stdout: '' };
    }
    if (action === 'capture-pane') return { stdout: snapshot };
    if (action === 'kill-session') { sessions.delete(target); return { stdout: '' }; }
    return { stdout: '' };
  };
  return { calls, sessions, run, setSnapshot(value) { snapshot = value; } };
}

test('terminal start confirms tmux existence before health/running and emits bounded snapshot', async () => {
  const fake = fakeTmux();
  const events = [];
  const manager = new TmuxTerminalManager({
    executable: '/usr/bin/tmux',
    run: fake.run,
    pollMs: 0,
    clock: () => new Date('2026-10-04T03:00:00.000Z')
  });

  const terminal = await manager.start('session-1', { cwd: '/tmp', cols: 140, rows: 42 }, (event) => events.push(event));
  assert.equal(terminal.cols, 140);
  assert.equal(terminal.rows, 42);
  assert.deepEqual(events.slice(0, 2).map((event) => [event.kind, event.status ?? event.source]), [
    ['health', 'tmux.has-session'],
    ['status', 'running']
  ]);
  assert.equal(events[2].kind, 'terminal.snapshot');
  assert.match(events[2].text, /ready/);
  const actions = fake.calls.map((call) => call.args[0]);
  assert.deepEqual(actions.slice(0, 3), ['has-session', 'new-session', 'has-session']);
});

test('terminal paste sends text only through stdin and never through tmux argv', async () => {
  const fake = fakeTmux();
  const manager = new TmuxTerminalManager({ executable: 'tmux', run: fake.run, pollMs: 0 });
  await manager.start('session-2', { cwd: '/tmp' }, () => {});
  const secretText = 'echo super-sensitive-value';
  await manager.input('session-2', { text: secretText }, () => {});

  const load = fake.calls.find((call) => call.args[0] === 'load-buffer');
  const paste = fake.calls.find((call) => call.args[0] === 'paste-buffer');
  assert.equal(load.input, secretText);
  assert.ok(!load.args.join(' ').includes(secretText));
  assert.ok(!paste.args.join(' ').includes(secretText));
});

test('terminal special keys are allowlisted and arbitrary tmux command-like keys fail closed', async () => {
  const fake = fakeTmux();
  const manager = new TmuxTerminalManager({ executable: 'tmux', run: fake.run, pollMs: 0 });
  await manager.start('session-3', { cwd: '/tmp' }, () => {});
  await manager.input('session-3', { key: 'C-c' }, () => {});
  assert.ok(fake.calls.some((call) => call.args[0] === 'send-keys' && call.args.at(-1) === 'C-c'));
  await assert.rejects(manager.input('session-3', { key: 'run-shell' }, () => {}), /terminal_key_not_allowed/);
});

test('terminal resize is bounded and stop kills only the deterministic tmux session', async () => {
  const fake = fakeTmux();
  const events = [];
  const manager = new TmuxTerminalManager({ executable: 'tmux', run: fake.run, pollMs: 0 });
  await manager.start('session-4', { cwd: '/tmp' }, (event) => events.push(event));
  const resized = await manager.resize('session-4', { cols: 9999, rows: 1 });
  assert.deepEqual(resized, { cols: 300, rows: 10 });
  await manager.stop('session-4', (event) => events.push(event));
  assert.ok(fake.calls.some((call) => call.args[0] === 'kill-session' && call.args.includes('awo-session-4')));
  assert.equal(events.at(-1).status, 'stopped');
});

test('invalid cwd and oversized or NUL input are rejected deterministically', async () => {
  const fake = fakeTmux();
  const manager = new TmuxTerminalManager({ executable: 'tmux', run: fake.run, pollMs: 0 });
  await assert.rejects(manager.start('session-5', { cwd: 'relative/path' }, () => {}), /terminal_cwd_invalid/);
  await manager.start('session-5', { cwd: '/tmp' }, () => {});
  await assert.rejects(manager.input('session-5', { text: 'x'.repeat(32769) }, () => {}), /terminal_input_too_large/);
  await assert.rejects(manager.input('session-5', { text: 'a\0b' }, () => {}), /terminal_input_nul_forbidden/);
});
