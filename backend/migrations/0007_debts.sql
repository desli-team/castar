-- Debt/lending core tables and transaction links

ALTER TABLE transactions ADD COLUMN debt_id TEXT;

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('i_owe', 'owes_me')),
  principal_amount REAL NOT NULL,
  remaining_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UZS',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  due_date INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  settled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS debt_repayments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UZS',
  note TEXT,
  date INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_debt ON transactions(user_id, debt_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_person ON debts(user_id, person_name);
CREATE INDEX IF NOT EXISTS idx_debt_repayments_user ON debt_repayments(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_debt_repayments_debt ON debt_repayments(debt_id, date);
