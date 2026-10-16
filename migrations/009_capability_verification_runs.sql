CREATE TABLE IF NOT EXISTS agent_work_os_capability_verification_runs_v1 (
  run_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  machine_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE REFERENCES agent_work_os_sessions_v1(session_id) ON DELETE RESTRICT,
  created_by TEXT REFERENCES agent_work_os_users_v1(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (organization_id, machine_id)
    REFERENCES agent_work_os_machines_v1 (organization_id, machine_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_work_os_capability_verification_runs_org_updated_v1
  ON agent_work_os_capability_verification_runs_v1 (organization_id, updated_at DESC, run_id);

CREATE INDEX IF NOT EXISTS agent_work_os_capability_verification_runs_machine_v1
  ON agent_work_os_capability_verification_runs_v1 (organization_id, machine_id, created_at DESC);
