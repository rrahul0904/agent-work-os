import crypto from "node:crypto";

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,47}$/;
const VALID_AGENTS = new Set(["echo", "codex"]);
export const TASK_STATES = Object.freeze(["pending", "dispatching", "running", "awaiting_verification", "verified", "failed", "blocked"]);
function fail(message) { const e = new Error(message); e.code = message; e.statusCode = 400; throw e; }
function requiredText(value, max, name) {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail("forge_" + name + "_invalid");
  return value.trim();
}
function safeOptionalUrl(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) fail("forge_source_url_invalid");
  let url;
  try { url = new URL(value); } catch { fail("forge_source_url_invalid"); }
  if (url.protocol !== "https:" || !url.hostname) fail("forge_source_url_must_be_https");
  return url.toString();
}
function idOf(task) { return task.id; }
export function validateForgePlan(spec, { now = () => new Date().toISOString(), newId = () => crypto.randomUUID() } = {}) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) fail("forge_spec_invalid");
  const title = requiredText(spec.title, 160, "title");
  const machineId = requiredText(spec.machineId, 160, "machine_id");
  const cwd = requiredText(spec.cwd, 2048, "cwd");
  const maxParallel = spec.maxParallel ?? 2;
  if (!Number.isSafeInteger(maxParallel) || maxParallel < 1 || maxParallel > 3) fail("forge_parallel_limit_invalid");
  if (!Array.isArray(spec.tasks) || spec.tasks.length < 1 || spec.tasks.length > 32) fail("forge_task_count_invalid");
  const nodes = spec.tasks.map(input => {
    if (!input || typeof input !== "object" || !ID_PATTERN.test(input.id)) fail("forge_task_id_invalid");
    if (!VALID_AGENTS.has(input.agent)) fail("forge_agent_invalid");
    if (!Array.isArray(input.dependsOn) || input.dependsOn.length > 31 ||
      !input.dependsOn.every(s => typeof s === "string" && ID_PATTERN.test(s))) fail("forge_dependencies_invalid");
    if (new Set(input.dependsOn).size !== input.dependsOn.length) fail("forge_duplicate_dependency");
    return {
      id: input.id,
      title: requiredText(input.title, 160, "task_title"),
      agent: input.agent,
      sandbox: input.agent === "codex" && input.sandbox === "read-only" ? "read-only" : "workspace-write",
      prompt: requiredText(input.prompt, 12000, "task_prompt"),
      dependsOn: [...input.dependsOn],
      expectChanges: input.expectChanges === true,
      state: "pending", attempt: 0,
      sessionId: null, commandId: null, verification: null,
      updatedAt: now()
    };
  });
  // Until the daemon has worktree-per-worker isolation, concurrent Codex
  // sessions must not edit the same cwd. Echo fixtures can exercise parallel DAGs.
  if (maxParallel > 1 && nodes.some(task => task.agent === "codex")) fail("forge_codex_requires_isolated_worktrees");
  const lookup = new Map(nodes.map(task => [idOf(task), task]));
  if (lookup.size !== nodes.length) fail("forge_duplicate_task");
  for (const node of nodes) {
    for (const dep of node.dependsOn) if (!lookup.has(dep) || dep === node.id) fail("forge_invalid_dependency");
  }
  const visited = new Set(), visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) fail("forge_dependency_cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of lookup.get(id).dependsOn) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const node of nodes) visit(node.id);
  const time = now();
  return {
    id: "forge-" + newId(), schema: "rea-forge-plan/v1",
    title, sourceUrl: safeOptionalUrl(spec.sourceUrl),
    machineId, cwd, maxParallel, state: "draft",
    createdAt: time, updatedAt: time, tasks: nodes, events: [
      { type: "plan.created", at: time, source: "human-submitted-plan" }
    ]
  };
}
function mutate(plan, event, change) {
  const copy = structuredClone(plan);
  change(copy);
  const at = new Date().toISOString();
  copy.updatedAt = at;
  copy.events.push({ ...event, at });
  if (copy.events.length > 500) copy.events = copy.events.slice(-500);
  return copy;
}
export function approveForgePlan(plan) {
  if (plan.state !== "draft") fail("forge_approval_invalid_state");
  return mutate(plan, { type: "plan.approved" }, p => { p.state = "running"; });
}
export function claimNextForgeTask(plan, { sessionId = crypto.randomUUID(), commandId = crypto.randomUUID() } = {}) {
  if (plan.state !== "running") return { plan, task: null };
  const active = plan.tasks.filter(t => t.state === "running" || t.state === "dispatching").length;
  if (active >= plan.maxParallel) return { plan, task: null };
  const satisfied = new Set(plan.tasks.filter(t => t.state === "verified").map(t => t.id));
  const next = plan.tasks.find(t => t.state === "pending" && t.dependsOn.every(dep => satisfied.has(dep)));
  if (!next) return { plan, task: null };
  const updated = mutate(plan, { type: "task.claimed", taskId: next.id, sessionId }, p => {
    const task = p.tasks.find(t => t.id === next.id);
    task.state = "dispatching"; task.sessionId = sessionId; task.commandId = commandId;
    task.updatedAt = new Date().toISOString(); task.attempt += 1;
  });
  return { plan: updated, task: updated.tasks.find(t => t.id === next.id) };
}
export function reconcileForgeTask(plan, taskId, session) {
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task || !["dispatching", "running"].includes(task.state)) return plan;
  let state = task.state;
  if (!session || session.id !== task.sessionId) state = "blocked";
  else if (session.status === "completed") state = "awaiting_verification";
  else if (["failed", "interrupted"].includes(session.status)) state = "failed";
  else if (["queued", "running"].includes(session.status)) state = "running";
  else state = "blocked"; // Unknown and stale are never claimed as success.
  if (state === task.state) return plan;
  return mutate(plan, { type: "task.reconciled", taskId, state }, p => {
    const current = p.tasks.find(t => t.id === taskId);
    current.state = state; current.updatedAt = new Date().toISOString();
  });
}
export function verifyForgeTask(plan, taskId, evidence) {
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task || task.state !== "awaiting_verification") fail("forge_not_ready_for_verification");
  if (evidence?.approved !== true) fail("forge_approval_required");
  // Approval is an explicit human attestation; evidence digest makes the
  // assertion inspectable, but is NOT independent automatic proof.
  if (!/^sha256:[a-f0-9]{64}$/.test(evidence?.digest ?? "")) fail("forge_receipt_digest_invalid");
  const reviewer = requiredText(evidence.reviewer, 120, "reviewer");
  const verified = mutate(plan, { type: "task.attested", taskId }, p => {
    const t = p.tasks.find(x => x.id === taskId);
    t.state = "verified";
    t.verification = { digest: evidence.digest, reviewer, method: "human-attestation", at: new Date().toISOString() };
    t.updatedAt = new Date().toISOString();
    if (p.tasks.every(x => x.state === "verified")) p.state = "awaiting_release";
  });
  return verified;
}
export function retryForgeTask(plan, taskId) {
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task || !["failed", "blocked"].includes(task.state) || plan.state !== "running") fail("forge_retry_invalid_state");
  return mutate(plan, { type: "task.retry_authorized", taskId }, p => {
    const t = p.tasks.find(x => x.id === taskId);
    t.state = "pending"; t.sessionId = null; t.commandId = null; t.updatedAt = new Date().toISOString();
  });
}
export function terminateForgePlan(plan) {
  if (plan.state === "cancelled" || plan.state === "awaiting_release") fail("forge_plan_stop_invalid");
  // Stopping the scheduler does NOT stop a running external Codex child;
  // caller must request session interrupts separately as authorized.
  return mutate(plan, { type: "plan.stopped" }, p => { p.state = "stopped"; });
}
