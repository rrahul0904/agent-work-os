CREATE TABLE IF NOT EXISTS agent_work_os_machines_v1 (
  machine_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, machine_id)
);

CREATE INDEX IF NOT EXISTS agent_work_os_machines_org_v1
  ON agent_work_os_machines_v1 (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_work_os_sessions_v1 (
  session_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  machine_id TEXT NOT NULL,
  created_by TEXT REFERENCES agent_work_os_users_v1(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (organization_id, machine_id)
    REFERENCES agent_work_os_machines_v1 (organization_id, machine_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_work_os_sessions_org_updated_v1
  ON agent_work_os_sessions_v1 (organization_id, updated_at DESC, session_id);

CREATE INDEX IF NOT EXISTS agent_work_os_sessions_machine_v1
  ON agent_work_os_sessions_v1 (organization_id, machine_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_work_os_machine_session_migrations_v1 (
  version TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill only rows with explicit, internally consistent tenant ownership.
-- The original global snapshot remains untouched as the compatibility and recovery source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_work_os_machine_session_migrations_v1 WHERE version = '005_tenant_machines_sessions'
  ) THEN
    INSERT INTO agent_work_os_machines_v1 (machine_id, organization_id, status, record, updated_at)
    SELECT COALESCE(machine.value->>'id', machine.key), machine.value->>'organizationId',
           COALESCE(machine.value->>'status', 'offline'), machine.value, CURRENT_TIMESTAMP
    FROM agent_work_os_state_v1 AS state
    CROSS JOIN LATERAL jsonb_each(COALESCE(state.payload->'machines', '{}'::jsonb)) AS machine(key, value)
    JOIN agent_work_os_organizations_v1 AS org ON org.id = machine.value->>'organizationId'
    WHERE state.state_key = 'global'
    ON CONFLICT (machine_id) DO NOTHING;

    INSERT INTO agent_work_os_sessions_v1
      (session_id, organization_id, machine_id, created_by, status, record, created_at, updated_at)
    SELECT COALESCE(session.value->>'id', session.key), session.value->>'organizationId',
           session.value->>'machineId',
           (SELECT user_row.id FROM agent_work_os_users_v1 AS user_row WHERE user_row.id = session.value->>'createdBy'),
           COALESCE(session.value->>'status', 'unknown'), session.value,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM agent_work_os_state_v1 AS state
    CROSS JOIN LATERAL jsonb_each(COALESCE(state.payload->'sessions', '{}'::jsonb)) AS session(key, value)
    JOIN agent_work_os_machines_v1 AS machine
      ON machine.machine_id = session.value->>'machineId'
     AND machine.organization_id = session.value->>'organizationId'
    JOIN agent_work_os_organizations_v1 AS org ON org.id = session.value->>'organizationId'
    WHERE state.state_key = 'global'
    ON CONFLICT (session_id) DO NOTHING;

    INSERT INTO agent_work_os_machine_session_migrations_v1 (version)
    VALUES ('005_tenant_machines_sessions');
  END IF;
END $$;
