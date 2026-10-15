CREATE TABLE IF NOT EXISTS agent_work_os_daemon_commands_v1 (
  command_id UUID PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES agent_work_os_machines_v1(machine_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatching', 'acked', 'failed')),
  owner_instance_id UUID,
  lease_expires_at TIMESTAMPTZ,
  ack_error TEXT,
  ack_reconciliation_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (ack_reconciliation_status IN ('pending', 'processing', 'complete')),
  ack_reconciliation_owner_instance_id UUID,
  ack_reconciliation_lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE agent_work_os_daemon_commands_v1
  ADD COLUMN IF NOT EXISTS ack_reconciliation_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (ack_reconciliation_status IN ('pending', 'processing', 'complete'));
ALTER TABLE agent_work_os_daemon_commands_v1
  ADD COLUMN IF NOT EXISTS ack_reconciliation_owner_instance_id UUID;
ALTER TABLE agent_work_os_daemon_commands_v1
  ADD COLUMN IF NOT EXISTS ack_reconciliation_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agent_work_os_daemon_commands_pending_v1
  ON agent_work_os_daemon_commands_v1 (machine_id, created_at)
  WHERE status IN ('pending', 'dispatching');

CREATE INDEX IF NOT EXISTS agent_work_os_daemon_commands_ack_reconciliation_v1
  ON agent_work_os_daemon_commands_v1 (updated_at, command_id)
  WHERE status = 'failed' AND ack_reconciliation_status IN ('pending', 'processing');
