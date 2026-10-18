import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRemoteAccess } from '../src/remote-access-policy.js';

const NOW = Date.parse('2026-10-18T18:00:00Z');
const FINGERPRINT = 'SHA256:' + 'A'.repeat(43);
const DIFFERENT = 'SHA256:' + 'B'.repeat(43);
const ACTIONS = ['ssh:connect', 'ssh:exec', 'sftp:read', 'sftp:write', 'ssh:tunnel'];

function fixture(action = 'ssh:connect', resource = {}) {
  const intent = {
    requestId: 'req-1',
    principalId: 'operator-1',
    hostId: 'synthetic-host-1',
    action,
    observedFingerprint: FINGERPRINT,
    ...resource
  };
  const policy = {
    hosts: {
      'synthetic-host-1': {
        enrolled: true,
        trustVerified: true,
        fingerprint: FINGERPRINT,
        actions: [...ACTIONS],
        allowedExecutables: ['uptime'],
        commands: { 'read-status': { argv: ['uptime', '-p'] } },
        sftpRoots: ['workspace'],
        tunnels: { 'dev-port': { endpoint: 'localhost:3000' } }
      }
    },
    grants: ACTIONS.map((name) => ({
      principalId: 'operator-1', hostId: 'synthetic-host-1',
      action: name, expiresAtMs: NOW + 60_000
    })),
    approvals: []
  };
  return { intent, policy };
}

function approve(intent, policy) {
  const resourceId = intent.commandId ?? intent.path ?? intent.tunnelId ?? null;
  policy.approvals.push({
    requestId: intent.requestId, principalId: intent.principalId,
    hostId: intent.hostId, action: intent.action, resourceId,
    status: 'approved', expiresAtMs: NOW + 60_000
  });
}

test('allows an enrolled synthetic host with exact verified key and live grant', () => {
  const { intent, policy } = fixture();
  const result = evaluateRemoteAccess(intent, policy, NOW);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'authorized');
});

test('denies missing host, unverified host and changed SSH fingerprint', () => {
  const { intent, policy } = fixture();
  intent.hostId = 'unlisted-host';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'unknown_host');
  intent.hostId = 'synthetic-host-1';
  policy.hosts[intent.hostId].trustVerified = false;
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'host_not_enrolled');
  policy.hosts[intent.hostId].trustVerified = true;
  intent.observedFingerprint = DIFFERENT;
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'host_key_changed');
});

test('denies missing grant and expired grants at exact expiry boundary', () => {
  const { intent, policy } = fixture();
  policy.grants = [];
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'grant_missing_or_expired');
  policy.grants = [{
    principalId: 'operator-1', hostId: 'synthetic-host-1',
    action: 'ssh:connect', expiresAtMs: NOW
  }];
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, false);
});

test('rejects unknown principal and host actions not allowed', () => {
  const { intent, policy } = fixture();
  intent.principalId = 'intruder';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, false);
  intent.principalId = 'operator-1';
  policy.hosts[intent.hostId].actions = ['sftp:read'];
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'host_action_denied');
});

test('remote execution is a catalog reference, not an arbitrary shell command', () => {
  const { intent, policy } = fixture('ssh:exec', { commandId: 'read-status' });
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
  approve(intent, policy);
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, true);
  intent.argv = ['sh', '-c', 'rm -rf /'];
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'unexpected_intent_field');
  delete intent.argv;
  intent.commandId = 'invented-command';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'command_not_allowlisted');
});

test('rejects unallowlisted executable even with a predeclared command', () => {
  const { intent, policy } = fixture('ssh:exec', { commandId: 'read-status' });
  approve(intent, policy);
  policy.hosts[intent.hostId].commands['read-status'].argv = ['sh', '-c', 'echo test'];
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'command_policy_invalid');
});

test('allows scoped SFTP read and denies traversal, absolute paths and control bytes', () => {
  const { intent, policy } = fixture('sftp:read', { path: 'workspace/reports/demo.txt' });
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, true);
  for (const path of [
    '../workspace/demo.txt', '/etc/passwd', 'workspace/../.ssh/id_rsa',
    'workspace//report', 'workspace\\report', 'other/report',
    'workspace/file\u0000name', 'workspace/./report'
  ]) {
    intent.path = path;
    assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'sftp_path_denied', path);
  }
});

test('requires a resource-bound, unexpired approval for SFTP writes', () => {
  const { intent, policy } = fixture('sftp:write', { path: 'workspace/export.csv' });
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
  approve(intent, policy);
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, true);
  intent.path = 'workspace/other.csv';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
  intent.path = 'workspace/export.csv';
  policy.approvals[0].expiresAtMs = NOW;
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, false);
});

test('denies approval replay under different request ID or principal', () => {
  const { intent, policy } = fixture('ssh:exec', { commandId: 'read-status' });
  approve(intent, policy);
  intent.requestId = 'req-2';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
  intent.requestId = 'req-1';
  intent.principalId = 'intruder';
  policy.grants.push({
    principalId: 'intruder', hostId: intent.hostId, action: intent.action,
    expiresAtMs: NOW + 60_000
  });
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
});

test('tunnel must be predeclared and explicitly approved', () => {
  const { intent, policy } = fixture('ssh:tunnel', { tunnelId: 'dev-port' });
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'approval_missing_or_expired');
  approve(intent, policy);
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).allowed, true);
  intent.tunnelId = 'unknown';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'tunnel_not_allowlisted');
});

test('rejects secret-bearing/unrecognized intent fields and unexpected resources', () => {
  const { intent, policy } = fixture();
  intent.privateKey = 'very-secret';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'unexpected_intent_field');
  delete intent.privateKey;
  intent.path = 'workspace/file';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'unexpected_resource');
});

test('receipts include no fingerprint, path, command arguments, or credentials', () => {
  const { intent, policy } = fixture('ssh:exec', { commandId: 'read-status' });
  approve(intent, policy);
  const receipt = evaluateRemoteAccess(intent, policy, NOW).receipt;
  assert.deepEqual(Object.keys(receipt).sort(), [
    'action', 'allowed', 'evaluatedAtMs', 'hostId', 'principalId',
    'reason', 'requestId'
  ].sort());
  const serialized = JSON.stringify(receipt);
  for (const sensitive of [FINGERPRINT, 'uptime', 'read-status', 'privateKey']) {
    assert.equal(serialized.includes(sensitive), false, sensitive);
  }
});

test('denies malformed inputs and invalid policy evaluation clock', () => {
  assert.equal(evaluateRemoteAccess(null, {}, NOW).allowed, false);
  assert.equal(evaluateRemoteAccess({}, {}, NOW).allowed, false);
  const { intent, policy } = fixture();
  assert.equal(evaluateRemoteAccess(intent, policy, Number.NaN).reason, 'clock_invalid');
  assert.equal(evaluateRemoteAccess(intent, policy, -1).allowed, false);
  intent.observedFingerprint = 'SHA256:too-short';
  assert.equal(evaluateRemoteAccess(intent, policy, NOW).reason, 'invalid_intent');
});
