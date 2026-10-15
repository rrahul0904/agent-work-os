CREATE TABLE IF NOT EXISTS agent_work_os_shipping_runs_v1 (
  run_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES agent_work_os_organizations_v1(id) ON DELETE RESTRICT,
  machine_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id, machine_id)
    REFERENCES agent_work_os_machines_v1 (organization_id, machine_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_work_os_shipping_runs_org_updated_v1
  ON agent_work_os_shipping_runs_v1 (organization_id, updated_at DESC, run_id);

CREATE TABLE IF NOT EXISTS agent_work_os_shipping_run_migrations_v1 (
  version TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only migrate records whose explicit tenant and machine ownership can be proven.
-- Unowned legacy runs remain in the original snapshot for operator compatibility.
DO $$
BEGIN
  -- Serialize the marker check and backfill when multiple API replicas start together.
  PERFORM pg_advisory_xact_lock(hashtext('agent_work_os_shipping_runs_v1_backfill')::bigint);

  IF NOT EXISTS (
    SELECT 1 FROM agent_work_os_shipping_run_migrations_v1 WHERE version = '006_tenant_shipping_runs'
  ) THEN
    INSERT INTO agent_work_os_shipping_runs_v1
      (run_id, organization_id, machine_id, status, record, created_at, updated_at)
    SELECT COALESCE(run.value->>'runId', run.key), run.value->>'organizationId',
           run.value->>'machineId', COALESCE(run.value->>'state', 'unknown'), run.value,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM agent_work_os_state_v1 AS state
    CROSS JOIN LATERAL jsonb_each(COALESCE(state.payload->'shippingRuns', '{}'::jsonb)) AS run(key, value)
    JOIN agent_work_os_organizations_v1 AS org ON org.id = run.value->>'organizationId'
    JOIN agent_work_os_machines_v1 AS machine
      ON machine.machine_id = run.value->>'machineId'
     AND machine.organization_id = run.value->>'organizationId'
    WHERE state.state_key = 'global'
    ON CONFLICT (run_id) DO NOTHING;

    INSERT INTO agent_work_os_shipping_run_migrations_v1 (version)
    VALUES ('006_tenant_shipping_runs');
  END IF;
END $$;
