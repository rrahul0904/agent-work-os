// Independent, side-effect-free Agent Work OS policy contract.
// REA evidence: issue #297. This module does not open sockets or execute commands.

const ACTIONS = new Set(['ssh:connect', 'ssh:exec', 'sftp:read', 'sftp:write', 'ssh:tunnel']);
const HIGH_IMPACT = new Set(['ssh:exec', 'sftp:write', 'ssh:tunnel']);
const INTENT_KEYS = new Set([
  'requestId', 'principalId', 'hostId', 'action', 'observedFingerprint',
  'commandId', 'path', 'tunnelId'
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}$/;
const EXECUTABLE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function own(record, key) {
  return record !== null && typeof record === 'object' &&
    !Array.isArray(record) && Object.hasOwn(record, key);
}

function granted(entries, match, nowMs) {
  return Array.isArray(entries) && entries.some((entry) =>
    entry && typeof entry === 'object' &&
    Object.entries(match).every(([key, value]) => entry[key] === value) &&
    Number.isFinite(entry.expiresAtMs) && entry.expiresAtMs > nowMs
  );
}

function safeRelativeSftpPath(path, roots) {
  if (typeof path !== 'string' || path.length < 3 || path.length > 4096 ||
      path.startsWith('/') || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) return false;
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
  return Array.isArray(roots) && roots.includes(segments[0]);
}

/**
 * Evaluate a remote-access intent against trusted daemon-owned policy.
 *
 * This is a preliminary authorization contract, NOT an SSH/SFTP client, a
 * sandbox, or a replacement for provider-side verification at time of use.
 * Nothing in the caller's intent may define a command, tunnel endpoint, grant
 * or approval. Command argv and tunnel destinations live in trusted policy.
 * The result intentionally omits command arguments, paths and fingerprints.
 */
export function evaluateRemoteAccess(intent, policy = {}, nowMs = Date.now()) {
  const base = {
    requestId: validId(intent?.requestId) ? intent.requestId : null,
    principalId: validId(intent?.principalId) ? intent.principalId : null,
    hostId: validId(intent?.hostId) ? intent.hostId : null,
    action: ACTIONS.has(intent?.action) ? intent.action : null,
    evaluatedAtMs: Number.isFinite(nowMs) ? nowMs : null
  };
  const decision = (allowed, reason) => ({
    allowed, reason, receipt: { ...base, allowed, reason }
  });
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return decision(false, 'clock_invalid');
  if (!intent || typeof intent !== 'object' || Array.isArray(intent) ||
      !policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return decision(false, 'invalid_request');
  }
  if (Object.keys(intent).some((key) => !INTENT_KEYS.has(key))) {
    return decision(false, 'unexpected_intent_field');
  }
  if (!base.requestId || !base.principalId || !base.hostId || !base.action ||
      !FINGERPRINT_PATTERN.test(intent.observedFingerprint ?? '')) {
    return decision(false, 'invalid_intent');
  }
  if (!own(policy.hosts, base.hostId)) return decision(false, 'unknown_host');
  const host = policy.hosts[base.hostId];
  if (!host || host.enrolled !== true || host.trustVerified !== true ||
      !FINGERPRINT_PATTERN.test(host.fingerprint ?? '')) {
    return decision(false, 'host_not_enrolled');
  }
  if (intent.observedFingerprint !== host.fingerprint) {
    return decision(false, 'host_key_changed');
  }
  if (!Array.isArray(host.actions) || !host.actions.includes(base.action)) {
    return decision(false, 'host_action_denied');
  }
  if (!granted(policy.grants, {
    principalId: base.principalId, hostId: base.hostId, action: base.action
  }, nowMs)) return decision(false, 'grant_missing_or_expired');

  let resourceId = null;
  if (base.action === 'ssh:exec') {
    if (!validId(intent.commandId) || intent.path !== undefined || intent.tunnelId !== undefined) {
      return decision(false, 'command_invalid');
    }
    if (!own(host.commands, intent.commandId)) return decision(false, 'command_not_allowlisted');
    const argv = host.commands[intent.commandId]?.argv;
    if (!Array.isArray(argv) || argv.length === 0 || argv.length > 24 ||
        !EXECUTABLE_PATTERN.test(argv[0] ?? '') ||
        !Array.isArray(host.allowedExecutables) || !host.allowedExecutables.includes(argv[0]) ||
        argv.some((arg) => typeof arg !== 'string' || !arg.length ||
          arg.length > 1024 || /[\x00-\x1f\x7f]/.test(arg))) {
      return decision(false, 'command_policy_invalid');
    }
    resourceId = intent.commandId;
  } else if (base.action === 'sftp:read' || base.action === 'sftp:write') {
    if (intent.commandId !== undefined || intent.tunnelId !== undefined ||
        !safeRelativeSftpPath(intent.path, host.sftpRoots)) {
      return decision(false, 'sftp_path_denied');
    }
    resourceId = intent.path;
  } else if (base.action === 'ssh:tunnel') {
    if (!validId(intent.tunnelId) || intent.path !== undefined ||
        intent.commandId !== undefined || !own(host.tunnels, intent.tunnelId)) {
      return decision(false, 'tunnel_not_allowlisted');
    }
    resourceId = intent.tunnelId;
  } else if (intent.commandId !== undefined || intent.path !== undefined ||
             intent.tunnelId !== undefined) {
    return decision(false, 'unexpected_resource');
  }

  if (HIGH_IMPACT.has(base.action) && !granted(
    policy.approvals,
    {
      requestId: base.requestId, principalId: base.principalId,
      hostId: base.hostId, action: base.action,
      resourceId, status: 'approved'
    },
    nowMs
  )) return decision(false, 'approval_missing_or_expired');

  return decision(true, 'authorized');
}
