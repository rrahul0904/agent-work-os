/**
 * Read-only, identity-free projection of CodexBar dashboard schema v1.
 * CodexBar is an optional third-party source; this module does not read credentials,
 * invoke CodexBar, contact providers, or authorize agent routing.
 */

const LEVELS = new Set(["ok", "warning", "critical", "unknown"]);
const MAX_FUTURE_SKEW_MS = 60_000;

function parseTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function projectWindow(window) {
  if (!window || typeof window !== "object" || Array.isArray(window)) return null;
  const remaining = window.remainingPercent;
  const valid = typeof remaining === "number" && Number.isFinite(remaining) && remaining >= 0 && remaining <= 100;
  return {
    kind: typeof window.kind === "string" ? window.kind : "unknown",
    remainingPercent: valid ? remaining : null,
    resetAt: parseTime(window.resetAt) === null ? null : new Date(Date.parse(window.resetAt)).toISOString(),
    observation: !valid ? "unknown" : remaining === 0 ? "reported_exhausted" : remaining <= 10 ? "reported_low" : "reported_available",
    idle: window.idle === true,
  };
}

/** Return a display-only snapshot with uncertainty retained. Never use for autonomous spend/dispatch. */
export function projectCodexBarDashboard(snapshot, { now = Date.now() } = {}) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.providers)) {
    throw new TypeError("CodexBar dashboard schema-v1 snapshot required");
  }
  if (!Number.isFinite(now)) throw new TypeError("now must be a finite Unix-millisecond timestamp");

  const collectedMs = parseTime(snapshot.generatedAt);
  const staleAfterSeconds = snapshot.staleAfterSeconds;
  const ttlValid = Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0 && staleAfterSeconds <= 86_400;
  const output = [];
  for (const provider of snapshot.providers) {
    if (!provider || typeof provider.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(provider.id)) continue;
    const observedMs = parseTime(provider.updatedAt);
    const tooFuture = (timestamp) => timestamp !== null && timestamp > now + MAX_FUTURE_SKEW_MS;
    const freshness = !ttlValid || collectedMs === null || observedMs === null || tooFuture(collectedMs) || tooFuture(observedMs)
      ? "unknown"
      : now - Math.min(collectedMs, observedMs) > staleAfterSeconds * 1000 ? "stale" : "fresh";
    const statusLevel = LEVELS.has(provider.status?.level) ? provider.status.level : "unknown";
    const windows = (Array.isArray(provider.windows) ? provider.windows : []).map(projectWindow).filter(Boolean);
    const active = windows.filter((window) => !window.idle);
    let observation = "unknown";
    if (provider.enabled === false) observation = "disabled";
    else if (freshness !== "fresh" || provider.error) observation = "unknown";
    else if (statusLevel === "critical") observation = "incident";
    else if (active.some((window) => window.observation === "reported_exhausted")) observation = "reported_exhausted";
    else if (statusLevel === "warning" || active.some((window) => window.observation === "reported_low")) observation = "caution";
    else if (statusLevel === "ok" && active.length > 0 && active.every((window) => window.observation === "reported_available")) observation = "reported_available";

    output.push({
      providerId: provider.id,
      evidenceType: "third_party_observation",
      snapshotAt: collectedMs === null ? null : new Date(collectedMs).toISOString(),
      observedAt: observedMs === null ? null : new Date(observedMs).toISOString(),
      freshness,
      providerStatus: statusLevel,
      observation,
      windows,
    });
  }
  return { schemaVersion: 1, source: "codexbar-dashboard-v1", providers: output };
}
