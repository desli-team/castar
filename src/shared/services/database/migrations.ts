import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db, rawDb } from './connection';
import migrations from './drizzle/migrations';

/**
 * Bridge: if the app was running the old raw-SQL migration system
 * (schema_migrations table), record the baseline in Drizzle's
 * __drizzle_migrations so it doesn't re-run the initial migration.
 */
function bridgeFromLegacy(): void {
  const legacy = rawDb.getFirstSync<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = 1 LIMIT 1"
  );
  if (!legacy) return;

  // Drizzle's migration table
  rawDb.execSync(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )
  `);

  const alreadyBridged = rawDb.getFirstSync<{ id: number }>(
    "SELECT id FROM __drizzle_migrations WHERE hash = '0000_strong_ares' LIMIT 1"
  );
  if (alreadyBridged) return;

  rawDb.runSync(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    '0000_strong_ares',
    Date.now()
  );

  // Drop legacy table — no longer needed
  rawDb.execSync('DROP TABLE IF EXISTS schema_migrations');
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const existing = rawDb.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (existing.some((item) => item.name === column)) return;
  rawDb.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureBudgetFourteenDayPeriod(): void {
  const table = rawDb.getFirstSync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='budgets'"
  );
  if (!table?.sql || table.sql.includes('fourteen_days')) return;

  rawDb.execSync(`
    PRAGMA foreign_keys=off;

    CREATE TABLE IF NOT EXISTS budgets_next (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
      user_id TEXT NOT NULL,
      family_group_id TEXT,
      category_id TEXT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'fourteen_days', 'monthly', 'yearly')),
      start_date INTEGER NOT NULL,
      end_date INTEGER,
      warning_threshold REAL NOT NULL DEFAULT 80,
      critical_threshold REAL NOT NULL DEFAULT 100,
      is_hard_limit INTEGER NOT NULL DEFAULT 0,
      rollover_enabled INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    INSERT INTO budgets_next (
      id, remote_id, user_id, family_group_id, category_id, name, amount, currency, period, start_date, end_date,
      warning_threshold, critical_threshold, is_hard_limit, rollover_enabled, is_active, created_at, updated_at, synced_at
    )
    SELECT
      id, remote_id, user_id, family_group_id, category_id, name, amount, currency, period, start_date, end_date,
      COALESCE(warning_threshold, 80), COALESCE(critical_threshold, 100), COALESCE(is_hard_limit, 0),
      COALESCE(rollover_enabled, 0), is_active, created_at, updated_at, synced_at
    FROM budgets;

    DROP TABLE budgets;
    ALTER TABLE budgets_next RENAME TO budgets;
    CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, is_active);

    PRAGMA foreign_keys=on;
  `);
}

function runSafeSchemaPatches(): void {
  addColumnIfMissing('budgets', 'warning_threshold', 'REAL NOT NULL DEFAULT 80');
  addColumnIfMissing('budgets', 'critical_threshold', 'REAL NOT NULL DEFAULT 100');
  addColumnIfMissing('budgets', 'is_hard_limit', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('budgets', 'rollover_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureBudgetFourteenDayPeriod();
  addColumnIfMissing('transactions', 'debt_id', 'TEXT');
  addColumnIfMissing('transactions', 'reviewed', 'INTEGER NOT NULL DEFAULT 0');

  rawDb.execSync(`
    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
      user_id TEXT NOT NULL,
      person_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      principal_amount REAL NOT NULL,
      remaining_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      category_id TEXT,
      account_id TEXT,
      due_date INTEGER,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      settled_at INTEGER,
      synced_at INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_debts_person ON debts(user_id, person_name);

    CREATE TABLE IF NOT EXISTS debt_repayments (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
      user_id TEXT NOT NULL,
      debt_id TEXT NOT NULL,
      transaction_id TEXT,
      account_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      note TEXT,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      FOREIGN KEY (debt_id) REFERENCES debts(id),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_debt_repayments_user ON debt_repayments(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_debt_repayments_debt ON debt_repayments(debt_id, date);

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      budget_id TEXT NOT NULL,
      level TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      spent REAL NOT NULL,
      limit_amount REAL NOT NULL,
      percentage REAL NOT NULL,
      acknowledged_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_user ON budget_alerts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget_period ON budget_alerts(budget_id, period_start);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
      user_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      source TEXT NOT NULL DEFAULT 'app',
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_accounts_user_archived ON accounts(user_id, is_archived);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions(user_id, type, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date ON transactions(user_id, category_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_updated ON transactions(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_categories_user_updated ON categories(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_updated ON accounts(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_updated ON budgets(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_recurrings_user_updated ON recurrings(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_debts_user_updated ON debts(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_debts_user_status_updated ON debts(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_debt_repayments_user_updated ON debt_repayments(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_debt_repayments_user_debt_date ON debt_repayments(user_id, debt_id, date);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_record ON sync_queue(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending_created ON sync_queue(attempts, created_at);
  `);
}

export function runMigrations(): void {
  // Check if legacy migration system exists
  const hasLegacyTable = rawDb.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
  );
  if (hasLegacyTable) {
    bridgeFromLegacy();
  }

  migrate(db, migrations);
  runSafeSchemaPatches();
}
