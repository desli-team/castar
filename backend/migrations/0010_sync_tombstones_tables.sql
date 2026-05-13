-- Align sync tombstone table constraint with current sync entities.
-- D1/SQLite cannot alter CHECK constraints in place, so rebuild sync_tombstones.

PRAGMA foreign_keys=off;

CREATE TABLE sync_tombstones_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('categories', 'accounts', 'transactions', 'budgets', 'recurrings', 'debts', 'debt_repayments')),
  record_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);

INSERT INTO sync_tombstones_new (id, user_id, table_name, record_id, deleted_at)
SELECT id, user_id, table_name, record_id, deleted_at
FROM sync_tombstones
WHERE table_name IN ('categories', 'accounts', 'transactions', 'budgets', 'recurrings', 'debts', 'debt_repayments');

DROP TABLE sync_tombstones;
ALTER TABLE sync_tombstones_new RENAME TO sync_tombstones;

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user_deleted ON sync_tombstones(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user_table ON sync_tombstones(user_id, table_name, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_tombstones_unique_record ON sync_tombstones(user_id, table_name, record_id);

PRAGMA foreign_keys=on;
