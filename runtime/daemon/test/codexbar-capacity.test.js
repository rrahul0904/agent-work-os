import assert from "node:assert/strict";
import test from "node:test";
import { projectCodexBarDashboard } from "../src/codexbar-capacity.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const make = (provider = {}) => ({
  schemaVersion: 1, generatedAt: "2026-10-20T11:59:50Z", staleAfterSeconds: 180,
  providers: [{
    id: "codex", enabled: true, source: "oauth", updatedAt: "2026-10-20T11:59:40Z",
    identity: { accountEmail: "sensitive@example.com", plan: "private" },
    status: { level: "ok" }, error: null,
    windows: [{ kind: "session", remainingPercent: 73, resetAt: "2026-10-20T16:00:00Z" }],
    ...provider,
  }],
});
const project = (s) => projectCodexBarDashboard(s, { now: NOW }).providers[0];

test("fresh provider observation is informational, identity-free and deterministic", () => {
  const input = make();
  const first = project(input);
  assert.equal(first.observation, "reported_available");
  assert.equal(first.windows[0].remainingPercent, 73);
  assert.equal(first.freshness, "fresh");
  assert.equal(JSON.stringify(first).includes("sensitive@example.com"), false);
  assert.deepEqual(first, project(input));
});

test("missing, invalid and empty quota windows remain unknown, not zero", () => {
  assert.equal(project(make({ windows: [] })).observation, "unknown");
  assert.equal(project(make({ windows: [{ kind: "session", remainingPercent: "0" }] })).observation, "unknown");
  assert.equal(project(make({ windows: [{ kind: "session", remainingPercent: -1 }] })).windows[0].remainingPercent, null);
  assert.equal(project(make({ windows: [{ kind: "session", remainingPercent: 50, resetAt: "n/a" }] })).windows[0].resetAt, null);
});

test("reported exhaustion, low quotas, incidents, and disabled providers stay distinct", () => {
  assert.equal(project(make({ windows: [{ kind: "session", remainingPercent: 0 }] })).observation, "reported_exhausted");
  assert.equal(project(make({ windows: [{ kind: "session", remainingPercent: 8 }] })).observation, "caution");
  assert.equal(project(make({ status: { level: "critical" } })).observation, "incident");
  assert.equal(project(make({ enabled: false })).observation, "disabled");
});

test("stale or future timestamps and provider errors never count as capacity", () => {
  assert.equal(project(make({ updatedAt: "2026-10-20T11:50:00Z" })).freshness, "stale");
  assert.equal(project(make({ updatedAt: "2026-10-20T11:50:00Z" })).observation, "unknown");
  const future = make(); future.generatedAt = "2026-10-20T12:05:00Z";
  assert.equal(project(future).freshness, "unknown");
  assert.equal(project(make({ error: "auth expired" })).observation, "unknown");
  assert.equal(project(make({ updatedAt: null })).freshness, "unknown");
});

test("active selected account is not mixed with optional inactive accounts", () => {
  const selected = make({ accounts: [{ id: "other", active: false, windows: [{ kind: "weekly", remainingPercent: 0 }] }] });
  assert.equal(project(selected).observation, "reported_available");
  assert.equal(JSON.stringify(project(selected)).includes("other"), false);
});

test("invalid schema and unsupported providers are rejected or skipped", () => {
  assert.throws(() => projectCodexBarDashboard({ schemaVersion: 2, providers: [] }), /schema-v1/);
  assert.equal(projectCodexBarDashboard(make({ id: "../secret" }), { now: NOW }).providers.length, 0);
});
