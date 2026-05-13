-- Sync tombstones for hard/soft deletes
-- Allows clients to pull deletions that happened after their last sync timestamp.

CREATE TABLE IF NOT EXISTS sync_tombstones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('categories', 'accounts', 'transactions', 'budgets', 'recurrings')),
  record_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user_deleted ON sync_tombstones(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user_table ON sync_tombstones(user_id, table_name, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_tombstones_unique_record ON sync_tombstones(user_id, table_name, record_id);
