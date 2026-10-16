import crypto from "node:crypto";

export const REA_FINDING_VERSION = "rea-finding/v1";
export const CLEAN_ROOM_DECISIONS = Object.freeze(["adopt_pattern", "compare_only", "reject"]);
const DECISIONS = new Set(CLEAN_ROOM_DECISIONS);

export function validateReaFinding(input) {
  const errors = [];
  if (!plain(input)) return { valid: false, errors: ["rea_finding_invalid"] };
  if (input.version !== REA_FINDING_VERSION) errors.push("rea_finding_version_invalid");
  for (const key of ["id", "sourceUrl", "sourceIdentity", "capability", "cleanRoomDecision"]) {
    if (!nonEmpty(input[key])) errors.push(`rea_finding_${key}_required`);
  }
  if (!DECISIONS.has(input.cleanRoomDecision)) errors.push("rea_finding_clean_room_decision_invalid");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0 || input.evidence.some((item) => !plain(item) || !nonEmpty(item.url) || !nonEmpty(item.claim))) {
    errors.push("rea_finding_evidence_required");
  }
  for (const metric of ["value", "confidence", "risk", "effort"]) {
    const score = input[metric];
    if (!Number.isInteger(score) || score < 0 || score > 5) errors.push(`rea_finding_${metric}_invalid`);
  }
  if (input.constraints !== undefined && (!Array.isArray(input.constraints) || input.constraints.some((item) => !nonEmpty(item)))) errors.push("rea_finding_constraints_invalid");
  return { valid: errors.length === 0, errors };
}

export function assertReaFinding(input) {
  const result = validateReaFinding(input);
  if (!result.valid) throw new Error(`rea_finding_invalid:${result.errors.join(",")}`);
  return structuredClone(input);
}

export function rankReaFindings(findings) {
  if (!Array.isArray(findings)) throw new Error("rea_findings_invalid");
  return findings.map((finding) => {
    const item = assertReaFinding(finding);
    const score = Number((item.value * 2 + item.confidence * 1.5 - item.risk * 1.5 - item.effort).toFixed(2));
    return { ...item, score, evidenceDigest: digest(item.evidence) };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function compileReaBacklog(findings, { projectId }) {
  if (!nonEmpty(projectId)) throw new Error("rea_project_id_required");
  return rankReaFindings(findings)
    .filter((finding) => finding.cleanRoomDecision === "adopt_pattern")
    .map((finding, index) => ({
      id: `rea-${finding.id}`,
      projectId,
      priority: index + 1,
      title: finding.capability,
      description: `Clean-room implementation derived from public behavior/evidence for ${finding.sourceIdentity}.`,
      provenance: {
        sourceUrl: finding.sourceUrl,
        sourceIdentity: finding.sourceIdentity,
        evidenceDigest: finding.evidenceDigest,
        evidence: finding.evidence,
        constraints: finding.constraints ?? []
      },
      score: finding.score,
      status: "PROPOSED"
    }));
}

function digest(value) { return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex")}`; }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
