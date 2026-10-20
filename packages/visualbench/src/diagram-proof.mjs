// Original, renderer-independent proof-shape verifier. No filesystem, network or publication.
import { createHash } from "node:crypto";

const ID = /^[a-z][a-z0-9._-]{0,63}$/;
const HEX_SHA = /^[a-f0-9]{40}$/i;
const TYPES = new Set([
  "architecture", "workflow", "sequence", "dataflow", "lifecycle",
  "erd", "class", "tree", "timeline", "waterfall"
]);

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
  }
  return value;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validPath(path) {
  return typeof path === "string" && path.length > 0 && path.length <= 240 &&
    !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..") &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
}

function isText(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

/**
 * Validates a bounded, semantic diagram *proof shape*.
 * Does not read repository bytes or certify layout, renderer, browser, visual or export results.
 * Never publish a diagram solely because this validator returned ok=true.
 */
export function inspectDiagramProof(candidate) {
  const diagnostics = [];
  const add = (code, subject) => diagnostics.push({ code, subject });
  if (!isObject(candidate)) {
    add("diagram/not-object", "$");
    return { ok: false, diagnostics, checks: ["input-shape"] };
  }
  if (candidate.schema !== "visualbench.diagram-proof/v1") add("diagram/schema", "schema");
  if (!TYPES.has(candidate.kind)) add("diagram/kind", "kind");
  if (typeof candidate.sourceBacked !== "boolean") add("diagram/source-backed-flag", "sourceBacked");

  const repository = candidate.repository;
  if (candidate.sourceBacked === true) {
    if (!isObject(repository) || !isText(repository.url, 500)) add("source/repository-identity", "repository.url");
    if (!isObject(repository) || !HEX_SHA.test(repository.commit ?? "")) add("source/unpinned-commit", "repository.commit");
  } else if (repository !== undefined && (!isObject(repository) ||
    !isText(repository.url, 500) || !HEX_SHA.test(repository.commit ?? ""))) {
    add("source/repository-identity", "repository");
  }

  const nodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  const edges = Array.isArray(candidate.edges) ? candidate.edges : [];
  if (!Array.isArray(candidate.nodes) || nodes.length > 250) add("diagram/node-list", "nodes");
  if (!Array.isArray(candidate.edges) || edges.length > 1000) add("diagram/edge-list", "edges");
  const nodeIDs = new Set();
  const edgeIDs = new Set();
  // Bound processing even when malformed oversized data arrives.
  for (const [index, node] of nodes.slice(0, 251).entries()) {
    const subject = "nodes[" + index + "]";
    if (!isObject(node) || !ID.test(node.id ?? "")) {
      add("node/id", subject + ".id");
    } else if (nodeIDs.has(node.id)) {
      add("node/duplicate-id", subject + ".id");
    } else {
      nodeIDs.add(node.id);
    }
    if (!isObject(node) || !isText(node.label, 200)) add("node/label", subject + ".label");
    if (candidate.sourceBacked === true || (isObject(node) && node.sources !== undefined)) {
      if (!isObject(node) || !Array.isArray(node.sources) ||
        (candidate.sourceBacked === true && node.sources.length === 0) || node.sources.length > 3) {
        add("source/node-sources", subject + ".sources");
      } else {
        for (const [si, ref] of node.sources.entries()) {
          const pointer = subject + ".sources[" + si + "]";
          if (!isObject(ref) || !validPath(ref.path)) add("source/path", pointer + ".path");
          if (!isObject(ref) || !Number.isSafeInteger(ref.startLine) || ref.startLine < 1 ||
            !Number.isSafeInteger(ref.endLine) || ref.endLine < ref.startLine || ref.endLine > 10000000) {
            add("source/line-range", pointer);
          }
        }
      }
    }
  }
  for (const [index, edge] of edges.slice(0, 1001).entries()) {
    const subject = "edges[" + index + "]";
    if (!isObject(edge) || !ID.test(edge.id ?? "")) {
      add("edge/id", subject + ".id");
    } else if (edgeIDs.has(edge.id)) {
      add("edge/duplicate-id", subject + ".id");
    } else {
      edgeIDs.add(edge.id);
    }
    if (!isObject(edge) || !nodeIDs.has(edge.from)) add("edge/unresolved-from", subject + ".from");
    if (!isObject(edge) || !nodeIDs.has(edge.to)) add("edge/unresolved-to", subject + ".to");
    if (!isObject(edge) || !isText(edge.label, 200)) add("edge/label", subject + ".label");
  }
  diagnostics.sort((a, b) => (a.subject + "\0" + a.code).localeCompare(b.subject + "\0" + b.code, "en"));
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    checks: ["input-shape", "schema", "bounded-topology", "reference-shapes", "source-reference-shapes"]
  };
}

export function createDiagramProofReceipt(candidate) {
  const result = inspectDiagramProof(candidate);
  let candidateSha256 = null;
  try {
    const text = JSON.stringify(normalized(candidate));
    if (typeof text === "string") candidateSha256 = createHash("sha256").update(text).digest("hex");
  } catch {
    // Unserializable input is always a validation failure.
    result.ok = false;
    result.diagnostics.push({ code: "diagram/not-json", subject: "$" });
  }
  return {
    schema: "visualbench.proof-receipt/v1",
    candidateSha256,
    status: result.ok ? "SHAPE_VALIDATED" : "REJECTED",
    sourceEvidence: "DECLARED_UNVERIFIED",
    visualEvidence: "NOT_TESTED",
    browserEvidence: "NOT_TESTED",
    nativeEditability: "NOT_TESTED",
    publishAuthorized: false,
    checks: result.checks,
    diagnostics: result.diagnostics
  };
}
