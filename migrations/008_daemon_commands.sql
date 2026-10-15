CREATE TABLE IF NOT EXISTS agent_work_os_daemon_commands_v1 (
  command_id UUID PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES agent_work_os_machines_v1(machine_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatching', 'acked', 'failed')),
  owner_instance_id UUID,
  lease_expires_at TIMESTAMPTZ,
  ack_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS agent_work_os_daemon_commands_pending_v1
  ON agent_work_os_daemon_commands_v1 (machine_id, created_at)
  WHERE status IN ('pending', 'dispatching');
