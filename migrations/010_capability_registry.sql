CREATE TABLE IF NOT EXISTS agent_work_os_capabilities_v1 (
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  capability_version TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  source_license TEXT NOT NULL,
  created_by TEXT REFERENCES agent_work_os_users_v1(id) ON DELETE SET NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, capability_id, capability_version),
  UNIQUE (organization_id, slug, capability_version)
);

CREATE INDEX IF NOT EXISTS agent_work_os_capabilities_org_slug_v1
  ON agent_work_os_capabilities_v1 (organization_id, slug, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_work_os_capabilities_org_kind_v1
  ON agent_work_os_capabilities_v1 (organization_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_work_os_capabilities_source_v1
  ON agent_work_os_capabilities_v1 (organization_id, source_url, source_commit);
