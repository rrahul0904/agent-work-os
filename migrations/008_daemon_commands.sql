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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agent_work_os_daemon_commands_v1'
      AND column_name = 'ack_reconciliation_status'
  ) THEN
    ALTER TABLE agent_work_os_daemon_commands_v1
      ADD COLUMN ack_reconciliation_status TEXT NOT NULL DEFAULT 'complete'
      CHECK (ack_reconciliation_status IN ('pending', 'processing', 'complete'));
    ALTER TABLE agent_work_os_daemon_commands_v1
      ADD COLUMN ack_reconciliation_owner_instance_id UUID;
    ALTER TABLE agent_work_os_daemon_commands_v1
      ADD COLUMN ack_reconciliation_lease_expires_at TIMESTAMPTZ;
    UPDATE agent_work_os_daemon_commands_v1
      SET ack_reconciliation_status = 'pending'
      WHERE status = 'failed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agent_work_os_command_ack_reconciliation_v1()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status <> 'failed'
     AND NEW.ack_reconciliation_status = 'complete' THEN
    NEW.ack_reconciliation_status := 'pending';
    NEW.ack_reconciliation_owner_instance_id := NULL;
    NEW.ack_reconciliation_lease_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agent_work_os_command_ack_reconciliation_v1'
      AND tgrelid = 'agent_work_os_daemon_commands_v1'::regclass
      AND NOT tgisinternal
  ) THEN
    UPDATE agent_work_os_daemon_commands_v1
      SET ack_reconciliation_status = 'pending', ack_reconciliation_owner_instance_id = NULL,
          ack_reconciliation_lease_expires_at = NULL
      WHERE status = 'failed' AND ack_reconciliation_status = 'complete';
    CREATE TRIGGER agent_work_os_command_ack_reconciliation_v1
      BEFORE UPDATE OF status ON agent_work_os_daemon_commands_v1
      FOR EACH ROW EXECUTE FUNCTION agent_work_os_command_ack_reconciliation_v1();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_work_os_daemon_commands_pending_v1
  ON agent_work_os_daemon_commands_v1 (machine_id, created_at)
  WHERE status IN ('pending', 'dispatching');

CREATE INDEX IF NOT EXISTS agent_work_os_daemon_commands_ack_reconciliation_v1
  ON agent_work_os_daemon_commands_v1 (updated_at, command_id)
  WHERE status = 'failed' AND ack_reconciliation_status IN ('pending', 'processing');
