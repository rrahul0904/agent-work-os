export const COORDINATION_SCHEMA_VERSION = 1;

const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, normal: 2, low: 3 });

export function validateOrganization(input, limits = {}) {
  const maxAgents = limits.maxAgents ?? 256;
  const maxDepth = limits.maxDepth ?? 16;
  if (!input || typeof input !== "object") throw new Error("organization is required");
  requireId(input.id, "organization.id");
  const agents = Array.isArray(input.agents) ? input.agents : [];
  if (agents.length > maxAgents) throw new Error(`organization exceeds maxAgents=${maxAgents}`);

  const byId = new Map();
  for (const raw of agents) {
    requireId(raw?.id, "agent.id");
    if (byId.has(raw.id)) throw new Error(`duplicate agent id: ${raw.id}`);
    const parentId = raw.parentId == null ? null : String(raw.parentId);
    if (parentId === raw.id) throw new Error(`agent ${raw.id} cannot parent itself`);
    byId.set(raw.id, {
      id: raw.id,
      name: raw.name?.trim() || raw.id,
      parentId,
      delegation: normalizeDelegation(raw.delegation)
    });
  }

  for (const agent of byId.values()) {
    if (agent.parentId && !byId.has(agent.parentId)) {
      throw new Error(`agent ${agent.id} has missing parent ${agent.parentId}`);
    }
  }

  for (const agent of byId.values()) {
    const seen = new Set();
    let current = agent;
    let depth = 0;
    while (current?.parentId) {
      if (seen.has(current.id)) throw new Error(`cycle detected at agent ${current.id}`);
      seen.add(current.id);
      depth += 1;
      if (depth > maxDepth) throw new Error(`organization exceeds maxDepth=${maxDepth}`);
      current = byId.get(current.parentId);
    }
  }

  return Object.freeze({
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    id: input.id,
    name: input.name?.trim() || input.id,
    agents: Object.freeze([...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map(Object.freeze))
  });
}

export function reparentAgent(organization, agentId, nextParentId, limits = {}) {
  const normalized = validateOrganization(organization, limits);
  if (!normalized.agents.some((agent) => agent.id === agentId)) {
    throw new Error(`unknown agent: ${agentId}`);
  }
  if (nextParentId != null && !normalized.agents.some((agent) => agent.id === nextParentId)) {
    throw new Error(`unknown parent: ${nextParentId}`);
  }
  const next = {
    id: normalized.id,
    name: normalized.name,
    agents: normalized.agents.map((agent) => ({
      ...agent,
      parentId: agent.id === agentId ? nextParentId ?? null : agent.parentId,
      delegation: { ...agent.delegation }
    }))
  };
  return validateOrganization(next, limits);
}

export class FairTurnScheduler {
  constructor({ maxConcurrent = 16 } = {}) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("maxConcurrent must be a positive integer");
    }
    this.maxConcurrent = maxConcurrent;
    this.queues = new Map();
    this.orgOrder = [];
    this.cursor = 0;
    this.running = new Map();
    this.knownTurnIds = new Set();
  }

  enqueue(turn) {
    validateTurn(turn);
    if (this.knownTurnIds.has(turn.id)) throw new Error(`duplicate turn id: ${turn.id}`);
    this.knownTurnIds.add(turn.id);
    if (!this.queues.has(turn.organizationId)) {
      this.queues.set(turn.organizationId, []);
      this.orgOrder.push(turn.organizationId);
    }
    const queued = Object.freeze({
      id: turn.id,
      organizationId: turn.organizationId,
      agentId: turn.agentId,
      enqueuedAt: turn.enqueuedAt ?? null
    });
    this.queues.get(turn.organizationId).push(queued);
    return this.receipt(turn.id);
  }

  dispatch(limit = this.maxConcurrent - this.running.size) {
    const capacity = Math.min(
      Math.max(0, Number.isInteger(limit) ? limit : 0),
      this.maxConcurrent - this.running.size
    );
    const dispatched = [];
    let emptyPasses = 0;

    while (dispatched.length < capacity && this.orgOrder.length && emptyPasses < this.orgOrder.length) {
      const orgIndex = this.cursor % this.orgOrder.length;
      const orgId = this.orgOrder[orgIndex];
      this.cursor = (orgIndex + 1) % this.orgOrder.length;
      const queue = this.queues.get(orgId) ?? [];
      if (!queue.length) {
        emptyPasses += 1;
        continue;
      }
      emptyPasses = 0;
      const turn = queue.shift();
      this.running.set(turn.id, turn);
      dispatched.push(Object.freeze({ ...turn, state: "running" }));
    }

    return Object.freeze(dispatched);
  }

  complete(turnId) {
    if (!this.running.has(turnId)) throw new Error(`turn is not running: ${turnId}`);
    const turn = this.running.get(turnId);
    this.running.delete(turnId);
    return Object.freeze({ ...turn, state: "completed" });
  }

  receipt(turnId) {
    const active = this.running.get(turnId);
    if (active) return Object.freeze({ ...active, state: "running", queuePosition: 0 });
    for (const orgId of this.orgOrder) {
      const queue = this.queues.get(orgId) ?? [];
      const index = queue.findIndex((turn) => turn.id === turnId);
      if (index >= 0) {
        return Object.freeze({
          ...queue[index],
          state: "queued",
          queuePosition: index + 1,
          reason: this.running.size >= this.maxConcurrent ? "global_concurrency_limit" : "awaiting_fair_turn"
        });
      }
    }
    return undefined;
  }

  snapshot() {
    const queued = [];
    for (const orgId of this.orgOrder) {
      for (const turn of this.queues.get(orgId) ?? []) queued.push(this.receipt(turn.id));
    }
    return Object.freeze({
      schemaVersion: COORDINATION_SCHEMA_VERSION,
      maxConcurrent: this.maxConcurrent,
      running: Object.freeze([...this.running.values()].map((turn) => Object.freeze({ ...turn }))),
      queued: Object.freeze(queued)
    });
  }
}

export function projectAttention({ approvals = [], messages = [], workItems = [] } = {}, { resolvedIds = [] } = {}) {
  const resolved = new Set(resolvedIds);
  const items = new Map();

  const add = (item) => {
    if (!item || resolved.has(item.id) || resolved.has(item.sourceId)) return;
    const previous = items.get(item.id);
    if (!previous || compareAttention(item, previous) < 0) items.set(item.id, Object.freeze(item));
  };

  for (const approval of approvals) {
    if (!approval?.id || !["pending", "needs_human"].includes(approval.state ?? "pending")) continue;
    add({
      id: `approval:${approval.id}`,
      sourceId: approval.id,
      kind: "approval",
      priority: normalizePriority(approval.priority),
      createdAt: approval.createdAt ?? "",
      title: approval.title?.trim() || "Approval required",
      organizationId: approval.organizationId ?? null,
      agentId: approval.agentId ?? null
    });
  }

  for (const message of messages) {
    if (!message?.id || message.urgent !== true || message.resolved === true) continue;
    add({
      id: `message:${message.id}`,
      sourceId: message.id,
      kind: "urgent_message",
      priority: normalizePriority(message.priority ?? "high"),
      createdAt: message.createdAt ?? "",
      title: message.subject?.trim() || message.text?.trim() || "Urgent agent message",
      organizationId: message.organizationId ?? null,
      agentId: message.agentId ?? null
    });
  }

  for (const work of workItems) {
    if (!work?.id || !(work.blockedByHuman === true || work.status === "needs_human")) continue;
    add({
      id: `work:${work.id}`,
      sourceId: work.id,
      kind: "blocked_work",
      priority: normalizePriority(work.priority),
      createdAt: work.createdAt ?? "",
      title: work.title?.trim() || "Work item needs human input",
      organizationId: work.organizationId ?? null,
      agentId: work.agentId ?? null
    });
  }

  return Object.freeze([...items.values()].sort(compareAttention));
}

function compareAttention(a, b) {
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority) return priority;
  const age = String(a.createdAt).localeCompare(String(b.createdAt));
  if (age) return age;
  return a.id.localeCompare(b.id);
}

function normalizeDelegation(value = {}) {
  const maxChildren = value.maxChildren ?? 8;
  const maxConcurrentTurns = value.maxConcurrentTurns ?? 1;
  if (!Number.isInteger(maxChildren) || maxChildren < 0) throw new Error("delegation.maxChildren must be a non-negative integer");
  if (!Number.isInteger(maxConcurrentTurns) || maxConcurrentTurns < 0) throw new Error("delegation.maxConcurrentTurns must be a non-negative integer");
  return Object.freeze({ maxChildren, maxConcurrentTurns });
}

function normalizePriority(value = "normal") {
  return Object.hasOwn(PRIORITY_RANK, value) ? value : "normal";
}

function requireId(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
}

function validateTurn(turn) {
  if (!turn || typeof turn !== "object") throw new Error("turn is required");
  requireId(turn.id, "turn.id");
  requireId(turn.organizationId, "turn.organizationId");
  requireId(turn.agentId, "turn.agentId");
}
