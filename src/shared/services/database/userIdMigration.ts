import { rawDb } from './connection';

const USER_SCOPED_TABLES = [
  'categories',
  'accounts',
  'transactions',
  'budgets',
  'recurrings',
  'budget_alerts',
  'debts',
  'debt_repayments',
  'audit_logs',
] as const;

function tableExists(tableName: string): boolean {
  const table = rawDb.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    tableName,
  );
  return Boolean(table);
}

export function migrateLocalUserIds(legacyUserIds: string[], canonicalUserId: string): void {
  const uniqueLegacyIds = [...new Set(legacyUserIds.filter((id) => id && id !== canonicalUserId))];
  if (!uniqueLegacyIds.length) return;

  for (const tableName of USER_SCOPED_TABLES) {
    if (!tableExists(tableName)) continue;

    for (const legacyUserId of uniqueLegacyIds) {
      rawDb.runSync(
        `UPDATE ${tableName} SET user_id = ? WHERE user_id = ?`,
        canonicalUserId,
        legacyUserId,
      );
    }
  }
}
