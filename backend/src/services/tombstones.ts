const ALLOWED_SYNC_TABLES = ['categories', 'accounts', 'transactions', 'budgets', 'recurrings', 'debts', 'debt_repayments'] as const;

export type SyncTableName = (typeof ALLOWED_SYNC_TABLES)[number];

export async function recordTombstone(
  db: D1Database,
  userId: string,
  table: SyncTableName,
  recordId: string,
  deletedAt = Date.now(),
) {
  await db
    .prepare(
      `INSERT INTO sync_tombstones (id, user_id, table_name, record_id, deleted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, table_name, record_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
    )
    .bind(`${userId}:${table}:${recordId}`, userId, table, recordId, deletedAt)
    .run();
}

export async function clearTombstone(
  db: D1Database,
  userId: string,
  table: SyncTableName,
  recordId: string,
) {
  await db
    .prepare('DELETE FROM sync_tombstones WHERE user_id = ? AND table_name = ? AND record_id = ?')
    .bind(userId, table, recordId)
    .run();
}
