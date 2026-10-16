import { readFile } from "node:fs/promises";
import { assertCanonicalId, createCanonicalId } from "../../../packages/domain/src/index.js";

const MIGRATION_URL = new URL("../../../migrations/008_visual_intelligence.sql", import.meta.url);
const PLAN_DEFAULTS = Object.freeze({ community: 500, pro: 6000, enterprise: -1 });
const VISIBILITIES = new Set(["public", "organization", "private"]);
const ARTIFACT_TYPES = new Set(["architecture-diagram", "technical-diagram", "technical-presentation", "creative-presentation", "creative-ad"]);
const ARTIFACT_STATUSES = new Set(["draft", "ready", "published", "archived"]);
const WRITER_ROLES = new Set(["owner", "admin", "member"]);

export class VisualIntelligenceStoreError extends Error {
  constructor(code, status = 400, details = null) {
    super(code);
    this.name = "VisualIntelligenceStoreError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class VisualIntelligenceRepository {
  constructor(pool) {
    if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") throw new Error("postgres_visual_intelligence_repository_required");
    this.pool = pool;
  }

  async initialize() {
    await this.pool.query(await readFile(MIGRATION_URL, "utf8"));
  }

  async setPlan({ organizationId, plan, creditLimit = PLAN_DEFAULTS[plan], billingStatus = "active", periodEndsAt = null }) {
    assertCanonicalId("org", organizationId, "organizationId");
    if (!Object.hasOwn(PLAN_DEFAULTS, plan)) throw new VisualIntelligenceStoreError("visual_plan_invalid");
    if (!Number.isSafeInteger(creditLimit) || creditLimit < -1) throw new VisualIntelligenceStoreError("visual_credit_limit_invalid");
    if (!new Set(["active", "trialing", "past_due", "canceled"]).has(billingStatus)) throw new VisualIntelligenceStoreError("visual_billing_status_invalid");
    if (periodEndsAt !== null && !Number.isFinite(Date.parse(periodEndsAt))) throw new VisualIntelligenceStoreError("visual_plan_period_invalid");
    const result = await this.pool.query(
      `INSERT INTO agent_work_os_visual_plans_v1
         (organization_id, plan, billing_status, credit_limit, period_started_at, period_ends_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
       ON CONFLICT (organization_id) DO UPDATE SET
         plan = EXCLUDED.plan,
         billing_status = EXCLUDED.billing_status,
         credit_limit = EXCLUDED.credit_limit,
         credits_used = CASE WHEN agent_work_os_visual_plans_v1.period_ends_at IS DISTINCT FROM EXCLUDED.period_ends_at THEN 0 ELSE agent_work_os_visual_plans_v1.credits_used END,
         period_started_at = CASE WHEN agent_work_os_visual_plans_v1.period_ends_at IS DISTINCT FROM EXCLUDED.period_ends_at THEN CURRENT_TIMESTAMP ELSE agent_work_os_visual_plans_v1.period_started_at END,
         period_ends_at = EXCLUDED.period_ends_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [organizationId, plan, billingStatus, creditLimit, periodEndsAt]
    );
    return rowToPlan(result.rows[0]);
  }

  async getPlan(organizationId) {
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_visual_plans_v1 WHERE organization_id = $1", [organizationId]);
    return result.rows[0] ? rowToPlan(result.rows[0]) : null;
  }

  async createProject({ organizationId, actorId, name, description = "", visibility = "public", brandKit = {} }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("user", actorId, "actorId");
    name = text(name, "visual_project_name_invalid", 160);
    description = text(description, "visual_project_description_invalid", 5000, true);
    if (!VISIBILITIES.has(visibility)) throw new VisualIntelligenceStoreError("visual_project_visibility_invalid");
    objectValue(brandKit, "visual_brand_kit_invalid");
    await this.#requireWriter(actorId, organizationId);
    const plan = await this.#ensurePlan(organizationId);
    if (plan.plan === "community" && visibility !== "public") throw new VisualIntelligenceStoreError("visual_private_project_requires_paid_plan", 403);
    const id = createCanonicalId("project");
    const result = await this.pool.query(
      `INSERT INTO agent_work_os_visual_projects_v1
         (id, organization_id, name, description, visibility, brand_kit, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [id, organizationId, name, description, visibility, JSON.stringify(brandKit), actorId]
    );
    return rowToProject(result.rows[0]);
  }

  async listProjects({ organizationId, actorId }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("user", actorId, "actorId");
    await this.#requireMembership(actorId, organizationId);
    const result = await this.pool.query(
      "SELECT * FROM agent_work_os_visual_projects_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, id",
      [organizationId]
    );
    return result.rows.map(rowToProject);
  }

  async createArtifact({ organizationId, projectId, actorId, artifactType, title, spec, receipt = {}, status = "draft" }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("project", projectId, "projectId");
    assertCanonicalId("user", actorId, "actorId");
    validateArtifactInput({ artifactType, title, spec, receipt, status });
    await this.#requireWriter(actorId, organizationId);
    const project = await this.#project(projectId, organizationId);
    if (!project) throw new VisualIntelligenceStoreError("visual_project_not_found", 404);
    if (status === "published" && project.visibility !== "public") throw new VisualIntelligenceStoreError("visual_publish_requires_public_project", 409);
    const id = createCanonicalId("artifact");
    return this.#transaction(async client => {
      const result = await client.query(
        `INSERT INTO agent_work_os_visual_artifacts_v1
           (id, project_id, organization_id, artifact_type, title, spec, receipt, status, version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 1, $9)
         RETURNING *`,
        [id, projectId, organizationId, artifactType, title.trim(), JSON.stringify(spec), JSON.stringify(receipt), status, actorId]
      );
      await insertRevision(client, result.rows[0], actorId);
      return rowToArtifact(result.rows[0]);
    });
  }

  async updateArtifact({ organizationId, artifactId, actorId, expectedVersion, title, spec, receipt, status }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("artifact", artifactId, "artifactId");
    assertCanonicalId("user", actorId, "actorId");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new VisualIntelligenceStoreError("visual_artifact_expected_version_invalid");
    await this.#requireWriter(actorId, organizationId);
    return this.#transaction(async client => {
      const selected = await client.query(
        `SELECT artifact.*, project.visibility AS project_visibility
         FROM agent_work_os_visual_artifacts_v1 artifact
         JOIN agent_work_os_visual_projects_v1 project ON project.id = artifact.project_id
         WHERE artifact.id = $1 AND artifact.organization_id = $2 FOR UPDATE OF artifact`,
        [artifactId, organizationId]
      );
      const row = selected.rows[0];
      if (!row) throw new VisualIntelligenceStoreError("visual_artifact_not_found", 404);
      if (Number(row.version) !== expectedVersion) throw new VisualIntelligenceStoreError("visual_artifact_version_conflict", 409, { expectedVersion, actualVersion: Number(row.version) });
      const next = {
        title: title === undefined ? row.title : text(title, "visual_artifact_title_invalid", 240),
        spec: spec === undefined ? row.spec : objectValue(spec, "visual_artifact_spec_invalid"),
        receipt: receipt === undefined ? row.receipt : objectValue(receipt, "visual_artifact_receipt_invalid"),
        status: status === undefined ? row.status : status
      };
      if (!ARTIFACT_STATUSES.has(next.status)) throw new VisualIntelligenceStoreError("visual_artifact_status_invalid");
      if (next.status === "published" && row.project_visibility !== "public") throw new VisualIntelligenceStoreError("visual_publish_requires_public_project", 409);
      const result = await client.query(
        `UPDATE agent_work_os_visual_artifacts_v1
         SET title = $1, spec = $2::jsonb, receipt = $3::jsonb, status = $4, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND organization_id = $6 AND version = $7
         RETURNING *`,
        [next.title.trim(), JSON.stringify(next.spec), JSON.stringify(next.receipt), next.status, artifactId, organizationId, expectedVersion]
      );
      if (!result.rowCount) throw new VisualIntelligenceStoreError("visual_artifact_version_conflict", 409);
      await insertRevision(client, result.rows[0], actorId);
      return rowToArtifact(result.rows[0]);
    });
  }

  async getArtifact({ organizationId, artifactId, actorId }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("artifact", artifactId, "artifactId");
    assertCanonicalId("user", actorId, "actorId");
    await this.#requireMembership(actorId, organizationId);
    const result = await this.pool.query(
      "SELECT * FROM agent_work_os_visual_artifacts_v1 WHERE id = $1 AND organization_id = $2",
      [artifactId, organizationId]
    );
    return result.rows[0] ? rowToArtifact(result.rows[0]) : null;
  }

  async listArtifactHistory({ organizationId, artifactId, actorId }) {
    await this.getArtifact({ organizationId, artifactId, actorId });
    const result = await this.pool.query(
      "SELECT * FROM agent_work_os_visual_artifact_revisions_v1 WHERE artifact_id = $1 ORDER BY version",
      [artifactId]
    );
    return result.rows.map(rowToRevision);
  }

  async listCommunity({ limit = 50 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new VisualIntelligenceStoreError("visual_community_limit_invalid");
    const result = await this.pool.query(
      `SELECT artifact.*, project.name AS project_name, project.brand_kit
       FROM agent_work_os_visual_artifacts_v1 artifact
       JOIN agent_work_os_visual_projects_v1 project ON project.id = artifact.project_id
       WHERE artifact.status = 'published' AND project.visibility = 'public'
       ORDER BY artifact.updated_at DESC, artifact.id
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(row => ({ ...rowToArtifact(row), projectName: row.project_name, brandKit: row.brand_kit }));
  }

  async consumeCredits({ organizationId, actorId, operation, credits, artifactId = null, metadata = {} }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("user", actorId, "actorId");
    if (artifactId !== null) assertCanonicalId("artifact", artifactId, "artifactId");
    operation = text(operation, "visual_usage_operation_invalid", 120);
    if (!Number.isSafeInteger(credits) || credits < 1) throw new VisualIntelligenceStoreError("visual_usage_credits_invalid");
    objectValue(metadata, "visual_usage_metadata_invalid");
    await this.#requireMembership(actorId, organizationId);
    return this.#transaction(async client => {
      await ensurePlan(client, organizationId);
      const selected = await client.query("SELECT * FROM agent_work_os_visual_plans_v1 WHERE organization_id = $1 FOR UPDATE", [organizationId]);
      const plan = selected.rows[0];
      if (plan.billing_status === "canceled") throw new VisualIntelligenceStoreError("visual_plan_inactive", 402);
      const used = Number(plan.credits_used);
      const limit = Number(plan.credit_limit);
      if (limit !== -1 && used + credits > limit) throw new VisualIntelligenceStoreError("visual_credit_limit_exceeded", 402, { used, limit, requested: credits });
      const updated = await client.query(
        `UPDATE agent_work_os_visual_plans_v1
         SET credits_used = credits_used + $1, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $2 RETURNING *`,
        [credits, organizationId]
      );
      const eventId = createCanonicalId("event");
      await client.query(
        `INSERT INTO agent_work_os_visual_usage_v1
           (event_id, organization_id, user_id, operation, credits, artifact_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [eventId, organizationId, actorId, operation.trim(), credits, artifactId, JSON.stringify(metadata)]
      );
      return { eventId, plan: rowToPlan(updated.rows[0]) };
    });
  }

  async usageSummary({ organizationId, actorId }) {
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("user", actorId, "actorId");
    await this.#requireMembership(actorId, organizationId);
    const plan = await this.#ensurePlan(organizationId);
    const result = await this.pool.query(
      `SELECT count(*)::integer AS events, COALESCE(sum(credits), 0)::bigint AS ledger_credits
       FROM agent_work_os_visual_usage_v1 WHERE organization_id = $1`,
      [organizationId]
    );
    return { plan, events: Number(result.rows[0].events), ledgerCredits: Number(result.rows[0].ledger_credits) };
  }

  async #ensurePlan(organizationId) {
    await ensurePlan(this.pool, organizationId);
    return this.getPlan(organizationId);
  }

  async #project(projectId, organizationId) {
    const result = await this.pool.query("SELECT * FROM agent_work_os_visual_projects_v1 WHERE id = $1 AND organization_id = $2", [projectId, organizationId]);
    return result.rows[0] ? rowToProject(result.rows[0]) : null;
  }

  async #requireMembership(userId, organizationId) {
    const result = await this.pool.query(
      "SELECT role FROM agent_work_os_memberships_v1 WHERE user_id = $1 AND organization_id = $2",
      [userId, organizationId]
    );
    if (!result.rows[0]) throw new VisualIntelligenceStoreError("visual_organization_access_denied", 403);
    return result.rows[0].role;
  }

  async #requireWriter(userId, organizationId) {
    const role = await this.#requireMembership(userId, organizationId);
    if (!WRITER_ROLES.has(role)) throw new VisualIntelligenceStoreError("visual_write_access_denied", 403);
    return role;
  }

  async #transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }
}

async function ensurePlan(client, organizationId) {
  await client.query(
    `INSERT INTO agent_work_os_visual_plans_v1 (organization_id, plan, billing_status, credit_limit)
     VALUES ($1, 'community', 'active', $2) ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, PLAN_DEFAULTS.community]
  );
}

async function insertRevision(client, row, actorId) {
  await client.query(
    `INSERT INTO agent_work_os_visual_artifact_revisions_v1
       (artifact_id, version, title, spec, receipt, status, actor_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [row.id, Number(row.version), row.title, JSON.stringify(row.spec), JSON.stringify(row.receipt), row.status, actorId]
  );
}

function validateArtifactInput({ artifactType, title, spec, receipt, status }) {
  if (!ARTIFACT_TYPES.has(artifactType)) throw new VisualIntelligenceStoreError("visual_artifact_type_invalid");
  text(title, "visual_artifact_title_invalid", 240);
  objectValue(spec, "visual_artifact_spec_invalid");
  objectValue(receipt, "visual_artifact_receipt_invalid");
  if (!ARTIFACT_STATUSES.has(status)) throw new VisualIntelligenceStoreError("visual_artifact_status_invalid");
}

function text(value, code, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maxLength) throw new VisualIntelligenceStoreError(code);
  return value.trim();
}

function objectValue(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VisualIntelligenceStoreError(code);
  return value;
}

function rowToPlan(row) {
  return {
    organizationId: row.organization_id,
    plan: row.plan,
    billingStatus: row.billing_status,
    creditLimit: Number(row.credit_limit),
    creditsUsed: Number(row.credits_used),
    periodStartedAt: new Date(row.period_started_at).toISOString(),
    periodEndsAt: row.period_ends_at ? new Date(row.period_ends_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToProject(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    brandKit: row.brand_kit,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToArtifact(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    artifactType: row.artifact_type,
    title: row.title,
    spec: row.spec,
    receipt: row.receipt,
    status: row.status,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToRevision(row) {
  return {
    artifactId: row.artifact_id,
    version: Number(row.version),
    title: row.title,
    spec: row.spec,
    receipt: row.receipt,
    status: row.status,
    actorId: row.actor_id,
    createdAt: new Date(row.created_at).toISOString()
  };
}
