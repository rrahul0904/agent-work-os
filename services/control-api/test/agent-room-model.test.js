import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySession, eventPresentation, machineGroups, sortSessions, summarizeRoom } from '../../../apps/web/public/agent-room-model.js';

test('classifies normalized session states into glanceable operator states', () => {
  assert.equal(classifySession({ status:'running' }).state, 'working');
  assert.equal(classifySession({ status:'queued' }).state, 'waiting');
  assert.equal(classifySession({ status:'completed' }).state, 'done');
  assert.equal(classifySession({ status:'failed' }).state, 'blocked');
});

test('surfaces approval-like stalls while a session still reports running', () => {
  const result = classifySession({
    status:'running',
    events:[{ kind:'status', status:'running' }, { kind:'log', stream:'stdout', text:'Waiting for deployment approval before promotion.' }]
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.label, 'Needs approval');
  assert.equal(result.attention.severity, 'approval');
});

test('errors win over nominal running state', () => {
  const result = classifySession({ status:'running', events:[{ kind:'status', status:'running' }, { kind:'error', message:'test suite failed' }] });
  assert.equal(result.state, 'blocked');
  assert.equal(result.attention.severity, 'error');
});

test('a later terminal success clears stale historical attention', () => {
  const result = classifySession({
    status:'completed',
    events:[
      { kind:'status', status:'running' },
      { kind:'error', message:'first attempt failed' },
      { kind:'status', status:'running', message:'repair started' },
      { kind:'tool', name:'test', phase:'completed', payload:{ failed:0 } },
      { kind:'status', status:'completed' }
    ]
  });
  assert.equal(result.state, 'done');
  assert.equal(result.attention, null);
});

test('summarizes and sorts blocked work ahead of active and completed work', () => {
  const sessions = [
    { id:'done', status:'completed', updatedAt:'2026-10-10T10:00:00Z' },
    { id:'run', status:'running', updatedAt:'2026-10-10T10:01:00Z' },
    { id:'fail', status:'failed', updatedAt:'2026-10-10T09:59:00Z' },
    { id:'queue', status:'queued', updatedAt:'2026-10-10T10:02:00Z' }
  ];
  assert.deepEqual(summarizeRoom(sessions), { working:1, waiting:1, blocked:1, done:1, total:4 });
  assert.deepEqual(sortSessions(sessions).map(s => s.id), ['fail','run','queue','done']);
});

test('groups sessions by executor without inventing parent-child topology', () => {
  const groups = machineGroups([
    { id:'a', machineId:'m1', status:'running' },
    { id:'b', machineId:'m2', status:'queued' }
  ], [
    { id:'m1', name:'Local Mac', status:'online' },
    { id:'m2', name:'CI', status:'online' }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].machine.name, 'CI');
  assert.equal(groups[1].machine.name, 'Local Mac');
});

test('presents tool payloads deterministically for the shared-screen view', () => {
  const view = eventPresentation({ kind:'tool', name:'test', phase:'completed', payload:{ failed:1, passed:9 } });
  assert.equal(view.title, 'test · completed');
  assert.equal(view.tone, 'test');
  assert.match(view.body, /"failed": 1/);
});
