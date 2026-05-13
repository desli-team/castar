-- Allow exact 14-day budget periods used by category limit UI.
-- D1/SQLite cannot alter CHECK constraints in place, so rebuild budgets.

PRAGMA foreign_keys=off;

CREATE TABLE budgets_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UZS',
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'fourteen_days', 'monthly', 'yearly')),
  start_date INTEGER NOT NULL,
  warning_threshold REAL NOT NULL DEFAULT 80,
  critical_threshold REAL NOT NULL DEFAULT 100,
  is_hard_limit INTEGER NOT NULL DEFAULT 0,
  rollover_enabled INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO budgets_new (
  id, user_id, category_id, name, amount, currency, period, start_date,
  warning_threshold, critical_threshold, is_hard_limit, rollover_enabled, is_active, created_at, updated_at
)
SELECT
  id, user_id, category_id, name, amount, currency, period, start_date,
  COALESCE(warning_threshold, 80), COALESCE(critical_threshold, 100), COALESCE(is_hard_limit, 0),
  COALESCE(rollover_enabled, 0), is_active, created_at, updated_at
FROM budgets;

DROP TABLE budgets;
ALTER TABLE budgets_new RENAME TO budgets;
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, is_active);

PRAGMA foreign_keys=on;
