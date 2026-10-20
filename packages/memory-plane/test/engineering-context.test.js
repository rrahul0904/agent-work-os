import test from "node:test";
import assert from "node:assert/strict";
import {
  createEngineeringContextLens, EngineeringContextError,
  normalizeRepositoryPath, ENGINEERING_CONTEXT_VERSION
} from "../src/engineering-context.js";

const DIGEST = "a".repeat(64);
const base = (overrides = {}) => ({
  id: "mem-cart",
  projectId: "project-a",
  repositoryId: "team/shop",
  status: "current",
  trust: "verified",
  kind: "decision",
  title: "Cart ownership boundary",
  summary: "Cart service owns cart state. Payments are handled by checkout.",
  source: { type: "adr", id: "ADR-7", sha256: DIGEST },
  files: ["src/cart.ts"],
  impactPaths: ["src/checkout.ts"],
  ...overrides
});
const lens = (records, options = {}) => createEngineeringContextLens({
  records,
  projectId: "project-a",
  repositoryId: "team/shop",
  canRead: () => true,
  ...options
});

test("file-link paths reject traversal and unsafe aliases", () => {
  for (const unsafe of ["../secret", "src/../secret", "/etc/passwd",
    "C:/secrets", "src\\secret", "src//file", "./src", "src/\nsecret", ".git/config"]) {
    assert.throws(() => normalizeRepositoryPath(unsafe), {
      name: "EngineeringContextError", code: "UNSAFE_PATH"
    });
  }
  assert.equal(normalizeRepositoryPath("src/cart.ts"), "src/cart.ts");
});

test("scope isolation works across projects and similarly named repositories", () => {
  const context = lens([
    base(),
    base({ id: "other-project", projectId: "project-b", title: "Private plans" }),
    base({ id: "other-repo", repositoryId: "team/shop-private", title: "Private plans" })
  ]);
  assert.equal(context.size, 1);
  assert.equal(context.recall("Private plans").length, 0);
  assert.equal(context.repositoryId, "team/shop");
});

test("authorization is enforced BEFORE memory is searchable", () => {
  const context = lens([base(), base({ id: "secret", title: "Secret strategy" })], {
    canRead: (record) => record.id !== "secret"
  });
  assert.equal(context.size, 1);
  assert.deepEqual(context.recall("Secret strategy"), []);
  assert.deepEqual(context.assessChange(["src/cart.ts"]).matches.map((m) => m.memoryId), ["mem-cart"]);
});

test("missing, async or truthy non-boolean grants fail closed", () => {
  assert.throws(() => lens([base()], { canRead: undefined }), {
    name: "EngineeringContextError", code: "AUTH_REQUIRED"
  });
  assert.equal(lens([base()], { canRead: async () => true }).size, 0);
  assert.equal(lens([base()], { canRead: () => "true" }).size, 0);
});

test("superseded, retracted and untrusted records do not enter current recall", () => {
  const context = lens([
    base({ id: "superseded", status: "superseded" }),
    base({ id: "retracted", status: "retracted" }),
    base({ id: "untrusted", trust: "unverified" }),
    base()
  ]);
  assert.equal(context.size, 1);
  assert.deepEqual(context.recall("cart ownership").map((x) => x.id), ["mem-cart"]);
});

test("source digest is mandatory; citations survive read projection", () => {
  assert.throws(() => lens([base({ source: { type: "adr", id: "ADR-7" } })]), {
    code: "MISSING_PROVENANCE"
  });
  const context = lens([base()]);
  assert.equal(context.version, ENGINEERING_CONTEXT_VERSION);
  const recalled = context.recall("cart");
  assert.equal(recalled[0].source.id, "ADR-7");
  assert.equal(recalled[0].source.sha256, DIGEST);
  assert.equal(recalled[0].files[0], "src/cart.ts");
});

test("lexical recall is bounded, stable and independent of input ordering", () => {
  const a = base({ id: "a", title: "Checkout dependency" });
  const b = base({ id: "b", title: "Checkout dependency" });
  const one = lens([b, a]);
  const two = lens([a, b]);
  assert.deepEqual(one.recall("checkout").map((x) => x.id), ["a", "b"]);
  assert.deepEqual(one.recall("checkout"), two.recall("checkout"));
  assert.equal(one.recall("no-such-term").length, 0);
  assert.throws(() => one.recall("cart", { limit: 0 }), { code: "INVALID_LIMIT" });
});

test("impact is advisory and uses exact paths, not unsafe prefix guesses", () => {
  const context = lens([base()]);
  const direct = context.assessChange(["src/cart.ts"]);
  assert.equal(direct.advisory, true);
  assert.deepEqual(direct.matches[0].directFiles, ["src/cart.ts"]);
  assert.equal(direct.matches[0].confidence, "advisory");
  const related = context.assessChange(["src/checkout.ts"]);
  assert.deepEqual(related.matches[0].declaredImpactFiles, ["src/checkout.ts"]);
  assert.deepEqual(context.assessChange(["src/cart.ts.bak"]).matches, []);
});

test("impact cannot promote unauthorized and external-repository memories", () => {
  const context = lens([
    base({ id: "allowed" }),
    base({ id: "private", files: ["src/private.ts"] }),
    base({ id: "external", repositoryId: "someone/else", files: ["src/private.ts"] })
  ], { canRead: (record) => record.id !== "private" });
  assert.deepEqual(context.assessChange(["src/private.ts"]).matches, []);
  assert.deepEqual(context.assessChange(["src/cart.ts"]).matches.map((m) => m.memoryId), ["allowed"]);
});

test("duplicate IDs and malformed data are rejected; inputs are unchanged", () => {
  assert.throws(() => lens([base(), base()]), { code: "DUPLICATE_MEMORY_ID" });
  assert.throws(() => lens([base({ files: ["src/../unsafe"] })]), { code: "UNSAFE_PATH" });
  const record = base({ files: ["src/cart.ts", "src/cart.ts"] });
  const context = lens([record]);
  assert.deepEqual(record.files, ["src/cart.ts", "src/cart.ts"]);
  assert.deepEqual(context.recall("cart")[0].files, ["src/cart.ts"]);
});
