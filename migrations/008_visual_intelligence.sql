CREATE TABLE IF NOT EXISTS agent_work_os_visual_plans_v1 (
  organization_id TEXT PRIMARY KEY REFERENCES agent_work_os_organizations_v1(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('community', 'pro', 'enterprise')),
  billing_status TEXT NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active', 'trialing', 'past_due', 'canceled')),
  credit_limit BIGINT NOT NULL CHECK (credit_limit = -1 OR credit_limit >= 0),
  credits_used BIGINT NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  period_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  period_ends_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_work_os_visual_projects_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^project_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'organization', 'private')),
  brand_kit JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(brand_kit) = 'object'),
  created_by TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_work_os_visual_projects_id_org_unique_v1 UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS agent_work_os_visual_projects_org_v1
  ON agent_work_os_visual_projects_v1 (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_work_os_visual_projects_public_v1
  ON agent_work_os_visual_projects_v1 (updated_at DESC) WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS agent_work_os_visual_artifacts_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^artifact_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  project_id TEXT NOT NULL REFERENCES agent_work_os_visual_projects_v1(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('architecture-diagram', 'technical-diagram', 'technical-presentation', 'creative-presentation', 'creative-ad')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  spec JSONB NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  receipt JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(receipt) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_work_os_visual_artifact_project_org_v1
    FOREIGN KEY (project_id, organization_id)
    REFERENCES agent_work_os_visual_projects_v1(id, organization_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS agent_work_os_visual_artifacts_project_v1
  ON agent_work_os_visual_artifacts_v1 (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_work_os_visual_artifacts_org_v1
  ON agent_work_os_visual_artifacts_v1 (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_work_os_visual_artifacts_published_v1
  ON agent_work_os_visual_artifacts_v1 (updated_at DESC) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS agent_work_os_visual_artifact_revisions_v1 (
  artifact_id TEXT NOT NULL REFERENCES agent_work_os_visual_artifacts_v1(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL,
  spec JSONB NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  receipt JSONB NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  actor_id TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_id, version)
);

CREATE TABLE IF NOT EXISTS agent_work_os_visual_usage_v1 (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^event_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 120),
  credits INTEGER NOT NULL CHECK (credits > 0),
  artifact_id TEXT REFERENCES agent_work_os_visual_artifacts_v1(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS agent_work_os_visual_usage_org_v1
  ON agent_work_os_visual_usage_v1 (organization_id, created_at DESC);
