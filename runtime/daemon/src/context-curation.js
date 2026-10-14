import { canonicalJson, sha256 } from "./project-context-store.js";

export const CONTEXT_CURATION_SCHEMA = "context-curation-report/v1";

function finding(severity, code, message, refs = []) {
  return { severity, code, message, refs: [...refs].sort() };
}

function ageDays(updatedAt, now) {
  const updated = new Date(updatedAt).valueOf();
  const current = new Date(now).valueOf();
  if (!Number.isFinite(updated) || !Number.isFinite(current)) return null;
  return Math.max(0, (current - updated) / 86_400_000);
}

export function curateProjectContext(snapshot, {
  now = new Date().toISOString(),
  staleAfterDays = 45,
  maxCanonicalChars = 24_000,
  terminalDecisionWarnAt = 20,
} = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("snapshot must be an object");
  if (snapshot.schemaVersion !== "project-context/v1") throw new Error("snapshot must use project-context/v1");
  if (!snapshot.projectId || !snapshot.revision) throw new Error("snapshot projectId and revision are required");
  if (!Number.isFinite(staleAfterDays) || staleAfterDays < 1) throw new Error("staleAfterDays must be >= 1");
  if (!Number.isInteger(maxCanonicalChars) || maxCanonicalChars < 256) throw new Error("maxCanonicalChars must be an integer >= 256");

  const findings = [];
  const size = canonicalJson(snapshot).length;
  const age = ageDays(snapshot.updatedAt, now);
  if (age === null) findings.push(finding("error", "INVALID_UPDATED_AT", "Project context updatedAt is not a valid timestamp."));
  else if (age > staleAfterDays) findings.push(finding("warning", "STALE_CONTEXT", `Project context is ${Math.floor(age)} days old; review current truth before dispatch.`));

  if (size > maxCanonicalChars) findings.push(finding("warning", "OVERSIZED_CONTEXT", `Canonical project context is ${size} characters, above the ${maxCanonicalChars} character curation limit.`));

  const decisions = Array.isArray(snapshot.decisions) ? snapshot.decisions : [];
  const active = decisions.filter((decision) => decision?.status === "active");
  const terminal = decisions.filter((decision) => decision?.status === "superseded" || decision?.status === "retracted");
  if (terminal.length >= terminalDecisionWarnAt) {
    findings.push(finding("info", "TERMINAL_DECISION_ACCUMULATION", `${terminal.length} terminal decisions remain in the current snapshot; consider archiving historical residue.`));
  }

  const byTopic = new Map();
  for (const decision of active) {
    const topic = typeof decision?.topic === "string" ? decision.topic.trim().toLowerCase() : "";
    if (!topic) continue;
    const list = byTopic.get(topic) ?? [];
    list.push(decision);
    byTopic.set(topic, list);
  }
  for (const [topic, items] of [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const statements = new Set(items.map((item) => String(item.statement ?? "").trim()));
    if (statements.size > 1) {
      findings.push(finding("error", "CONFLICTING_ACTIVE_DECISIONS", `Multiple active decisions disagree on topic '${topic}'.`, items.map((item) => item.id).filter(Boolean)));
    }
  }

  if (!snapshot.activeDesign) findings.push(finding("info", "NO_ACTIVE_DESIGN", "No active design is bound to the current project context."));
  if (!Array.isArray(snapshot.evidenceRefs) || snapshot.evidenceRefs.length === 0) findings.push(finding("warning", "NO_EVIDENCE_REFS", "Current project context has no evidence references."));

  const counts = {
    errors: findings.filter((item) => item.severity === "error").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
    info: findings.filter((item) => item.severity === "info").length,
  };
  const status = counts.errors ? "BLOCK" : counts.warnings ? "REVIEW" : "PASS";
  const reportCore = {
    schemaVersion: CONTEXT_CURATION_SCHEMA,
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    contextDigest: sha256(canonicalJson(snapshot)),
    evaluatedAt: now,
    policy: { staleAfterDays, maxCanonicalChars, terminalDecisionWarnAt },
    contextSizeChars: size,
    status,
    counts,
    findings,
  };
  return { ...reportCore, reportDigest: sha256(canonicalJson(reportCore)) };
}
