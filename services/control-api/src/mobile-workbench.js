import { createHash } from "node:crypto";

const sha = (x) => createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])]));
  return x;
}
function requireText(x, name) {
  if (typeof x !== "string" || !x.trim()) throw new Error(name + "_required");
  return x;
}
export function deviceCapability(device) {
  if (!device || device.platform !== "android" || device.architecture !== "arm64") throw new Error("unsupported_device");
  for (const key of ["memoryMb", "storageMb"]) if (!Number.isSafeInteger(device[key]) || device[key] < 0) throw new Error("invalid_" + key);
  if (!Array.isArray(device.capabilities) || !device.capabilities.every(x => typeof x === "string")) throw new Error("invalid_capabilities");
  const profile = { platform: device.platform, architecture: device.architecture, memoryMb: device.memoryMb, storageMb: device.storageMb, capabilities: [...new Set(device.capabilities)].sort() };
  return { ...profile, digest: sha(profile) };
}
export function preflight({ device, target, budget, knownMachines = [] }) {
  if (target?.kind === "agent_work_os_machine") {
    const machine = knownMachines.find(x => x.id === target.machineId && x.online === true);
    if (!machine) return { allowed: false, reason: "remote_machine_unavailable" };
    if (!machine.capabilities?.includes("execute")) return { allowed: false, reason: "remote_execution_unsupported" };
    return { allowed: true, lane: target.kind };
  }
  if (target?.kind !== "local_mobile") return { allowed: false, reason: "invalid_target" };
  let profile;
  try { profile = deviceCapability(device); } catch { return { allowed: false, reason: "unsupported_device" }; }
  if (!budget || !Number.isSafeInteger(budget.memoryMb) || !Number.isSafeInteger(budget.storageMb) || budget.memoryMb < 0 || budget.storageMb < 0) return { allowed: false, reason: "invalid_budget" };
  if (profile.memoryMb < budget.memoryMb) return { allowed: false, reason: "insufficient_memory" };
  if (profile.storageMb < budget.storageMb) return { allowed: false, reason: "insufficient_storage" };
  if (!profile.capabilities.includes("runtime_ready")) return { allowed: false, reason: "runtime_unavailable" };
  return { allowed: true, lane: target.kind, capabilityDigest: profile.digest };
}
const transitions = {
  queued: ["starting", "blocked", "failed"],
  starting: ["running", "blocked", "interrupted", "failed"],
  running: ["needs_input", "blocked", "interrupted", "completed", "failed"],
  needs_input: ["running", "interrupted", "failed"],
  blocked: ["queued", "failed"],
  interrupted: ["queued", "failed"],
  completed: [],
  failed: []
};
export function transitionRun(run, next, evidence = {}) {
  if (!run || !transitions[run.state]) throw new Error("invalid_run");
  if (run.state === next) return run;
  if (!transitions[run.state].includes(next)) throw new Error("invalid_transition");
  if (next === "completed" && !(evidence.verifier === "independent" && evidence.passed === true && typeof evidence.receiptId === "string" && evidence.receiptId.length)) throw new Error("verification_required");
  return { ...run, state: next, revision: (run.revision ?? 0) + 1, evidence: next === "completed" ? { verifier: "independent", passed: true, receiptId: evidence.receiptId } : undefined };
}
export function reconcileProcess(run, alive) {
  if (alive || !["starting", "running", "needs_input"].includes(run.state)) return run;
  return transitionRun(run, "interrupted");
}
export function previewReceipt({ run, workspace, sourceDigest, port, healthy, healthReceiptId }) {
  requireText(run?.id, "run_id"); requireText(workspace?.id, "workspace_id"); requireText(sourceDigest, "source_digest");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || healthy !== true || !healthReceiptId) throw new Error("preview_not_healthy");
  if (run.workspaceId !== workspace.id || run.sourceDigest !== sourceDigest) throw new Error("preview_identity_mismatch");
  return { runId: run.id, workspaceId: workspace.id, sourceDigest, port, healthReceiptId, ready: true };
}
export function handoffReceipt({ workspace, source, destination }) {
  requireText(workspace?.id, "workspace_id"); requireText(source?.sourceDigest, "source_digest");
  if (source.workspaceId !== workspace.id || destination?.workspaceId !== workspace.id || destination.sourceDigest !== source.sourceDigest) throw new Error("handoff_identity_mismatch");
  if (!destination.machineId || destination.machineId === source.machineId) throw new Error("invalid_destination");
  return { workspaceId: workspace.id, sourceDigest: source.sourceDigest, fromMachineId: source.machineId ?? "mobile", toMachineId: destination.machineId, processMigrated: false, digest: sha({ workspaceId: workspace.id, sourceDigest: source.sourceDigest, toMachineId: destination.machineId }) };
}
export function safeReceipt(data) {
  const forbidden = /password|secret|token|api.?key|authorization|private.?key/i;
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { if (forbidden.test(key)) throw new Error("secret_field_refused"); inspect(item); }
  }
  inspect(data);
  return structuredClone(data);
}
