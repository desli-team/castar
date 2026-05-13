-- Budget advanced limits alignment
ALTER TABLE budgets ADD COLUMN warning_threshold REAL NOT NULL DEFAULT 80;
ALTER TABLE budgets ADD COLUMN critical_threshold REAL NOT NULL DEFAULT 100;
ALTER TABLE budgets ADD COLUMN is_hard_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budgets ADD COLUMN rollover_enabled INTEGER NOT NULL DEFAULT 0;
