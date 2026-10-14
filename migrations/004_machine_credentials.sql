CREATE TABLE IF NOT EXISTS agent_work_os_machine_credentials_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^credential_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  machine_id TEXT NOT NULL CHECK (machine_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_work_os_machine_credentials_active_machine_v1
  ON agent_work_os_machine_credentials_v1 (machine_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_work_os_machine_credentials_org_v1
  ON agent_work_os_machine_credentials_v1 (organization_id, created_at DESC);
