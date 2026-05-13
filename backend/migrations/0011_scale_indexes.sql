-- Targeted indexes for sync pull and analytics/list scalability.
-- No schema shape changes.

-- Sync pull: SELECT * FROM table WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC
CREATE INDEX IF NOT EXISTS idx_categories_user_updated ON categories(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_accounts_user_updated ON accounts(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_updated ON transactions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_budgets_user_updated ON budgets(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_recurrings_user_updated ON recurrings(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_debts_user_updated ON debts(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_debt_repayments_user_updated ON debt_repayments(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_updated ON audit_logs(user_id, updated_at);

-- Transaction analytics and filtered lists.
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions(user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date ON transactions(user_id, category_id, date DESC);

-- Common account/debt filters.
CREATE INDEX IF NOT EXISTS idx_accounts_user_archived ON accounts(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_debts_user_status_updated ON debts(user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_debt_repayments_user_debt_date ON debt_repayments(user_id, debt_id, date);
