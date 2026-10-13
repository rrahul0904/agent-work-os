import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAutoLayout,
  applyCommand,
  createDocument,
  documentReceipt,
  exportDocument,
  importDocument,
  makeNode,
  mergeRemoteOperation,
  redo,
  stableDigest,
  undo
} from "../public/design/core.js";

test("commands create deterministic receipt state", () => {
  let doc = createDocument({ id: "d1", actorId: "alice" });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("rect", { id: "r1", x: 10, y: 20 }) });
  doc = applyCommand(doc, { type: "node.update", id: "r1", patch: { x: 30 } });
  assert.equal(doc.nodes[0].x, 30);
  assert.equal(doc.collaboration.operations.length, 2);
  assert.match(documentReceipt(doc).documentDigest, /^fnv1a-/);
});

test("actor-scoped undo does not erase another actor command", () => {
  let doc = createDocument({ id: "d2", actorId: "alice" });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("rect", { id: "a" }) }, { actorId: "alice" });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("sticky", { id: "b" }) }, { actorId: "bob" });
  doc = undo(doc, "alice");
  assert.deepEqual(doc.nodes.map((n) => n.id), ["b"]);
  doc = redo(doc, "alice");
  assert.deepEqual(doc.nodes.map((n) => n.id), ["b", "a"]);
});

test("remote operation is idempotent", () => {
  let doc = createDocument({ id: "d3", actorId: "alice" });
  const op = { operationId: "bob:1", actorId: "bob", command: { type: "node.add", node: makeNode("text", { id: "t1" }) } };
  doc = mergeRemoteOperation(doc, op);
  const once = doc.nodes.length;
  doc.collaboration.operations[doc.collaboration.operations.length - 1].operationId = "bob:1";
  doc = mergeRemoteOperation(doc, op);
  assert.equal(doc.nodes.length, once);
});

test("auto layout positions child nodes", () => {
  let doc = createDocument({ id: "d4" });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("frame", { id: "f", x: 100, y: 100, layout: "horizontal", padding: 20, gap: 10 }) });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("rect", { id: "r1", parentId: "f", width: 50, height: 50 }) });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("rect", { id: "r2", parentId: "f", width: 70, height: 50 }) });
  doc = applyAutoLayout(doc, "f");
  assert.equal(doc.nodes.find((n) => n.id === "r1").x, 120);
  assert.equal(doc.nodes.find((n) => n.id === "r2").x, 180);
});

test("export/import preserves canonical design digest", () => {
  let doc = createDocument({ id: "d5", name: "Demo" });
  doc = applyCommand(doc, { type: "node.add", node: makeNode("sticky", { id: "s1", text: "hello" }) });
  const json = exportDocument(doc);
  const restored = importDocument(json);
  assert.equal(stableDigest(restored.nodes), stableDigest(doc.nodes));
  assert.deepEqual(restored.history, { past: [], future: [] });
});
