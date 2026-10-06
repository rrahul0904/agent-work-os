import test from "node:test";
import assert from "node:assert/strict";
import {
  applySessionObservation,
  createFleetSession,
  deriveSessionAttention,
  markReplayComplete,
  verifyFleetSession
} from "../src/fleet-state.js";

function base() {
  return createFleetSession({
    sessionId: "session:alpha",
    executionId: "exec:1",
    workspaceId: "ws:product",
    projectId: "project:agent-work-os",
    machineId: "machine:laptop",
    agentKind: "codex",
    at: "2026-10-06T18:00:00.000Z"
  });
}

test("transport disconnect never fabricates a stopped execution", () => {
  let session = base();
  session = applySessionObservation(session, {
    transportState: "connected",
    runtimeState: "running",
    eventSequence: 1,
    at: "2026-10-06T18:00:01.000Z"
  });
  session = applySessionObservation(session, {
    transportState: "disconnected",
    at: "2026-10-06T18:00:02.000Z"
  });
  assert.equal(session.executionState, "running");
  assert.equal(session.transportState, "disconnected");
  assert.equal(deriveSessionAttention(session), "reconnect_required");
});

test("reconnect detects missing events and replays to completed truth", () => {
  let session = base();
  session = applySessionObservation(session, {
    transportState: "connected",
    runtimeState: "running",
    eventSequence: 3,
    at: "2026-10-06T18:00:01.000Z"
  });
  assert.equal(session.replayRequiredFrom, 1);
  session = markReplayComplete(session, { throughSequence: 3, at: "2026-10-06T18:00:02.000Z" });
  session = applySessionObservation(session, {
    transportState: "disconnected",
    at: "2026-10-06T18:00:03.000Z"
  });
  session = applySessionObservation(session, {
    transportState: "connected",
    runtimeState: "completed",
    eventSequence: 7,
    at: "2026-10-06T18:00:04.000Z"
  });
  assert.equal(session.executionState, "completed");
  assert.equal(session.replayRequiredFrom, 4);
  assert.equal(deriveSessionAttention(session), "replay_required");
  session = markReplayComplete(session, { throughSequence: 7, at: "2026-10-06T18:00:05.000Z" });
  assert.equal(deriveSessionAttention(session), "none");
});

test("event sequence regression is refused", () => {
  let session = base();
  session = applySessionObservation(session, { runtimeState: "running", eventSequence: 2 });
  assert.throws(() => applySessionObservation(session, { eventSequence: 1 }), /fleet_event_sequence_regression/);
});

test("terminal state is sticky for the same execution identity", () => {
  let session = base();
  session = applySessionObservation(session, { runtimeState: "running", eventSequence: 1 });
  session = applySessionObservation(session, { runtimeState: "completed", eventSequence: 2 });
  assert.throws(() => applySessionObservation(session, { runtimeState: "running", eventSequence: 3 }), /fleet_terminal_state_sticky:completed/);
});

test("typed identities prevent project, machine and session confusion", () => {
  assert.throws(() => createFleetSession({
    sessionId: "machine:oops",
    executionId: "exec:1",
    workspaceId: "ws:w",
    projectId: "project:p",
    machineId: "machine:m",
    agentKind: "codex"
  }), /fleet_sessionId_invalid/);
});

test("waiting states derive attention without changing execution truth", () => {
  let session = base();
  session = applySessionObservation(session, { runtimeState: "running", eventSequence: 1 });
  session = applySessionObservation(session, { runtimeState: "waiting_for_approval", eventSequence: 2 });
  assert.equal(deriveSessionAttention(session), "approval_required");
  assert.equal(verifyFleetSession(session).valid, true);
});
