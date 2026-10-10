export const RUNTIME_POLICY_SCHEMA_VERSION = 1;

const WATCHDOG_EVENT_TYPES = new Set([
  "turn.completed",
  "mail.received",
  "ticket.changed",
  "account.limit",
  "agents.active_count"
]);

export class EventWatchdogRouter {
  constructor({ maxSeenEvents = 1024 } = {}) {
    if (!Number.isInteger(maxSeenEvents) || maxSeenEvents < 1) {
      throw new Error("maxSeenEvents must be a positive integer");
    }
    this.maxSeenEvents = maxSeenEvents;
    this.rules = new Map();
    this.seen = new Set();
    this.seenOrder = [];
  }

  register(rule) {
    const normalized = normalizeWatchdog(rule);
    if (this.rules.has(normalized.id)) throw new Error(`duplicate watchdog id: ${normalized.id}`);
    this.rules.set(normalized.id, normalized);
    return normalized;
  }

  remove(watchdogId) {
    return this.rules.delete(watchdogId);
  }

  dispatch(event) {
    const normalized = normalizeRuntimeEvent(event);
    if (this.seen.has(normalized.id)) return Object.freeze([]);
    this.remember(normalized.id);

    const receipts = [...this.rules.values()]
      .filter((rule) => watchdogMatches(rule, normalized))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((rule) => Object.freeze({
        schemaVersion: RUNTIME_POLICY_SCHEMA_VERSION,
        watchdogId: rule.id,
        eventId: normalized.id,
        eventType: normalized.type,
        action: rule.action,
        targetAgentId: rule.targetAgentId,
        organizationId: normalized.organizationId,
        reason: "event_match"
      }));

    return Object.freeze(receipts);
  }

  snapshot() {
    return Object.freeze({
      schemaVersion: RUNTIME_POLICY_SCHEMA_VERSION,
      watchdogs: Object.freeze([...this.rules.values()].sort((a, b) => a.id.localeCompare(b.id))),
      retainedEventIds: Object.freeze([...this.seenOrder])
    });
  }

  remember(eventId) {
    this.seen.add(eventId);
    this.seenOrder.push(eventId);
    while (this.seenOrder.length > this.maxSeenEvents) {
      const oldest = this.seenOrder.shift();
      this.seen.delete(oldest);
    }
  }
}

export class ProviderAccountGate {
  constructor(accounts = []) {
    this.accounts = new Map();
    for (const account of accounts) this.define(account);
  }

  define(account) {
    requireId(account?.id, "account.id");
    if (this.accounts.has(account.id)) throw new Error(`duplicate account id: ${account.id}`);
    this.accounts.set(account.id, {
      id: account.id,
      provider: account.provider?.trim() || "unknown",
      enabled: account.enabled !== false,
      activeTurnIds: new Set()
    });
    return this.snapshot(account.id);
  }

  setEnabled(accountId, enabled) {
    const account = this.requireAccount(accountId);
    if (typeof enabled !== "boolean") throw new Error("enabled must be boolean");
    account.enabled = enabled;
    return this.snapshot(accountId);
  }

  startTurn(accountId, turnId) {
    const account = this.requireAccount(accountId);
    requireId(turnId, "turnId");
    if (account.activeTurnIds.has(turnId)) throw new Error(`duplicate active turn: ${turnId}`);
    if (!account.enabled) {
      return Object.freeze({
        allowed: false,
        accountId,
        turnId,
        reason: "account_disabled"
      });
    }
    account.activeTurnIds.add(turnId);
    return Object.freeze({
      allowed: true,
      accountId,
      turnId,
      reason: "account_enabled"
    });
  }

  finishTurn(accountId, turnId) {
    const account = this.requireAccount(accountId);
    requireId(turnId, "turnId");
    if (!account.activeTurnIds.delete(turnId)) throw new Error(`turn is not active on account ${accountId}: ${turnId}`);
    return this.snapshot(accountId);
  }

  snapshot(accountId) {
    const account = this.requireAccount(accountId);
    return Object.freeze({
      schemaVersion: RUNTIME_POLICY_SCHEMA_VERSION,
      id: account.id,
      provider: account.provider,
      enabled: account.enabled,
      activeTurns: account.activeTurnIds.size,
      acceptsNewTurns: account.enabled
    });
  }

  requireAccount(accountId) {
    requireId(accountId, "accountId");
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`unknown account: ${accountId}`);
    return account;
  }
}

export function planProviderSwitch({ runningTurn = false, targetAccountEnabled = true } = {}) {
  if (typeof runningTurn !== "boolean") throw new Error("runningTurn must be boolean");
  if (typeof targetAccountEnabled !== "boolean") throw new Error("targetAccountEnabled must be boolean");
  if (!targetAccountEnabled) {
    return Object.freeze({ decision: "refuse", reason: "target_account_disabled" });
  }
  if (runningTurn) {
    return Object.freeze({ decision: "after_turn", reason: "preserve_running_turn" });
  }
  return Object.freeze({ decision: "apply_now", reason: "agent_idle" });
}

function normalizeWatchdog(rule) {
  if (!rule || typeof rule !== "object") throw new Error("watchdog is required");
  requireId(rule.id, "watchdog.id");
  requireId(rule.targetAgentId, "watchdog.targetAgentId");
  const eventTypes = Array.isArray(rule.eventTypes) ? [...new Set(rule.eventTypes)] : [];
  if (!eventTypes.length) throw new Error("watchdog.eventTypes must contain at least one event type");
  for (const type of eventTypes) {
    if (!WATCHDOG_EVENT_TYPES.has(type)) throw new Error(`unsupported watchdog event type: ${type}`);
  }
  if (rule.organizationId != null) requireId(rule.organizationId, "watchdog.organizationId");
  if (rule.accountId != null) requireId(rule.accountId, "watchdog.accountId");
  if (rule.minActiveAgents != null && (!Number.isInteger(rule.minActiveAgents) || rule.minActiveAgents < 0)) {
    throw new Error("watchdog.minActiveAgents must be a non-negative integer");
  }
  const action = rule.action ?? "wake_agent";
  if (!["wake_agent", "request_human", "record_notice"].includes(action)) {
    throw new Error(`unsupported watchdog action: ${action}`);
  }
  return Object.freeze({
    id: rule.id,
    targetAgentId: rule.targetAgentId,
    eventTypes: Object.freeze(eventTypes.sort()),
    organizationId: rule.organizationId ?? null,
    accountId: rule.accountId ?? null,
    minActiveAgents: rule.minActiveAgents ?? null,
    action
  });
}

function normalizeRuntimeEvent(event) {
  if (!event || typeof event !== "object") throw new Error("event is required");
  requireId(event.id, "event.id");
  if (!WATCHDOG_EVENT_TYPES.has(event.type)) throw new Error(`unsupported runtime event type: ${event.type}`);
  if (event.organizationId != null) requireId(event.organizationId, "event.organizationId");
  if (event.accountId != null) requireId(event.accountId, "event.accountId");
  if (event.activeAgents != null && (!Number.isInteger(event.activeAgents) || event.activeAgents < 0)) {
    throw new Error("event.activeAgents must be a non-negative integer");
  }
  return Object.freeze({
    id: event.id,
    type: event.type,
    organizationId: event.organizationId ?? null,
    accountId: event.accountId ?? null,
    activeAgents: event.activeAgents ?? null
  });
}

function watchdogMatches(rule, event) {
  if (!rule.eventTypes.includes(event.type)) return false;
  if (rule.organizationId && rule.organizationId !== event.organizationId) return false;
  if (rule.accountId && rule.accountId !== event.accountId) return false;
  if (rule.minActiveAgents != null) {
    if (event.type !== "agents.active_count") return false;
    if (event.activeAgents == null || event.activeAgents < rule.minActiveAgents) return false;
  }
  return true;
}

function requireId(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
}
