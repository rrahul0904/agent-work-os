/**
 * REA TOK P0 — pure, read-only agent attention and recovery-intent contracts.
 * Inputs are normalized, already-authorized Agent Work OS facts, not terminal text.
 * This module never launches processes, opens a terminal, notifies, or writes state.
 */
const PRIORITY = Object.freeze({
  needs_input: 0, failed: 1, disconnected: 2, unknown: 3,
  quiet: 4, working: 5, done: 6,
});
const TERMINAL = new Set(["completed", "done", "failed", "error"]);
const RECOVERABLE = new Set(["lost", "interrupted", "failed", "error"]);
const PROVIDERS = new Set(["codex", "claude-code"]);
const MAX_CLOCK_SKEW_MS = 5_000;

function assertIso(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new TypeError(`${name} must be an ISO timestamp`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${name} is invalid`);
  return time;
}
function observedAt(value, nowMs) {
  if (typeof value !== "string") return null;
  const n = Date.parse(value);
  if (!Number.isFinite(n) || n > nowMs + MAX_CLOCK_SKEW_MS) return null;
  return n;
}
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function optionsFor(options) {
  const nowMs = assertIso(options.now, "now");
  const staleAfterMs = options.staleAfterMs ?? 45_000;
  const quietAfterMs = options.quietAfterMs ?? 90_000;
  if (![staleAfterMs, quietAfterMs].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new TypeError("thresholds must be positive integers");
  }
  return { nowMs, staleAfterMs, quietAfterMs };
}
function assertSessions(sessions) {
  if (!Array.isArray(sessions)) throw new TypeError("sessions must be an array");
  const ids = new Set();
  for (const session of sessions) {
    if (!session || !nonempty(session.id) || ids.has(session.id)) {
      throw new TypeError("session ids must be unique, nonempty strings");
    }
    ids.add(session.id);
  }
}

/**
 * Status is not inferred from silence. Waiting requires a structured question
 * event ID; healthy working/quiet requires both a fresh daemon heartbeat
 * and a known agent activity timestamp.
 */
export function projectAgentAttention(sessions, options = {}) {
  assertSessions(sessions);
  const { nowMs, staleAfterMs, quietAfterMs } = optionsFor(options);
  const rows = sessions.map((session) => {
    const state = session.state;
    const heartbeat = observedAt(session.machineHeartbeatAt, nowMs);
    const lastEvent = observedAt(session.lastEventAt, nowMs);
    const proofEventId = nonempty(session.pendingQuestion?.eventId)
      ? session.pendingQuestion.eventId : null;
    let attention = "unknown", reason = "insufficient_evidence";

    if (state === "completed" || state === "done") {
      attention = "done"; reason = "terminal_state";
    } else if (state === "failed" || state === "error") {
      attention = "failed"; reason = "failure_state";
    } else if (proofEventId && !TERMINAL.has(state)) {
      attention = "needs_input"; reason = "explicit_pending_question";
    } else if (state === "lost" || state === "interrupted") {
      attention = "disconnected"; reason = "interrupted_or_lost";
    } else if (state === "running" || state === "working" || state === "starting") {
      if (heartbeat === null) {
        reason = "heartbeat_unverified";
      } else if (nowMs - heartbeat > staleAfterMs) {
        attention = "disconnected"; reason = "heartbeat_stale";
      } else if (lastEvent === null) {
        reason = "activity_unverified";
      } else if (nowMs - lastEvent >= quietAfterMs) {
        attention = "quiet"; reason = "verified_idle_interval";
      } else {
        attention = "working"; reason = "fresh_heartbeat_and_activity";
      }
    }
    return {
      id: session.id,
      machineId: nonempty(session.machineId) ? session.machineId : null,
      workItemId: nonempty(session.workItemId) ? session.workItemId : null,
      provider: nonempty(session.provider) ? session.provider : null,
      attention, reason,
      evidenceEventId: attention === "needs_input" ? proofEventId : null,
    };
  });
  rows.sort((a, b) => PRIORITY[a.attention] - PRIORITY[b.attention] || a.id.localeCompare(b.id));
  return {
    schema: "agent-attention/v1",
    asOf: options.now,
    counts: Object.fromEntries(Object.keys(PRIORITY).map((status) => [
      status, rows.filter((row) => row.attention === status).length,
    ])),
    sessions: rows,
  };
}

function safeAbsoluteCwd(value) {
  if (!nonempty(value) || /[\0\r\n]/.test(value)) return false;
  if (!/^(?:\/(?!\/)|[A-Za-z]:[\\/])/.test(value)) return false;
  return !value.split(/[\\/]/).includes("..");
}

/**
 * Produces NON-EXECUTABLE intents for explicit human approval. It deliberately
 * refuses active sessions and missing/stale runtime evidence. The privileged
 * daemon must independently recheck policy, worktree, identity, and health.
 */
export function createResumeIntents(sessions, machines, options = {}) {
  assertSessions(sessions);
  if (!Array.isArray(machines) || !Array.isArray(options.sessionIds)) {
    throw new TypeError("machines and explicit sessionIds are required");
  }
  const { nowMs, staleAfterMs } = optionsFor(options);
  const wanted = new Set(options.sessionIds);
  if (wanted.size !== options.sessionIds.length || [...wanted].some((id) => !nonempty(id))) {
    throw new TypeError("sessionIds must be unique nonempty strings");
  }
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const machineById = new Map(machines.map((m) => [m.id, m]));
  if (machineById.size !== machines.length) throw new TypeError("duplicate machine ids");
  const intents = [], refused = [];
  for (const id of [...wanted].sort()) {
    const s = sessionById.get(id);
    let reason = null;
    const m = s && machineById.get(s.machineId);
    if (!s) reason = "session_not_found";
    else if (!RECOVERABLE.has(s.state)) reason = "not_confirmed_recoverable";
    else if (!PROVIDERS.has(s.provider)) reason = "unsupported_provider";
    else if (!nonempty(s.nativeSessionId) || !/^[A-Za-z0-9_-]{8,128}$/.test(s.nativeSessionId)) {
      reason = "native_session_unverified";
    } else if (!safeAbsoluteCwd(s.cwd)) reason = "cwd_unverified";
    else if (!m || !Array.isArray(m.providers) || !m.providers.includes(s.provider)) {
      reason = "adapter_unavailable";
    } else {
      const heartbeat = observedAt(m.lastHeartbeatAt, nowMs);
      if (heartbeat === null || nowMs - heartbeat > staleAfterMs) reason = "machine_not_fresh";
    }
    if (reason) {
      refused.push({ sessionId: id, reason });
    } else {
      intents.push({
        schema: "resume-intent/v1", sessionId: s.id, machineId: s.machineId,
        provider: s.provider, nativeSessionId: s.nativeSessionId,
        cwd: s.cwd, workItemId: nonempty(s.workItemId) ? s.workItemId : null,
        requiresHumanApproval: true, executable: false,
      });
    }
  }
  return { schema: "resume-plan/v1", asOf: options.now, intents, refused };
}
