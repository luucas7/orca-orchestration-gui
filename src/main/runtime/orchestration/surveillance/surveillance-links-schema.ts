export const SURVEILLANCE_LINKS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS surveillance_links (
  id                       TEXT PRIMARY KEY,
  watcher_handle           TEXT,
  watcher_orca_session_id  TEXT,
  watcher_name             TEXT NOT NULL,
  watcher_cli              TEXT NOT NULL,
  target_run_id            TEXT NOT NULL,
  target_node_id           TEXT,
  target_task_id           TEXT,
  target_dispatch_id       TEXT,
  declared_by              TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surveillance_links_target_run ON surveillance_links(target_run_id);

CREATE TRIGGER IF NOT EXISTS trg_runs_delete_surveillance_links
AFTER DELETE ON runs
BEGIN
  DELETE FROM surveillance_links WHERE target_run_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_delete_surveillance_links
AFTER DELETE ON tasks
BEGIN
  DELETE FROM surveillance_links WHERE target_task_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dispatches_delete_surveillance_links
AFTER DELETE ON dispatch_contexts
BEGIN
  DELETE FROM surveillance_links WHERE target_dispatch_id = OLD.id;
END;
`
