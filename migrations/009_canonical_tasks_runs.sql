CREATE UNIQUE INDEX IF NOT EXISTS agent_work_os_work_items_org_id_uq_v1
  ON agent_work_os_work_items_v1 (organization_id, id);

CREATE TABLE IF NOT EXISTS agent_work_os_tasks_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^task_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  organization_id TEXT NOT NULL CHECK (organization_id ~ '^org_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  work_item_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  status TEXT NOT NULL CHECK (status IN ('READY', 'ACTIVE', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  version BIGINT NOT NULL CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (created_by ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, work_item_id)
    REFERENCES agent_work_os_work_items_v1 (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_work_os_tasks_org_updated_v1
  ON agent_work_os_tasks_v1 (organization_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS agent_work_os_task_events_v1 (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^event_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  task_id TEXT NOT NULL REFERENCES agent_work_os_tasks_v1 (id) ON DELETE RESTRICT,
  command_id TEXT NOT NULL UNIQUE CHECK (command_id ~ '^command_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id TEXT NOT NULL CHECK (actor_id ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  version BIGINT NOT NULL CHECK (version >= 1),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('READY', 'ACTIVE', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('READY', 'ACTIVE', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  request_digest TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, version)
);

CREATE TABLE IF NOT EXISTS agent_work_os_task_runs_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^run_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  organization_id TEXT NOT NULL CHECK (organization_id ~ '^org_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'LEASED', 'PREPARING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED', 'RECOVERING')),
  version BIGINT NOT NULL CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (created_by ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, attempt),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES agent_work_os_tasks_v1 (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_work_os_task_runs_org_updated_v1
  ON agent_work_os_task_runs_v1 (organization_id, updated_at DESC, id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_work_os_task_runs_one_active_v1
  ON agent_work_os_task_runs_v1 (task_id)
  WHERE status IN ('QUEUED', 'LEASED', 'PREPARING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'VERIFYING', 'RECOVERING');

CREATE TABLE IF NOT EXISTS agent_work_os_task_run_events_v1 (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^event_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  run_id TEXT NOT NULL REFERENCES agent_work_os_task_runs_v1 (id) ON DELETE RESTRICT,
  command_id TEXT NOT NULL UNIQUE CHECK (command_id ~ '^command_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id TEXT NOT NULL CHECK (actor_id ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  version BIGINT NOT NULL CHECK (version >= 1),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('QUEUED', 'LEASED', 'PREPARING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED', 'RECOVERING')),
  to_status TEXT NOT NULL CHECK (to_status IN ('QUEUED', 'LEASED', 'PREPARING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED', 'RECOVERING')),
  request_digest TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (run_id, version)
);
