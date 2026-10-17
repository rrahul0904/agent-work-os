import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { JsonStore } from "../src/store.js";
import { IdentityRepository } from "../src/identity-store.js";
import { createWorkItemRepository } from "../src/work-item-store.js";
import { TenantCapabilityRegistryRepository } from "../src/capability-registry-store.js";

const { Pool } = pg;
const baseDatabaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

test("PostgreSQL capability registry persists tenant versions and provenance", { skip: !baseDatabaseUrl }, async () => {
  const databaseName = `awos_registry_${crypto.randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl, max: 1 });
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  const isolatedUrl = new URL(baseDatabaseUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const databaseUrl = isolatedUrl.toString();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const temp = await mkdtemp(path.join(os.tmpdir(), "awos-registry-pg-"));
  let store;

  try {
    store = new JsonStore(path.join(temp, "state.json"));
    await store.load();
    const workItems = createWorkItemRepository(store);
    if (typeof workItems.initialize === "function") await workItems.initialize();
    const identities = new IdentityRepository(store.pool);
    await identities.initialize();
    const account = await identities.register({
      email: `registry-${crypto.randomUUID()}@example.test`,
      password: "correct horse battery staple",
      organizationName: "Registry Org"
    });

    const registry = new TenantCapabilityRegistryRepository(store);
    await registry.initialize();
    const base = {
      id: "capability_00000000-0000-4000-8000-000000000077",
      kind: "skill",
      metadata: { name: "Registry Probe", slug: "registry-probe", tags: ["registry"] },
      execution: { instructions: "Return REGISTRY_READY." },
      provenance: {
        sourceUrl: "https://github.com/example/registry-source",
        sourceCommit: "abcdef1234567",
        sourceLicense: "MIT"
      },
      evaluation: { testCases: [{ id: "smoke", input: "Probe.", expected: "REGISTRY_READY" }], qualityThreshold: 1 }
    };
    const v1 = createCapabilitySpec({ ...base, version: "1.0.0" });
    const v2 = createCapabilitySpec({ ...base, version: "2.0.0" });
    await registry.add(account.organization.id, v1, { createdBy: account.user.id, createdAt: "2026-10-16T12:00:00.000Z" });
    await registry.add(account.organization.id, v2, { createdBy: account.user.id, createdAt: "2026-10-16T12:01:00.000Z" });

    const latest = await registry.resolve(account.organization.id, "registry-probe");
    assert.equal(latest.version, "2.0.0");
    assert.equal(latest.sourceCommit, "abcdef1234567");
    assert.equal(latest.createdBy, account.user.id);

    const rows = await store.pool.query(
      `SELECT capability_id, capability_version, slug, kind, source_url, source_commit, source_license, record
       FROM agent_work_os_capabilities_v1
       WHERE organization_id = $1 ORDER BY capability_version`,
      [account.organization.id]
    );
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows[0].capability_id, v1.id);
    assert.equal(rows.rows[0].slug, "registry-probe");
    assert.equal(rows.rows[0].kind, "skill");
    assert.equal(rows.rows[0].source_url, v1.provenance.sourceUrl);
    assert.equal(rows.rows[0].source_commit, v1.provenance.sourceCommit);
    assert.equal(rows.rows[0].source_license, "MIT");
    assert.equal(rows.rows[1].record.version, "2.0.0");

    await assert.rejects(
      registry.add(account.organization.id, v2, { createdBy: account.user.id }),
      { code: "capability_registry_version_exists", statusCode: 409 }
    );
  } finally {
    await store?.pool?.end();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
  }
});
