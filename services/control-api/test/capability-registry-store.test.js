import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { JsonStore } from "../src/store.js";
import { TenantCapabilityRegistryRepository } from "../src/capability-registry-store.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-capability-registry-"));
  const statePath = path.join(root, "state.json");
  const store = new JsonStore(statePath);
  await store.load();
  const registry = new TenantCapabilityRegistryRepository(store);
  await registry.initialize();
  return { root, statePath, store, registry };
}

function capability({ id = "capability_00000000-0000-4000-8000-000000000001", version = "1.0.0", slug = "quality-review", kind = "skill", tags = ["quality"], sourceUrl = "https://github.com/example/source" } = {}) {
  return createCapabilitySpec({
    id,
    kind,
    version,
    metadata: { name: "Quality Review", slug, description: "Review a result for quality.", tags },
    execution: { instructions: "Review the supplied result and return PASS or FAIL." },
    provenance: { sourceUrl, sourceCommit: "abcdef1234567", sourceLicense: "MIT" },
    evaluation: { testCases: [{ id: "smoke", input: "Review this.", expected: "PASS" }], qualityThreshold: 1 }
  });
}

const ORG_A = "org_00000000-0000-4000-8000-000000000010";
const ORG_B = "org_00000000-0000-4000-8000-000000000020";
const USER = "user_00000000-0000-4000-8000-000000000030";

test("tenant registry persists immutable versions and resolves latest semver across restart", async () => {
  const { statePath, registry } = await fixture();
  await registry.add(ORG_A, capability({ version: "1.0.0" }), { createdBy: USER, createdAt: "2026-10-16T10:00:00.000Z" });
  await registry.add(ORG_A, capability({ version: "1.10.0" }), { createdBy: USER, createdAt: "2026-10-16T10:01:00.000Z" });
  await registry.add(ORG_A, capability({ version: "1.2.0" }), { createdBy: USER, createdAt: "2026-10-16T10:02:00.000Z" });

  const latest = await registry.resolve(ORG_A, "quality-review");
  assert.equal(latest.version, "1.10.0");
  assert.equal(latest.createdBy, USER);

  const restartedStore = new JsonStore(statePath);
  await restartedStore.load();
  const restarted = new TenantCapabilityRegistryRepository(restartedStore);
  await restarted.initialize();
  assert.equal((await restarted.getById(ORG_A, latest.capabilityId)).version, "1.10.0");
  assert.equal((await restarted.resolve(ORG_A, "quality-review", "1.2.0")).version, "1.2.0");
});

test("tenant registry refuses duplicate id/version or slug/version mutations", async () => {
  const { registry } = await fixture();
  const original = capability();
  await registry.add(ORG_A, original, { createdBy: USER });
  await assert.rejects(registry.add(ORG_A, original, { createdBy: USER }), { code: "capability_registry_version_exists", statusCode: 409 });

  const differentIdSameSlug = capability({ id: "capability_00000000-0000-4000-8000-000000000099" });
  await assert.rejects(registry.add(ORG_A, differentIdSameSlug, { createdBy: USER }), { code: "capability_registry_version_exists", statusCode: 409 });
});

test("tenant registry strictly isolates organizations", async () => {
  const { registry } = await fixture();
  const spec = capability();
  await registry.add(ORG_A, spec, { createdBy: USER });
  assert.equal(await registry.resolve(ORG_B, spec.metadata.slug), null);
  assert.deepEqual(await registry.listByOrganization(ORG_B), []);
  assert.equal((await registry.resolve(ORG_A, spec.metadata.slug)).capabilityId, spec.id);
});

test("tenant registry filters latest capabilities by kind, tag, and source", async () => {
  const { registry } = await fixture();
  await registry.add(ORG_A, capability(), { createdBy: USER });
  await registry.add(ORG_A, capability({ id: "capability_00000000-0000-4000-8000-000000000002", slug: "release-agent", kind: "agent", tags: ["release"], sourceUrl: "https://github.com/example/other" }), { createdBy: USER });
  await registry.add(ORG_A, capability({ version: "2.0.0" }), { createdBy: USER });

  const quality = await registry.listByOrganization(ORG_A, { tag: "quality" });
  assert.equal(quality.length, 1);
  assert.equal(quality[0].version, "2.0.0");

  const agents = await registry.listByOrganization(ORG_A, { kind: "agent" });
  assert.deepEqual(agents.map((entry) => entry.slug), ["release-agent"]);

  const source = await registry.listByOrganization(ORG_A, { sourceUrl: "https://github.com/example/source", allVersions: true });
  assert.deepEqual(source.map((entry) => entry.version), ["2.0.0", "1.0.0"]);
});

test("tenant registry validates CapabilitySpec before persistence", async () => {
  const { registry } = await fixture();
  await assert.rejects(registry.add(ORG_A, { id: "not-a-capability" }, { createdBy: USER }), { code: "capability_id_invalid", statusCode: 400 });
});
