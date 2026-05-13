-- Add transaction review workflow flag for Analytics Pro.
-- Default keeps existing historical rows unreviewed so users can review/import cleanly.

ALTER TABLE transactions ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_transactions_user_reviewed_date ON transactions(user_id, reviewed, date DESC);
