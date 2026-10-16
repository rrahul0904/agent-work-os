import test from "node:test";
import assert from "node:assert/strict";
import {
  handleCapabilityRegistryRequest,
  resolveVerificationCapabilitySpec
} from "../src/capability-registry-routes.js";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";

const ORG = "org_00000000-0000-4000-8000-000000000001";
const USER = "user_00000000-0000-4000-8000-000000000002";

function spec(version = "1.0.0") {
  return createCapabilitySpec({
    id: "capability_00000000-0000-4000-8000-000000000003",
    kind: "skill",
    version,
    metadata: { name: "Registry API Probe", slug: "registry-api-probe", tags: ["api"] },
    execution: { instructions: "Return API_READY." },
    provenance: { sourceUrl: "https://github.com/example/registry-api", sourceCommit: "abcdef1234567", sourceLicense: "MIT" },
    evaluation: { testCases: [{ id: "smoke", input: "Probe.", expected: "API_READY" }], qualityThreshold: 1 }
  });
}

function response() {
  return { status: null, body: null };
}

function json(res, status, body) {
  res.status = status;
  res.body = body;
}

function context({ method = "GET", pathname = "/api/capabilities", query = "", role = "member", body = {}, registry = null } = {}) {
  const calls = [];
  const defaultRegistry = {
    async listByOrganization(organizationId, filters) { calls.push(["list", organizationId, filters]); return [{ slug: "registry-api-probe" }]; },
    async add(organizationId, capability, options) { calls.push(["add", organizationId, capability, options]); return { organizationId, slug: capability.metadata.slug, version: capability.version }; },
    async resolve(organizationId, slug, version) { calls.push(["resolve", organizationId, slug, version]); return slug === "missing" ? null : { organizationId, slug, version: version ?? "2.0.0", spec: spec(version ?? "2.0.0") }; }
  };
  const res = response();
  return {
    calls,
    res,
    args: {
      req: { method },
      res,
      url: new URL(`http://localhost${pathname}${query}`),
      principal: { kind: "user", userId: USER },
      identities: { async getMembership(userId, organizationId) { return userId === USER && organizationId === ORG ? { organizationId, role } : null; } },
      registry: registry ?? defaultRegistry,
      readJson: async () => body,
      json
    }
  };
}

test("registry list is tenant scoped and forwards filters", async () => {
  const { args, res, calls } = context({ query: `?organizationId=${ORG}&kind=skill&tag=api&sourceUrl=https%3A%2F%2Fexample.test&allVersions=true` });
  assert.equal(await handleCapabilityRegistryRequest(args), true);
  assert.equal(res.status, 200);
  assert.equal(res.body.capabilities.length, 1);
  assert.deepEqual(calls[0], ["list", ORG, { kind: "skill", tag: "api", sourceUrl: "https://example.test", allVersions: true }]);
});

test("viewer may read but cannot register a capability", async () => {
  const read = context({ query: `?organizationId=${ORG}`, role: "viewer" });
  assert.equal(await handleCapabilityRegistryRequest(read.args), true);
  assert.equal(read.res.status, 200);

  const write = context({ method: "POST", role: "viewer", body: { organizationId: ORG, spec: spec() } });
  assert.equal(await handleCapabilityRegistryRequest(write.args), true);
  assert.equal(write.res.status, 403);
  assert.equal(write.res.body.error, "organization_permission_denied");
  assert.equal(write.calls.length, 0);
});

test("member registration validates and records the authenticated creator", async () => {
  const capability = spec();
  const { args, res, calls } = context({ method: "POST", body: { organizationId: ORG, spec: capability } });
  assert.equal(await handleCapabilityRegistryRequest(args), true);
  assert.equal(res.status, 201);
  assert.equal(res.body.slug, capability.metadata.slug);
  assert.equal(calls[0][0], "add");
  assert.equal(calls[0][1], ORG);
  assert.equal(calls[0][2].id, capability.id);
  assert.deepEqual(calls[0][3], { createdBy: USER });
});

test("registry resolve hides cross-tenant lookups and supports exact version", async () => {
  const denied = context({ pathname: "/api/capabilities/registry-api-probe", query: "?organizationId=org_other&version=1.0.0" });
  assert.equal(await handleCapabilityRegistryRequest(denied.args), true);
  assert.equal(denied.res.status, 404);
  assert.equal(denied.calls.length, 0);

  const allowed = context({ pathname: "/api/capabilities/registry-api-probe", query: `?organizationId=${ORG}&version=1.0.0` });
  assert.equal(await handleCapabilityRegistryRequest(allowed.args), true);
  assert.equal(allowed.res.status, 200);
  assert.deepEqual(allowed.calls[0], ["resolve", ORG, "registry-api-probe", "1.0.0"]);
});

test("verification resolver snapshots either inline spec or immutable registry version", async () => {
  const inline = spec("3.0.0");
  const registry = {
    async resolve(organizationId, slug, version) {
      assert.equal(organizationId, ORG);
      assert.equal(slug, "registry-api-probe");
      assert.equal(version, "2.0.0");
      return { spec: spec("2.0.0") };
    }
  };
  assert.equal((await resolveVerificationCapabilitySpec(registry, ORG, { spec: inline })).version, "3.0.0");
  assert.equal((await resolveVerificationCapabilitySpec(registry, ORG, { capabilitySlug: "registry-api-probe", capabilityVersion: "2.0.0" })).version, "2.0.0");
  assert.equal(await resolveVerificationCapabilitySpec(registry, ORG, {}), null);
});
