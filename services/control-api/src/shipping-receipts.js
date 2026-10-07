import crypto from "node:crypto";

export const SHIPPING_RUN_VERSION = "shipping-run/v1";
export const SHIPPING_RECEIPT_VERSION = "shipping-receipt/v1";

export function createShippingRun({ runId, projectId, releaseVersion, contractDigest, at = new Date().toISOString() }) {
  for (const [name, value] of Object.entries({ runId, projectId, releaseVersion, contractDigest })) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`shipping_run_${name}_required`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(contractDigest)) throw new Error("shipping_run_contract_digest_invalid");
  return {
    version: SHIPPING_RUN_VERSION,
    runId,
    projectId,
    releaseVersion,
    contractDigest,
    state: "CREATED",
    blocker: null,
    createdAt: at,
    updatedAt: at,
    testedSha: null,
    deployedSha: null,
    worktreePath: null,
    events: []
  };
}

export function appendShippingEvent(run, { type, state = run.state, at = new Date().toISOString(), evidence = {}, message = null }) {
  if (!run || run.version !== SHIPPING_RUN_VERSION) throw new Error("shipping_run_invalid");
  if (typeof type !== "string" || !type.trim()) throw new Error("shipping_event_type_required");
  const next = structuredClone(run);
  next.state = state;
  next.updatedAt = at;
  const previousDigest = next.events.at(-1)?.digest ?? null;
  const event = {
    version: SHIPPING_RECEIPT_VERSION,
    sequence: next.events.length + 1,
    runId: next.runId,
    contractDigest: next.contractDigest,
    type,
    state,
    at,
    message,
    evidence: sortObject(evidence),
    previousDigest
  };
  event.digest = digestObject(event, ["digest"]);
  next.events.push(event);
  return next;
}

export function buildReleaseReceipt(run, { goldenPath }) {
  const verification = verifyShippingRun(run);
  if (!verification.valid) throw new Error(`shipping_run_invalid:${verification.errors.join(",")}`);
  if (run.state !== "SHIPPED") throw new Error("shipping_release_not_shipped");
  if (!Array.isArray(goldenPath) || goldenPath.length === 0) throw new Error("shipping_release_golden_path_required");
  const receipt = {
    version: "shipping-release-receipt/v1",
    runId: run.runId,
    projectId: run.projectId,
    releaseVersion: run.releaseVersion,
    contractDigest: run.contractDigest,
    testedSha: run.testedSha,
    deployedSha: run.deployedSha,
    goldenPath: goldenPath.map((item) => ({ id: item.id, status: "PASS" })),
    finalEventDigest: run.events.at(-1)?.digest ?? null,
    shippedAt: run.updatedAt
  };
  receipt.receiptDigest = digestObject(receipt, ["receiptDigest"]);
  return receipt;
}

export function verifyReleaseReceipt(receipt) {
  if (!receipt || receipt.version !== "shipping-release-receipt/v1") return { valid: false, errors: ["release_receipt_invalid"] };
  const expected = digestObject(receipt, ["receiptDigest"]);
  return expected === receipt.receiptDigest ? { valid: true, errors: [] } : { valid: false, errors: ["release_receipt_digest_invalid"] };
}

export function verifyShippingRun(run) {
  const errors = [];
  if (!run || run.version !== SHIPPING_RUN_VERSION) return { valid: false, errors: ["shipping_run_invalid"] };
  if (!Array.isArray(run.events)) errors.push("shipping_run_events_invalid");
  if (Array.isArray(run.events)) {
    let previousDigest = null;
    for (let index = 0; index < run.events.length; index += 1) {
      const event = run.events[index];
      if (event.sequence !== index + 1) errors.push(`shipping_event_sequence_invalid:${index + 1}`);
      if (event.runId !== run.runId || event.contractDigest !== run.contractDigest) errors.push(`shipping_event_identity_invalid:${index + 1}`);
      if (event.previousDigest !== previousDigest) errors.push(`shipping_event_chain_invalid:${index + 1}`);
      if (digestObject(event, ["digest"]) !== event.digest) errors.push(`shipping_event_digest_invalid:${index + 1}`);
      previousDigest = event.digest ?? null;
    }
  }
  if (run.state === "SHIPPED") {
    if (!run.testedSha) errors.push("shipping_run_shipped_without_tested_sha");
    if (!run.deployedSha) errors.push("shipping_run_shipped_without_deployed_sha");
  }
  return { valid: errors.length === 0, errors };
}

export function reconcileShippingRunOnStartup(run, { at = new Date().toISOString() } = {}) {
  const terminal = new Set(["SHIPPED", "FAILED", "BLOCKED", "CANCELLED"]);
  if (terminal.has(run.state)) return structuredClone(run);
  return appendShippingEvent(run, {
    type: "run.reconciled",
    state: "INTERRUPTED",
    at,
    message: `restart_from:${run.state}`
  });
}

function digestObject(value, ignoredKeys) {
  const clone = structuredClone(value);
  for (const key of ignoredKeys) delete clone[key];
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(clone))).digest("hex")}`;
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
