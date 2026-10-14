CREATE TABLE IF NOT EXISTS agent_work_os_users_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^user_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  password_salt BYTEA NOT NULL CHECK (octet_length(password_salt) = 16),
  password_hash BYTEA NOT NULL CHECK (octet_length(password_hash) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_work_os_organizations_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^org_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_by TEXT REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_work_os_memberships_v1 (
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS agent_work_os_memberships_user_v1
  ON agent_work_os_memberships_v1 (user_id, organization_id);

CREATE TABLE IF NOT EXISTS agent_work_os_auth_sessions_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^session_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  user_id TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_work_os_auth_sessions_active_v1
  ON agent_work_os_auth_sessions_v1 (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_work_os_invitations_v1 (
  token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_by TEXT NOT NULL REFERENCES agent_work_os_users_v1(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_work_os_invitations_org_v1
  ON agent_work_os_invitations_v1 (organization_id, expires_at) WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_work_os_auth_rate_limits_v1 (
  key_hash CHAR(64) PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0)
);

CREATE INDEX IF NOT EXISTS agent_work_os_auth_rate_limits_window_v1
  ON agent_work_os_auth_rate_limits_v1 (window_started_at);

-- Preserve legacy WorkItems without granting access to their historical organization IDs.
INSERT INTO agent_work_os_organizations_v1 (id, name)
SELECT DISTINCT work_item.organization_id, 'Imported organization ' || work_item.organization_id
FROM agent_work_os_work_items_v1 AS work_item
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_work_os_work_items_org_fk_v1'
  ) THEN
    BEGIN
      ALTER TABLE agent_work_os_work_items_v1
        ADD CONSTRAINT agent_work_os_work_items_org_fk_v1
        FOREIGN KEY (organization_id) REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
