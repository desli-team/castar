-- Local/client budget alert event parity for future sync/API support
CREATE TABLE IF NOT EXISTS budget_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('warning', 'critical', 'over')),
  period_start INTEGER NOT NULL,
  spent REAL NOT NULL,
  limit_amount REAL NOT NULL,
  percentage REAL NOT NULL,
  acknowledged_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_user ON budget_alerts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget_period ON budget_alerts(budget_id, period_start);
