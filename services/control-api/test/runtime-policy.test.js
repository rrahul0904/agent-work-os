import assert from "node:assert/strict";
import test from "node:test";
import {
  EventWatchdogRouter,
  ProviderAccountGate,
  RUNTIME_POLICY_SCHEMA_VERSION,
  planProviderSwitch
} from "../src/runtime-policy.js";

test("event watchdogs react to explicit engine events without executing arbitrary commands", () => {
  const router = new EventWatchdogRouter();
  router.register({
    id: "account-limit",
    targetAgentId: "lead",
    eventTypes: ["account.limit"],
    accountId: "claude-primary",
    action: "request_human"
  });
  router.register({
    id: "busy-org",
    targetAgentId: "lead",
    eventTypes: ["agents.active_count"],
    organizationId: "org-a",
    minActiveAgents: 4
  });

  assert.deepEqual(
    router.dispatch({
      id: "evt-1",
      type: "account.limit",
      organizationId: "org-a",
      accountId: "claude-primary"
    }).map((receipt) => receipt.watchdogId),
    ["account-limit"]
  );
  assert.equal(
    router.dispatch({
      id: "evt-2",
      type: "agents.active_count",
      organizationId: "org-a",
      activeAgents: 3
    }).length,
    0
  );
  assert.deepEqual(
    router.dispatch({
      id: "evt-3",
      type: "agents.active_count",
      organizationId: "org-a",
      activeAgents: 4
    }).map((receipt) => receipt.watchdogId),
    ["busy-org"]
  );
});

test("watchdog delivery is idempotent within bounded event memory", () => {
  const router = new EventWatchdogRouter({ maxSeenEvents: 2 });
  router.register({ id: "mail", targetAgentId: "lead", eventTypes: ["mail.received"] });

  const event = { id: "evt-1", type: "mail.received", organizationId: "org-a" };
  assert.equal(router.dispatch(event).length, 1);
  assert.equal(router.dispatch(event).length, 0);

  router.dispatch({ id: "evt-2", type: "mail.received", organizationId: "org-a" });
  router.dispatch({ id: "evt-3", type: "mail.received", organizationId: "org-a" });
  assert.deepEqual(router.snapshot().retainedEventIds, ["evt-2", "evt-3"]);
  assert.equal(router.dispatch(event).length, 1);
});

test("account disable lets a running turn finish but blocks new turns", () => {
  const gate = new ProviderAccountGate([
    { id: "codex-main", provider: "codex", enabled: true }
  ]);

  assert.equal(gate.startTurn("codex-main", "turn-1").allowed, true);
  const disabled = gate.setEnabled("codex-main", false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.activeTurns, 1);
  assert.equal(disabled.acceptsNewTurns, false);
  assert.deepEqual(gate.startTurn("codex-main", "turn-2"), {
    allowed: false,
    accountId: "codex-main",
    turnId: "turn-2",
    reason: "account_disabled"
  });

  const finished = gate.finishTurn("codex-main", "turn-1");
  assert.equal(finished.activeTurns, 0);
  assert.equal(finished.acceptsNewTurns, false);
  assert.equal(finished.schemaVersion, RUNTIME_POLICY_SCHEMA_VERSION);
});

test("provider/account switches preserve an in-flight turn", () => {
  assert.deepEqual(planProviderSwitch({ runningTurn: false, targetAccountEnabled: true }), {
    decision: "apply_now",
    reason: "agent_idle"
  });
  assert.deepEqual(planProviderSwitch({ runningTurn: true, targetAccountEnabled: true }), {
    decision: "after_turn",
    reason: "preserve_running_turn"
  });
  assert.deepEqual(planProviderSwitch({ runningTurn: false, targetAccountEnabled: false }), {
    decision: "refuse",
    reason: "target_account_disabled"
  });
});

test("runtime policy rejects unsupported events and actions fail closed", () => {
  const router = new EventWatchdogRouter();
  assert.throws(
    () => router.register({ id: "bad", targetAgentId: "lead", eventTypes: ["shell.exec"] }),
    /unsupported watchdog event type/
  );
  assert.throws(
    () => router.register({
      id: "bad-action",
      targetAgentId: "lead",
      eventTypes: ["mail.received"],
      action: "run_shell"
    }),
    /unsupported watchdog action/
  );
  assert.throws(
    () => router.dispatch({ id: "evt-bad", type: "unknown.event" }),
    /unsupported runtime event type/
  );
});
