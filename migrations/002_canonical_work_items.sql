CREATE TABLE IF NOT EXISTS agent_work_os_work_items_v1 (
  id TEXT PRIMARY KEY CHECK (id ~ '^work_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  organization_id TEXT NOT NULL CHECK (organization_id ~ '^org_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  project_id TEXT CHECK (project_id IS NULL OR project_id ~ '^project_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  status TEXT NOT NULL CHECK (status IN ('backlog', 'ready', 'running', 'blocked', 'verifying', 'complete', 'failed', 'interrupted')),
  version BIGINT NOT NULL CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (created_by ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_work_os_work_items_org_updated_v1
  ON agent_work_os_work_items_v1 (organization_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS agent_work_os_work_item_events_v1 (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^event_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  work_item_id TEXT NOT NULL REFERENCES agent_work_os_work_items_v1(id) ON DELETE RESTRICT,
  command_id TEXT NOT NULL UNIQUE CHECK (command_id ~ '^command_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id TEXT NOT NULL CHECK (actor_id ~ '^(user|agent|service)_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  version BIGINT NOT NULL CHECK (version >= 1),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'ready', 'running', 'blocked', 'verifying', 'complete', 'failed', 'interrupted')),
  to_status TEXT NOT NULL CHECK (to_status IN ('backlog', 'ready', 'running', 'blocked', 'verifying', 'complete', 'failed', 'interrupted')),
  request_digest TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 2000),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (work_item_id, version)
);

CREATE INDEX IF NOT EXISTS agent_work_os_work_item_events_history_v1
  ON agent_work_os_work_item_events_v1 (work_item_id, version);
