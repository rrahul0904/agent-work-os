import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createCanonicalId } from "../../../packages/domain/src/index.js";
import { PostgresWorkItemRepository } from "../src/work-item-store.js";
import { IdentityRepository } from "../src/identity-store.js";
import { VisualIntelligenceRepository, VisualIntelligenceStoreError } from "../src/visual-intelligence-store.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

test("Visual Intelligence persistence enforces tenancy, plan visibility, revisions, gallery and credits", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const userId = createCanonicalId("user");
  const orgId = createCanonicalId("org");
  const repo = new VisualIntelligenceRepository(pool);

  try {
    await waitForDatabase(pool);
    await new PostgresWorkItemRepository(pool).initialize();
    await new IdentityRepository(pool).initialize();
    await repo.initialize();
    await repo.initialize();

    await pool.query(
      `INSERT INTO agent_work_os_users_v1 (id, email, password_salt, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [userId, `${userId.slice(5, 17)}@visual.test`, Buffer.alloc(16, 1), Buffer.alloc(32, 2)]
    );
    await pool.query(
      "INSERT INTO agent_work_os_organizations_v1 (id, name, created_by) VALUES ($1, 'Visual Intelligence Test', $2)",
      [orgId, userId]
    );
    await pool.query(
      "INSERT INTO agent_work_os_memberships_v1 (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
      [orgId, userId]
    );

    const communityPlan = await repo.setPlan({ organizationId: orgId, plan: "community", creditLimit: 500 });
    assert.equal(communityPlan.plan, "community");

    await assert.rejects(
      repo.createProject({ organizationId: orgId, actorId: userId, name: "Private community project", visibility: "private" }),
      (error) => error instanceof VisualIntelligenceStoreError && error.code === "visual_private_project_requires_paid_plan"
    );

    const project = await repo.createProject({
      organizationId: orgId,
      actorId: userId,
      name: "Community Architecture Gallery",
      visibility: "public",
      brandKit: { name: "Architecture Lab", accent: "66E3FF" }
    });
    assert.equal(project.visibility, "public");
    assert.equal((await repo.listProjects({ organizationId: orgId, actorId: userId })).length, 1);

    const artifact = await repo.createArtifact({
      organizationId: orgId,
      projectId: project.id,
      actorId: userId,
      artifactType: "architecture-diagram",
      title: "Enterprise RAG Architecture",
      spec: { specVersion: "diagram-spec/v1alpha1", nodes: [{ id: "svc" }] },
      receipt: { editable: true, format: "svg" },
      status: "ready"
    });
    assert.equal(artifact.version, 1);

    const published = await repo.updateArtifact({
      organizationId: orgId,
      artifactId: artifact.id,
      actorId: userId,
      expectedVersion: 1,
      status: "published",
      receipt: { editable: true, format: "svg", visualbench: 92 }
    });
    assert.equal(published.version, 2);
    assert.equal(published.status, "published");
    assert.equal((await repo.listArtifactHistory({ organizationId: orgId, artifactId: artifact.id, actorId: userId })).length, 2);

    await assert.rejects(
      repo.updateArtifact({ organizationId: orgId, artifactId: artifact.id, actorId: userId, expectedVersion: 1, title: "stale write" }),
      (error) => error instanceof VisualIntelligenceStoreError && error.code === "visual_artifact_version_conflict"
    );

    const gallery = await repo.listCommunity();
    const galleryItem = gallery.find(item => item.id === artifact.id);
    assert.ok(galleryItem);
    assert.equal(galleryItem.projectName, "Community Architecture Gallery");
    assert.equal(galleryItem.brandKit.accent, "66E3FF");

    const usage = await repo.consumeCredits({
      organizationId: orgId,
      actorId: userId,
      operation: "diagram.generate",
      credits: 450,
      artifactId: artifact.id,
      metadata: { provider: "deterministic" }
    });
    assert.equal(usage.plan.creditsUsed, 450);

    await assert.rejects(
      repo.consumeCredits({ organizationId: orgId, actorId: userId, operation: "diagram.generate", credits: 51 }),
      (error) => error instanceof VisualIntelligenceStoreError && error.code === "visual_credit_limit_exceeded"
    );
    const summary = await repo.usageSummary({ organizationId: orgId, actorId: userId });
    assert.equal(summary.events, 1);
    assert.equal(summary.ledgerCredits, 450);

    await repo.setPlan({ organizationId: orgId, plan: "pro", creditLimit: 6000 });
    const privateProject = await repo.createProject({
      organizationId: orgId,
      actorId: userId,
      name: "Private Pro Workspace",
      visibility: "private"
    });
    assert.equal(privateProject.visibility, "private");
  } finally {
    await Promise.allSettled([
      pool.query("DELETE FROM agent_work_os_visual_usage_v1 WHERE organization_id = $1", [orgId]),
      pool.query("DELETE FROM agent_work_os_visual_artifact_revisions_v1 WHERE artifact_id IN (SELECT id FROM agent_work_os_visual_artifacts_v1 WHERE organization_id = $1)", [orgId])
    ]);
    await pool.query("DELETE FROM agent_work_os_visual_artifacts_v1 WHERE organization_id = $1", [orgId]).catch(() => {});
    await pool.query("DELETE FROM agent_work_os_visual_projects_v1 WHERE organization_id = $1", [orgId]).catch(() => {});
    await pool.query("DELETE FROM agent_work_os_visual_plans_v1 WHERE organization_id = $1", [orgId]).catch(() => {});
    await pool.query("DELETE FROM agent_work_os_memberships_v1 WHERE organization_id = $1", [orgId]).catch(() => {});
    await pool.query("DELETE FROM agent_work_os_organizations_v1 WHERE id = $1", [orgId]).catch(() => {});
    await pool.query("DELETE FROM agent_work_os_users_v1 WHERE id = $1", [userId]).catch(() => {});
    await pool.end();
  }
});

async function waitForDatabase(pool) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 15_000) {
    try { await pool.query("SELECT 1"); return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`PostgreSQL did not become ready: ${lastError?.message ?? "timeout"}`);
}
