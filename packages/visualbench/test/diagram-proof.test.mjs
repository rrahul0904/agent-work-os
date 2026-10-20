import test from "node:test";
import assert from "node:assert/strict";
import { inspectDiagramProof, createDiagramProofReceipt } from "../src/diagram-proof.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
function validDiagram() {
  return {
    schema: "visualbench.diagram-proof/v1",
    kind: "architecture",
    sourceBacked: true,
    repository: { url: "https://github.com/example/repo", commit: sha },
    nodes: [
      { id: "api", label: "API", sources: [{ path: "services/api/index.js", startLine: 2, endLine: 9 }] },
      { id: "store", label: "Store", sources: [{ path: "services/store.js", startLine: 1, endLine: 12 }] }
    ],
    edges: [{ id: "api-store", from: "api", to: "store", label: "reads" }]
  };
}
function codes(candidate) {
  return inspectDiagramProof(candidate).diagnostics.map((x) => x.code);
}

test("valid proof shape receives stable but non-publication receipt", () => {
  const diagram = validDiagram();
  const report = inspectDiagramProof(diagram);
  assert.equal(report.ok, true);
  const receipt = createDiagramProofReceipt(diagram);
  assert.equal(receipt.status, "SHAPE_VALIDATED");
  assert.equal(receipt.publishAuthorized, false);
  assert.equal(receipt.sourceEvidence, "DECLARED_UNVERIFIED");
  assert.equal(receipt.browserEvidence, "NOT_TESTED");
  assert.match(receipt.candidateSha256, /^[0-9a-f]{64}$/);
});
test("same JSON semantic input has deterministic hash across key ordering", () => {
  const candidate = validDiagram();
  const reordered = Object.fromEntries(Object.entries(candidate).reverse());
  assert.equal(createDiagramProofReceipt(candidate).candidateSha256,
    createDiagramProofReceipt(reordered).candidateSha256);
});
test("rejects duplicate node identities", () => {
  const x = validDiagram();
  x.nodes[1].id = "api";
  assert.ok(codes(x).includes("node/duplicate-id"));
});
test("rejects unresolved relationships", () => {
  const x = validDiagram();
  x.edges[0].to = "ghost";
  assert.ok(codes(x).includes("edge/unresolved-to"));
});
test("rejects duplicate edge identities", () => {
  const x = validDiagram();
  x.edges.push({ ...x.edges[0] });
  assert.ok(codes(x).includes("edge/duplicate-id"));
});
test("rejects unpinned evidence and unexplained source gaps", () => {
  const x = validDiagram();
  x.repository.commit = "main";
  x.nodes[0].sources = [];
  const found = codes(x);
  assert.ok(found.includes("source/unpinned-commit"));
  assert.ok(found.includes("source/node-sources"));
});
test("rejects path traversal, path scheme and Windows separators", () => {
  for (const path of ["../../private", "/etc/passwd", "https://example.org/file", "src\\file.js", "dir//file"]) {
    const x = validDiagram();
    x.nodes[0].sources[0].path = path;
    assert.ok(codes(x).includes("source/path"), path);
  }
});
test("rejects missing and reversed line ranges", () => {
  for (const [startLine, endLine] of [[0, 5], [8, 2], [2, 1.3], [1, 10000001]]) {
    const x = validDiagram();
    Object.assign(x.nodes[0].sources[0], { startLine, endLine });
    assert.ok(codes(x).includes("source/line-range"));
  }
});
test("rejects malformed graph inputs with deterministic diagnostics", () => {
  assert.deepEqual(codes(null), ["diagram/not-object"]);
  const x = validDiagram();
  x.nodes = "not nodes";
  x.edges = 55;
  const found = codes(x);
  assert.ok(found.includes("diagram/node-list"));
  assert.ok(found.includes("diagram/edge-list"));
});
test("supports non-source-backed drafts but never marks evidence verified", () => {
  const x = validDiagram();
  x.sourceBacked = false;
  delete x.repository;
  for (const node of x.nodes) delete node.sources;
  assert.equal(inspectDiagramProof(x).ok, true);
  assert.equal(createDiagramProofReceipt(x).sourceEvidence, "DECLARED_UNVERIFIED");
});
test("rejects oversize graph instead of treating it as a valid artifact", () => {
  const x = validDiagram();
  x.nodes = Array.from({ length: 251 }, (_, i) => ({
    id: "n" + i, label: "n" + i,
    sources: [{ path: "src/a.js", startLine: 1, endLine: 1 }]
  }));
  assert.ok(codes(x).includes("diagram/node-list"));
});
test("never grants publication even when input is valid", () => {
  const x = validDiagram();
  x.publishAuthorized = true; // untrusted input must not influence the receipt
  assert.equal(createDiagramProofReceipt(x).publishAuthorized, false);
});
