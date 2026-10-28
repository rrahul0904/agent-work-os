import crypto from "node:crypto";

const VERSION = "shipping-production-approval/v1";
const TARGETS = new Set(["aws", "oci", "onprem"]);
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9._-]{3,180}$/;
const TTL_MS = 30 * 60 * 1000;

function approvalKey(raw) {
  if (typeof raw !== "string" || !/^[a-f0-9]{64,128}$/i.test(raw)) {
    throw new Error("production_approval_key_required_32_to_64_byte_hex");
  }
  return Buffer.from(raw, "hex");
}
function validId(value) { return typeof value === "string" && ID.test(value); }
function payloadIsValid(p) {
  return p && typeof p === "object" && !Array.isArray(p) && p.version === VERSION &&
    validId(p.runId) && validId(p.organizationId) && validId(p.machineId) &&
    validId(p.requestedBy) && validId(p.approvedBy) && p.requestedBy !== p.approvedBy &&
    /^sha256:[a-f0-9]{64}$/.test(p.contractDigest) && SHA.test(p.sourceSha) &&
    TARGETS.has(p.hostingTarget) && /^[a-f0-9]{32}$/.test(p.nonce) &&
    Number.isSafeInteger(p.issuedAt) && Number.isSafeInteger(p.expiresAt) &&
    p.expiresAt > p.issuedAt && p.expiresAt - p.issuedAt <= TTL_MS;
}

/** Only server-side owner/admin approval may issue a signed permit. */
export function issueProductionApproval({
  runId, organizationId, machineId, requestedBy, approvedBy, contractDigest,
  sourceSha, hostingTarget, signingKey, now = Date.now()
}) {
  approvalKey(signingKey);
  const body = {
    version: VERSION, runId, organizationId, machineId, requestedBy,
    approvedBy, contractDigest, sourceSha, hostingTarget,
    issuedAt: now, expiresAt: now + TTL_MS, nonce: crypto.randomBytes(16).toString("hex")
  };
  if (!payloadIsValid(body)) throw new Error("production_approval_claims_invalid");
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const mac = crypto.createHmac("sha256", approvalKey(signingKey)).update(encoded).digest("hex");
  return { permit: encoded + "." + mac, claims: body };
}

/** The workstation daemon must verify this independently of the control API. */
export function verifyProductionApproval(permit, { signingKey, runId, contractDigest, machineId,
  organizationId, sourceSha, hostingTarget, now = Date.now() } = {}) {
  if (typeof permit !== "string" || permit.length > 2100 ||
      !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(permit)) {
    throw new Error("production_approval_invalid");
  }
  const [encoded, signature] = permit.split(".");
  const expected = crypto.createHmac("sha256", approvalKey(signingKey)).update(encoded).digest();
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("production_approval_signature_invalid");
  }
  let claims;
  try { claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new Error("production_approval_payload_invalid"); }
  if (!payloadIsValid(claims)) throw new Error("production_approval_claims_invalid");
  if (now < claims.issuedAt - 60_000 || now >= claims.expiresAt) {
    throw new Error("production_approval_expired_or_not_yet_valid");
  }
  if (claims.runId !== runId || claims.contractDigest !== contractDigest ||
      claims.machineId !== machineId || claims.organizationId !== organizationId ||
      claims.sourceSha !== sourceSha || claims.hostingTarget !== hostingTarget) {
    throw new Error("production_approval_scope_mismatch");
  }
  return claims;
}
