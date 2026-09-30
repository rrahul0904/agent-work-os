import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PATH_KEYS = /^(?:path|cwd|file|targetPath|sourcePath|destinationPath)$/i;
const SECRET_KEYS = /(?:^|_)(?:secret|token|password|passwd|api[_-]?key|authorization|credential)(?:$|_)/i;
const SECRET_VALUES = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{8,})/i;

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return structuredClone(value);
}
function freeze(value) {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function Goal({ id, description, success = {} }) {
  return freeze({ kind: "Goal", id: requiredString(id, "goal.id"), description: requiredString(description, "goal.description"), success: plainObject(success, "goal.success") });
}
export function Observation({ id, source = "synthetic", data = {} }) {
  return freeze({ kind: "Observation", id: requiredString(id, "observation.id"), source: requiredString(source, "observation.source"), trust: "untrusted", data: plainObject(data, "observation.data") });
}
export function State({ revision = 0, data = {} } = {}) {
  if (!Number.isInteger(revision) || revision < 0) throw new TypeError("state.revision must be a non-negative integer");
  return freeze({ kind: "State", revision, data: plainObject(data, "state.data") });
}
export function Action({ id, capability, name, input = {} }) {
  return freeze({ kind: "Action", id: requiredString(id, "action.id"), capability: requiredString(capability, "action.capability"), name: requiredString(name, "action.name"), input: plainObject(input, "action.input") });
}
export function Outcome({ ok, code, data = {} }) {
  if (typeof ok !== "boolean") throw new TypeError("outcome.ok must be boolean");
  return freeze({ kind: "Outcome", ok, code: requiredString(code, "outcome.code"), data: plainObject(data, "outcome.data") });
}
export function Receipt(fields) {
  const value = {
    kind: "Receipt", runId: requiredString(fields.runId, "receipt.runId"), sequence: fields.sequence,
    goalId: requiredString(fields.goalId, "receipt.goalId"), actionId: requiredString(fields.actionId, "receipt.actionId"),
    capability: requiredString(fields.capability, "receipt.capability"), authorized: fields.authorized,
    decision: requiredString(fields.decision, "receipt.decision"), outcomeCode: requiredString(fields.outcomeCode, "receipt.outcomeCode"),
    stateBeforeHash: requiredString(fields.stateBeforeHash, "receipt.stateBeforeHash"), stateAfterHash: requiredString(fields.stateAfterHash, "receipt.stateAfterHash"),
    recordedAt: requiredString(fields.recordedAt, "receipt.recordedAt")
  };
  if (!Number.isInteger(value.sequence) || value.sequence < 1) throw new TypeError("receipt.sequence must be a positive integer");
  if (typeof value.authorized !== "boolean") throw new TypeError("receipt.authorized must be boolean");
  return freeze(value);
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hashValue(value) { return crypto.createHash("sha256").update(stableJson(value)).digest("hex"); }

export class CapabilityPolicy {
  constructor({ allowedCapabilities = [], workspaceRoot }) {
    this.allowed = new Set(allowedCapabilities);
    this.workspaceRoot = path.resolve(workspaceRoot);
  }
  authorize(action) {
    if (!this.allowed.has(action.capability)) return { authorized: false, decision: "capability_not_allowed" };
    const problem = inspectValue(action.input, this.workspaceRoot);
    return problem ? { authorized: false, decision: problem } : { authorized: true, decision: "allow" };
  }
}
function inspectValue(value, workspaceRoot, key = "") {
  if (Array.isArray(value)) {
    for (const item of value) { const problem = inspectValue(item, workspaceRoot, key); if (problem) return problem; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      if (SECRET_KEYS.test(childKey)) return "secret_field_denied";
      const problem = inspectValue(child, workspaceRoot, childKey); if (problem) return problem;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  if (SECRET_VALUES.test(value)) return "secret_value_denied";
  if (PATH_KEYS.test(key)) {
    const resolved = path.resolve(workspaceRoot, value);
    const relative = path.relative(workspaceRoot, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return "path_outside_workspace";
  }
  return null;
}

export class DeterministicEnvironment {
  constructor({ handlers = {}, initialState = {} } = {}) { this.handlers = new Map(Object.entries(handlers)); this.initial = structuredClone(initialState); }
  initialState() { return State({ revision: 0, data: this.initial }); }
  apply(state, action) {
    const handler = this.handlers.get(`${action.capability}:${action.name}`);
    if (!handler) return { state, outcome: Outcome({ ok: false, code: "unsupported_action" }) };
    try {
      const result = handler(structuredClone(state.data), structuredClone(action.input));
      return { state: State({ revision: state.revision + 1, data: result?.state ?? state.data }), outcome: Outcome({ ok: true, code: "applied", data: result?.outcome ?? {} }) };
    } catch {
      return { state, outcome: Outcome({ ok: false, code: "invalid_action" }) };
    }
  }
}
export function createSyntheticEnvironment() {
  return new DeterministicEnvironment({
    initialState: { counter: 0, memory: {} },
    handlers: {
      "sim.counter:add": (state, input) => { const amount = Number(input.amount ?? 0); if (!Number.isFinite(amount)) throw new TypeError(); state.counter += amount; return { state, outcome: { counter: state.counter } }; },
      "sim.memory:put": (state, input) => { const key = String(input.key ?? ""); if (!key) throw new TypeError(); state.memory[key] = structuredClone(input.value); return { state, outcome: { key } }; },
      "sim.memory:get": (state, input) => { const key = String(input.key ?? ""); return { state, outcome: { key, value: structuredClone(state.memory[key] ?? null) } }; }
    }
  });
}

export class SimulatorStore {
  constructor(filePath) {
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.db.exec(`CREATE TABLE IF NOT EXISTS simulator_runs (id TEXT PRIMARY KEY, goal_json TEXT NOT NULL, initial_state_json TEXT NOT NULL, current_state_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','completed','stopped'))); CREATE TABLE IF NOT EXISTS simulator_events (run_id TEXT NOT NULL, sequence INTEGER NOT NULL, observation_json TEXT, action_json TEXT NOT NULL, outcome_json TEXT NOT NULL, receipt_json TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY (run_id, sequence), FOREIGN KEY (run_id) REFERENCES simulator_runs(id) ON DELETE CASCADE);`);
    this.insertRun = this.db.prepare("INSERT INTO simulator_runs(id,goal_json,initial_state_json,current_state_json,status) VALUES(?,?,?,?,?)");
    this.updateRun = this.db.prepare("UPDATE simulator_runs SET current_state_json=?, status=? WHERE id=?");
    this.insertEvent = this.db.prepare("INSERT INTO simulator_events(run_id,sequence,observation_json,action_json,outcome_json,receipt_json,state_json) VALUES(?,?,?,?,?,?,?)");
  }
  journalMode() { return this.db.prepare("PRAGMA journal_mode").get().journal_mode; }
  createRun({ id, goal, state }) { this.insertRun.run(id, JSON.stringify(goal), JSON.stringify(state), JSON.stringify(state), "active"); }
  loadRun(id) {
    const row = this.db.prepare("SELECT * FROM simulator_runs WHERE id=?").get(id); if (!row) return null;
    return { id: row.id, goal: Goal(JSON.parse(row.goal_json)), initialState: State(JSON.parse(row.initial_state_json)), state: State(JSON.parse(row.current_state_json)), status: row.status, nextSequence: Number(this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM simulator_events WHERE run_id=?").get(id).n) };
  }
  append({ runId, sequence, observation, action, outcome, receipt, state, status = "active" }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.insertEvent.run(runId, sequence, observation ? JSON.stringify(observation) : null, JSON.stringify(action), JSON.stringify(outcome), JSON.stringify(receipt), JSON.stringify(state));
      this.updateRun.run(JSON.stringify(state), status, runId); this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  events(runId) {
    return this.db.prepare("SELECT * FROM simulator_events WHERE run_id=? ORDER BY sequence").all(runId).map((row) => ({
      sequence: row.sequence,
      observation: row.observation_json ? Observation(JSON.parse(row.observation_json)) : null,
      action: Action(JSON.parse(row.action_json)), outcome: Outcome(JSON.parse(row.outcome_json)), receipt: Receipt(JSON.parse(row.receipt_json)), state: State(JSON.parse(row.state_json))
    }));
  }
  close() { this.db.close(); }
}

export class BoundedSimulator {
  constructor({ store, environment, policy, clock = () => new Date().toISOString(), maxSteps = 100 }) {
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new TypeError("maxSteps must be a positive integer");
    this.store = store; this.environment = environment; this.policy = policy; this.clock = clock; this.maxSteps = maxSteps; this.run = null;
  }
  start({ runId, goal, state = this.environment.initialState() }) {
    if (this.run) throw new Error("simulator already has an active run");
    this.store.createRun({ id: runId, goal, state }); this.run = { id: runId, goal, state, nextSequence: 1 }; return this.snapshot();
  }
  resume(runId) {
    if (this.run) throw new Error("simulator already has an active run");
    const saved = this.store.loadRun(runId); if (!saved) throw new Error(`unknown run: ${runId}`);
    this.run = { id: saved.id, goal: saved.goal, state: saved.state, nextSequence: saved.nextSequence }; return this.snapshot();
  }
  step({ action, observation = null }) {
    if (!this.run) throw new Error("no active run");
    if (this.run.nextSequence > this.maxSteps) throw new Error("step_limit_reached");
    const before = this.run.state; const decision = this.policy.authorize(action); let state = before; let outcome;
    if (!decision.authorized) outcome = Outcome({ ok: false, code: "denied", data: { reason: decision.decision } });
    else ({ state, outcome } = this.environment.apply(before, action));
    const sequence = this.run.nextSequence++;
    const receipt = Receipt({ runId: this.run.id, sequence, goalId: this.run.goal.id, actionId: action.id, capability: action.capability, authorized: decision.authorized, decision: decision.decision, outcomeCode: outcome.code, stateBeforeHash: hashValue(before), stateAfterHash: hashValue(state), recordedAt: this.clock() });
    this.store.append({ runId: this.run.id, sequence, observation, action, outcome, receipt, state }); this.run.state = state;
    return { state, outcome, receipt };
  }
  replay(runId) {
    const saved = this.store.loadRun(runId); if (!saved) throw new Error(`unknown run: ${runId}`);
    let state = State(saved.initialState); const checks = [];
    for (const event of this.store.events(runId)) {
      const decision = this.policy.authorize(event.action); let outcome; let next = state;
      if (!decision.authorized) outcome = Outcome({ ok: false, code: "denied", data: { reason: decision.decision } }); else ({ state: next, outcome } = this.environment.apply(state, event.action));
      checks.push({ sequence: event.sequence, matches: decision.authorized === event.receipt.authorized && decision.decision === event.receipt.decision && outcome.code === event.outcome.code && hashValue(state) === event.receipt.stateBeforeHash && hashValue(next) === event.receipt.stateAfterHash && hashValue(next) === hashValue(event.state) }); state = next;
    }
    return { runId, matches: checks.every((item) => item.matches), checks, state };
  }
  snapshot() { return this.run ? structuredClone({ runId: this.run.id, goal: this.run.goal, state: this.run.state, nextSequence: this.run.nextSequence }) : null; }
}
