CREATE TABLE IF NOT EXISTS agent_work_os_realtime_events_v1 (
  event_id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agent_work_os_realtime_events_v1_migration')::bigint);
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_work_os_realtime_events_v1' AND column_name = 'event_key'
  ) THEN
    ALTER TABLE agent_work_os_realtime_events_v1 ADD COLUMN event_key TEXT;
    UPDATE agent_work_os_realtime_events_v1 SET event_key = 'legacy-' || event_id::text;
    ALTER TABLE agent_work_os_realtime_events_v1 ALTER COLUMN event_key SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS agent_work_os_realtime_events_key_v1
  ON agent_work_os_realtime_events_v1 (event_key);

CREATE INDEX IF NOT EXISTS agent_work_os_realtime_events_created_v1
  ON agent_work_os_realtime_events_v1 (created_at);
