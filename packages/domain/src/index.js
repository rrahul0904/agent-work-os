import { randomUUID, createHash } from "node:crypto";

export const CANONICAL_ID_KINDS = Object.freeze([
  "org", "user", "project", "repo", "work", "task", "run", "agent", "machine", "session",
  "worktree", "sandbox", "process", "tool", "mcp", "rea", "browser", "model", "memory", "context",
  "artifact", "evidence", "event", "approval", "policy", "grant", "receipt", "deployment", "capability", "service", "command", "credential"
]);

const ID_KIND_SET = new Set(CANONICAL_ID_KINDS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WORK_ITEM_STATES = Object.freeze([
  "backlog", "ready", "running", "blocked", "verifying", "complete", "failed", "interrupted"
]);

export const TASK_STATES = Object.freeze(["READY", "ACTIVE", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const RUN_STATES = Object.freeze([
  "QUEUED", "LEASED", "PREPARING", "RUNNING", "WAITING_FOR_APPROVAL", "VERIFYING",
  "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INTERRUPTED", "RECOVERING"
]);

const RUN_TRANSITIONS = Object.freeze({
  QUEUED: new Set(["LEASED", "CANCELLED", "TIMED_OUT"]),
  LEASED: new Set(["PREPARING", "RECOVERING", "FAILED", "CANCELLED", "TIMED_OUT", "INTERRUPTED"]),
  PREPARING: new Set(["RUNNING", "RECOVERING", "FAILED", "CANCELLED", "TIMED_OUT", "INTERRUPTED"]),
  RUNNING: new Set(["WAITING_FOR_APPROVAL", "VERIFYING", "RECOVERING", "FAILED", "CANCELLED", "TIMED_OUT", "INTERRUPTED"]),
  WAITING_FOR_APPROVAL: new Set(["RUNNING", "CANCELLED", "TIMED_OUT", "INTERRUPTED"]),
  VERIFYING: new Set(["SUCCEEDED", "FAILED", "RECOVERING", "TIMED_OUT", "INTERRUPTED"]),
  RECOVERING: new Set(["LEASED", "FAILED", "CANCELLED", "TIMED_OUT", "INTERRUPTED"]),
  SUCCEEDED: new Set(), FAILED: new Set(), CANCELLED: new Set(), TIMED_OUT: new Set(), INTERRUPTED: new Set()
});

const WORK_ITEM_TRANSITIONS = Object.freeze({
  backlog: new Set(["ready"]),
  ready: new Set(["running", "blocked"]),
  running: new Set(["blocked", "verifying", "failed", "interrupted"]),
  blocked: new Set(["ready"]),
  verifying: new Set(["running", "complete", "failed"]),
  failed: new Set(["ready"]),
  interrupted: new Set(["ready", "running"]),
  complete: new Set()
});

export class DomainValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
  }
}

export class InvalidWorkItemTransitionError extends DomainValidationError {
  constructor(from, to) {
    super("work_item_transition_invalid", `Work item cannot transition from ${from} to ${to}`);
    this.name = "InvalidWorkItemTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function createCanonicalId(kind, value = randomUUID()) {
  if (!ID_KIND_SET.has(kind)) throw new DomainValidationError("canonical_id_kind_unknown");
  if (!UUID_PATTERN.test(value)) throw new DomainValidationError("canonical_id_uuid_invalid");
  return `${kind}_${value.toLowerCase()}`;
}

export function isCanonicalId(kind, value) {
  return ID_KIND_SET.has(kind) && typeof value === "string" && value.startsWith(`${kind}_`) && UUID_PATTERN.test(value.slice(kind.length + 1));
}

export function assertCanonicalId(kind, value, field = `${kind}Id`) {
  if (!isCanonicalId(kind, value)) throw new DomainValidationError("canonical_id_invalid", `${field} must be a canonical ${kind} ID`);
  return value;
}

export function createWorkItem(input, { now = () => new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("work_item_invalid");
  const id = input.id ?? createCanonicalId("work");
  assertCanonicalId("work", id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  if (input.projectId !== undefined && input.projectId !== null) assertCanonicalId("project", input.projectId, "projectId");
  assertActorId(input.createdBy, "createdBy");

  const title = requireTaskText(input.title, "title", 200).trim();
  const description = input.description === undefined ? "" : requireTaskText(input.description, "description", 20_000, true);
  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new DomainValidationError("work_item_timestamp_invalid");
  return {
    id,
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    title,
    description,
    status: "backlog",
    version: 1,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt
  };
}

export function assertWorkItem(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("work_item_invalid");
  assertCanonicalId("work", input.id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  if (input.projectId !== null) assertCanonicalId("project", input.projectId, "projectId");
  assertActorId(input.createdBy, "createdBy");
  requireTaskText(input.title, "title", 200);
  requireTaskText(input.description, "description", 20_000, true);
  if (!WORK_ITEM_STATES.includes(input.status)) throw new DomainValidationError("work_item_state_invalid");
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("work_item_version_invalid");
  if (!Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw new DomainValidationError("work_item_timestamp_invalid");
  }
  return input;
}

export function assertNewWorkItem(input) {
  const item = assertWorkItem(input);
  if (item.status !== "backlog" || item.version !== 1) {
    throw new DomainValidationError("work_item_initial_state_invalid");
  }
  return item;
}

export function transitionWorkItem(itemInput, { to, expectedVersion, at = new Date().toISOString() }) {
  const item = assertWorkItem(itemInput);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new DomainValidationError("expected_version_invalid");
  if (expectedVersion !== item.version) {
    const error = new DomainValidationError("work_item_version_conflict", `Expected version ${expectedVersion}, found ${item.version}`);
    error.expectedVersion = expectedVersion;
    error.actualVersion = item.version;
    throw error;
  }
  if (!WORK_ITEM_STATES.includes(to)) throw new DomainValidationError("work_item_state_invalid");
  if (!WORK_ITEM_TRANSITIONS[item.status].has(to)) throw new InvalidWorkItemTransitionError(item.status, to);
  if (!Number.isFinite(Date.parse(at))) throw new DomainValidationError("work_item_timestamp_invalid");
  return { ...item, status: to, version: item.version + 1, updatedAt: at };
}

export function createTask(input, { now = () => new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("task_invalid");
  const id = input.id ?? createCanonicalId("task");
  assertCanonicalId("task", id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  assertCanonicalId("work", input.workItemId, "workItemId");
  assertActorId(input.createdBy, "createdBy");
  const title = requireText(input.title, "title", 200).trim();
  const description = input.description === undefined ? "" : requireText(input.description, "description", 20_000, true);
  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new DomainValidationError("task_timestamp_invalid");
  return {
    id, organizationId: input.organizationId, workItemId: input.workItemId, title, description,
    status: "READY", version: 1, createdBy: input.createdBy, createdAt, updatedAt: createdAt
  };
}

export function assertTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("task_invalid");
  assertCanonicalId("task", input.id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  assertCanonicalId("work", input.workItemId, "workItemId");
  assertActorId(input.createdBy, "createdBy");
  requireText(input.title, "title", 200);
  requireText(input.description, "description", 20_000, true);
  if (!TASK_STATES.includes(input.status)) throw new DomainValidationError("task_state_invalid");
  assertVersionAndTimes(input);
  return input;
}

export function createTaskRun(input, { now = () => new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("run_invalid");
  const id = input.id ?? createCanonicalId("run");
  assertCanonicalId("run", id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  assertCanonicalId("task", input.taskId, "taskId");
  assertActorId(input.createdBy, "createdBy");
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) throw new DomainValidationError("run_attempt_invalid");
  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new DomainValidationError("run_timestamp_invalid");
  return {
    id, organizationId: input.organizationId, taskId: input.taskId, attempt: input.attempt,
    status: "QUEUED", version: 1, createdBy: input.createdBy, createdAt, updatedAt: createdAt
  };
}

export function assertTaskRun(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainValidationError("run_invalid");
  assertCanonicalId("run", input.id, "id");
  assertCanonicalId("org", input.organizationId, "organizationId");
  assertCanonicalId("task", input.taskId, "taskId");
  assertActorId(input.createdBy, "createdBy");
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) throw new DomainValidationError("run_attempt_invalid");
  if (!RUN_STATES.includes(input.status)) throw new DomainValidationError("run_state_invalid");
  assertVersionAndTimes(input);
  return input;
}

export function transitionTaskRun(runInput, { to, expectedVersion, at = new Date().toISOString() }) {
  const run = assertTaskRun(runInput);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new DomainValidationError("expected_version_invalid");
  if (expectedVersion !== run.version) {
    const error = new DomainValidationError("run_version_conflict", `Expected version ${expectedVersion}, found ${run.version}`);
    error.expectedVersion = expectedVersion;
    error.actualVersion = run.version;
    throw error;
  }
  if (!RUN_STATES.includes(to)) throw new DomainValidationError("run_state_invalid");
  if (!RUN_TRANSITIONS[run.status].has(to)) throw new DomainValidationError("run_transition_invalid", `Run cannot transition from ${run.status} to ${to}`);
  if (!Number.isFinite(Date.parse(at))) throw new DomainValidationError("run_timestamp_invalid");
  return { ...run, status: to, version: run.version + 1, updatedAt: at };
}

function assertVersionAndTimes(input) {
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("entity_version_invalid");
  if (!Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw new DomainValidationError("entity_timestamp_invalid");
  }
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex")}`;
}

export function workItemCreateDigest(item, actorId) {
  return canonicalDigest({
    operation: "create",
    actorId,
    item: {
      id: item.id,
      organizationId: item.organizationId,
      projectId: item.projectId,
      title: item.title,
      description: item.description,
      createdBy: item.createdBy
    }
  });
}

export class WorkItemRepository {
  async create(_item, _command) { throw new Error("work_item_repository_create_not_implemented"); }
  async get(_id) { throw new Error("work_item_repository_get_not_implemented"); }
  async listByOrganization(_organizationId) { throw new Error("work_item_repository_list_not_implemented"); }
  async transition(_id, _command) { throw new Error("work_item_repository_transition_not_implemented"); }
  async listEvents(_id) { throw new Error("work_item_repository_events_not_implemented"); }
}

function requireText(value, field, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maxLength) {
    throw new DomainValidationError(`work_item_${field}_invalid`);
  }
  return value;
}

function requireTaskText(value, field, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maxLength) {
    throw new DomainValidationError(`task_${field}_invalid`);
  }
  return value;
}

function assertActorId(value, field) {
  const kind = ["user", "agent", "service"].find((candidate) => value?.startsWith(`${candidate}_`));
  if (!kind) throw new DomainValidationError("actor_id_invalid", `${field} must be a canonical user, agent, or service ID`);
  return assertCanonicalId(kind, value, field);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
