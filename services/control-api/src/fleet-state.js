export const FLEET_STATUS_VERSION = "fleet-status/v1";
export const TRANSPORT_STATES = Object.freeze(["connected", "degraded", "disconnected"]);
export const EXECUTION_STATES = Object.freeze([
  "queued",
  "starting",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "blocked",
  "interrupted",
  "failed",
  "completed",
  "cancelled"
]);

const TRANSPORT = new Set(TRANSPORT_STATES);
const EXECUTION = new Set(EXECUTION_STATES);
const TERMINAL = new Set(["failed", "completed", "cancelled"]);
const ACTIVE = new Set(["starting", "running", "waiting_for_input", "waiting_for_approval", "blocked"]);
const ID_PATTERNS = Object.freeze({
  workspaceId: /^ws:[A-Za-z0-9._-]+$/,
  projectId: /^project:[A-Za-z0-9._-]+$/,
  machineId: /^machine:[A-Za-z0-9._-]+$/,
  sessionId: /^session:[A-Za-z0-9._-]+$/,
  executionId: /^exec:[A-Za-z0-9._-]+$/
});

const EXECUTION_TRANSITIONS = Object.freeze({
  queued: new Set(["starting", "running", "cancelled"]),
  starting: new Set(["running", "interrupted", "failed", "cancelled"]),
  running: new Set(["waiting_for_input", "waiting_for_approval", "blocked", "interrupted", "failed", "completed", "cancelled"]),
  waiting_for_input: new Set(["running", "interrupted", "failed", "cancelled"]),
  waiting_for_approval: new Set(["running", "interrupted", "failed", "cancelled"]),
  blocked: new Set(["running", "interrupted", "failed", "cancelled"]),
  interrupted: new Set(["starting", "running", "cancelled"]),
  failed: new Set(),
  completed: new Set(),
  cancelled: new Set()
});

export function createFleetSession({
  sessionId,
  executionId,
  workspaceId,
  projectId,
  machineId,
  agentKind,
  at = new Date().toISOString()
}) {
  assertTypedId("sessionId", sessionId);
  assertTypedId("executionId", executionId);
  assertTypedId("workspaceId", workspaceId);
  assertTypedId("projectId", projectId);
  assertTypedId("machineId", machineId);
  if (typeof agentKind !== "string" || !agentKind.trim()) throw new Error("fleet_agent_kind_required");
  assertTimestamp(at);
  return {
    version: FLEET_STATUS_VERSION,
    sessionId,
    executionId,
    workspaceId,
    projectId,
    machineId,
    agentKind: agentKind.trim(),
    transportState: "disconnected",
    executionState: "queued",
    lastEventSequence: 0,
    replayRequiredFrom: null,
    lastObservedAt: at,
    updatedAt: at
  };
}

export function applySessionObservation(session, observation = {}) {
  assertValidSession(session);
  if (!isPlainObject(observation)) throw new Error("fleet_observation_invalid");
  const at = observation.at ?? new Date().toISOString();
  assertTimestamp(at);

  if (observation.executionId !== undefined && observation.executionId !== session.executionId) {
    throw new Error("fleet_execution_identity_mismatch");
  }

  const next = structuredClone(session);

  if (observation.transportState !== undefined) {
    if (!TRANSPORT.has(observation.transportState)) {
      throw new Error(`fleet_transport_state_invalid:${String(observation.transportState)}`);
    }
    next.transportState = observation.transportState;
  }

  if (observation.eventSequence !== undefined) {
    if (!Number.isInteger(observation.eventSequence) || observation.eventSequence < 0) {
      throw new Error("fleet_event_sequence_invalid");
    }
    if (observation.eventSequence < next.lastEventSequence) {
      throw new Error("fleet_event_sequence_regression");
    }
    if (observation.eventSequence > next.lastEventSequence + 1 && next.replayRequiredFrom === null) {
      next.replayRequiredFrom = next.lastEventSequence + 1;
    }
    next.lastEventSequence = observation.eventSequence;
  }

  if (observation.runtimeState !== undefined) {
    if (!EXECUTION.has(observation.runtimeState)) {
      throw new Error(`fleet_execution_state_invalid:${String(observation.runtimeState)}`);
    }
    const from = next.executionState;
    const to = observation.runtimeState;
    if (from !== to) {
      if (TERMINAL.has(from)) throw new Error(`fleet_terminal_state_sticky:${from}`);
      if (!EXECUTION_TRANSITIONS[from]?.has(to)) {
        throw new Error(`fleet_execution_transition_refused:${from}->${to}`);
      }
      next.executionState = to;
    }
  }

  next.lastObservedAt = at;
  next.updatedAt = at;
  return next;
}

export function markReplayComplete(session, { throughSequence, at = new Date().toISOString() }) {
  assertValidSession(session);
  assertTimestamp(at);
  if (!Number.isInteger(throughSequence) || throughSequence < 0) throw new Error("fleet_replay_sequence_invalid");
  if (throughSequence < session.lastEventSequence) throw new Error("fleet_replay_incomplete");
  const next = structuredClone(session);
  next.replayRequiredFrom = null;
  next.updatedAt = at;
  return next;
}

export function deriveSessionAttention(session) {
  assertValidSession(session);
  if (session.executionState === "waiting_for_input") return "input_required";
  if (session.executionState === "waiting_for_approval") return "approval_required";
  if (session.replayRequiredFrom !== null) return "replay_required";
  if (session.transportState === "disconnected" && ACTIVE.has(session.executionState)) return "reconnect_required";
  return "none";
}

export function verifyFleetSession(session) {
  const errors = [];
  if (!isPlainObject(session)) return { valid: false, errors: ["fleet_session_invalid"] };
  if (session.version !== FLEET_STATUS_VERSION) errors.push("fleet_version_invalid");
  for (const key of Object.keys(ID_PATTERNS)) {
    if (!ID_PATTERNS[key].test(session[key] ?? "")) errors.push(`fleet_${key}_invalid`);
  }
  if (typeof session.agentKind !== "string" || !session.agentKind.trim()) errors.push("fleet_agent_kind_invalid");
  if (!TRANSPORT.has(session.transportState)) errors.push("fleet_transport_state_invalid");
  if (!EXECUTION.has(session.executionState)) errors.push("fleet_execution_state_invalid");
  if (!Number.isInteger(session.lastEventSequence) || session.lastEventSequence < 0) errors.push("fleet_event_sequence_invalid");
  if (session.replayRequiredFrom !== null && (!Number.isInteger(session.replayRequiredFrom) || session.replayRequiredFrom < 1 || session.replayRequiredFrom > session.lastEventSequence)) {
    errors.push("fleet_replay_required_from_invalid");
  }
  for (const key of ["lastObservedAt", "updatedAt"]) {
    if (typeof session[key] !== "string" || Number.isNaN(Date.parse(session[key]))) errors.push(`fleet_${key}_invalid`);
  }
  return { valid: errors.length === 0, errors };
}

function assertValidSession(session) {
  const result = verifyFleetSession(session);
  if (!result.valid) throw new Error(`fleet_session_snapshot_invalid:${result.errors.join(",")}`);
}

function assertTypedId(kind, value) {
  if (!ID_PATTERNS[kind].test(value ?? "")) throw new Error(`fleet_${kind}_invalid`);
}

function assertTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("fleet_timestamp_invalid");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
