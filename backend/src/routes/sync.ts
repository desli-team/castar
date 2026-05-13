/**
 * Castar — Sync Routes
 *
 * POST /sync/push     — Bulk push from client sync_queue → D1
 * POST /sync/pull     — Pull server changes since last_synced_at
 * POST /sync/full     — Push + pull in one request
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import { getTransactionBalanceAdjustments } from '../services/transactionBalance';
import type { Env, Variables } from '../types';
import { getUserAccess } from '../services/entitlements';

const sync = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const ALLOWED_TABLES = ['categories', 'accounts', 'transactions', 'budgets', 'recurrings', 'debts', 'debt_repayments', 'audit_logs'] as const;
type TableName = (typeof ALLOWED_TABLES)[number];

const syncOperationSchema = z.object({
  table: z.enum(ALLOWED_TABLES),
  record_id: z.string().min(1),
  action: z.enum(['create', 'update', 'delete']),
  data: z.record(z.string(), z.unknown()).optional(), // required for create/update, ignored for delete
});

const pushSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(500),
});

const pullSchema = z.object({
  last_synced_at: z.number().int().min(0),
  tables: z.array(z.enum(ALLOWED_TABLES)).optional(), // if omitted, pull all tables
  cursors: z.record(z.string(), z.union([z.number().int().min(0), z.string()])).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
});

const fullSyncSchema = z.object({
  operations: z.array(syncOperationSchema).max(500).default([]),
  last_synced_at: z.number().int().min(0).default(0),
  tables: z.array(z.enum(ALLOWED_TABLES)).optional(),
  cursors: z.record(z.string(), z.union([z.number().int().min(0), z.string()])).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
});

const registerDeviceSchema = z.object({
  id: z.string().min(8).max(120),
  name: z.string().max(80).optional(),
  platform: z.string().max(40).optional(),
});

// ── Allowed columns per table (whitelist to prevent injection) ──

const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  categories: ['id', 'user_id', 'name', 'icon', 'color', 'type', 'is_default', 'sort_order', 'created_at', 'updated_at'],
  accounts: ['id', 'user_id', 'name', 'type', 'currency', 'balance', 'icon', 'color', 'is_archived', 'created_at', 'updated_at'],
  transactions: ['id', 'user_id', 'account_id', 'category_id', 'type', 'amount', 'currency', 'description', 'date', 'is_recurring', 'recurring_id', 'debt_id', 'voice_input', 'reviewed', 'created_at', 'updated_at'],
  budgets: ['id', 'user_id', 'category_id', 'name', 'amount', 'currency', 'period', 'start_date', 'warning_threshold', 'critical_threshold', 'is_hard_limit', 'rollover_enabled', 'is_active', 'created_at', 'updated_at'],
  recurrings: ['id', 'user_id', 'account_id', 'category_id', 'type', 'amount', 'currency', 'description', 'frequency', 'next_date', 'is_active', 'created_at', 'updated_at'],
  debts: ['id', 'user_id', 'person_name', 'direction', 'principal_amount', 'remaining_amount', 'currency', 'category_id', 'account_id', 'due_date', 'note', 'status', 'settled_at', 'created_at', 'updated_at'],
  debt_repayments: ['id', 'user_id', 'debt_id', 'transaction_id', 'account_id', 'amount', 'currency', 'note', 'date', 'created_at', 'updated_at'],
  audit_logs: ['id', 'user_id', 'entity_type', 'entity_id', 'action', 'before_json', 'after_json', 'source', 'created_at', 'updated_at'],
};

// Columns that clients cannot set (always forced server-side)
const PROTECTED_COLUMNS = new Set(['user_id']);

// ── Helpers ──

interface OpResult {
  record_id: string;
  table: string;
  action: string;
  ok: boolean;
  error?: string;
}

interface TombstoneRow {
  table_name: TableName;
  record_id: string;
  deleted_at: number;
}

interface UpdatedRow {
  id: string;
  updated_at: number;
}

type SyncCursor = number | string;

function parseCursor(cursor: SyncCursor | undefined, fallback: number) {
  if (typeof cursor === 'number') return { timestamp: cursor, id: '' };
  if (!cursor) return { timestamp: fallback, id: '' };
  const [timestamp, ...idParts] = cursor.split(':');
  const parsedTimestamp = Number(timestamp);
  return {
    timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallback,
    id: idParts.join(':'),
  };
}

function formatCursor(timestamp: number, id: string) {
  return `${timestamp}:${id}`;
}

async function ensureRecordOwned(db: D1Database, userId: string, table: TableName, recordId: string): Promise<OpResult | null> {
  const existing = await db
    .prepare(`SELECT user_id FROM ${table} WHERE id = ?`)
    .bind(recordId)
    .first<{ user_id: string }>();

  if (existing && existing.user_id !== userId) {
    return { record_id: recordId, table, action: 'create', ok: false, error: 'Record id already belongs to another user' };
  }

  return null;
}

async function validateOwnedRef(
  db: D1Database,
  userId: string,
  table: 'accounts' | 'categories' | 'debts' | 'recurrings' | 'transactions',
  id: unknown,
  label: string,
): Promise<string | null> {
  if (id === undefined || id === null || id === '') return null;
  if (typeof id !== 'string') return `${label} must be a string`;

  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).first();
  return row ? null : `${label} does not belong to the authenticated user`;
}

async function validateOwnedRefs(db: D1Database, userId: string, table: TableName, data: Record<string, unknown>): Promise<string | null> {
  if ('account_id' in data) {
    const error = await validateOwnedRef(db, userId, 'accounts', data.account_id, 'account_id');
    if (error) return error;
  }
  if ('category_id' in data) {
    const error = await validateOwnedRef(db, userId, 'categories', data.category_id, 'category_id');
    if (error) return error;
  }
  if (table === 'transactions' && 'debt_id' in data) {
    const error = await validateOwnedRef(db, userId, 'debts', data.debt_id, 'debt_id');
    if (error) return error;
  }
  if (table === 'transactions' && 'recurring_id' in data) {
    const error = await validateOwnedRef(db, userId, 'recurrings', data.recurring_id, 'recurring_id');
    if (error) return error;
  }
  if (table === 'debt_repayments') {
    if ('debt_id' in data) {
      const error = await validateOwnedRef(db, userId, 'debts', data.debt_id, 'debt_id');
      if (error) return error;
    }
    if ('transaction_id' in data) {
      const error = await validateOwnedRef(db, userId, 'transactions', data.transaction_id, 'transaction_id');
      if (error) return error;
    }
  }
  return null;
}


const LOCKED_OTHER_KEYS = new Set(['categories.other_expense', 'categories.other_income']);

async function getCategoryPolicyRow(db: D1Database, userId: string, categoryId: string) {
  return db
    .prepare('SELECT id, name, is_default FROM categories WHERE id = ? AND user_id = ?')
    .bind(categoryId, userId)
    .first<{ id: string; name: string; is_default: number }>();
}

function isLockedOtherCategory(row: { name: string; is_default: number } | null | undefined) {
  return Boolean(row?.is_default && LOCKED_OTHER_KEYS.has(row.name));
}

function balanceStatement(db: D1Database, userId: string, accountId: string | null | undefined, type: string, amount: number, revert = false) {
  if (!accountId) return null;
  const sign = type === 'income' ? 1 : -1;
  const delta = revert ? -sign * amount : sign * amount;
  return db
    .prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(delta, Date.now(), accountId, userId);
}

/** Process a single create operation without replacing existing rows. */
async function processCreate(
  db: D1Database, userId: string, table: TableName, recordId: string, data: Record<string, unknown>,
): Promise<OpResult> {
  const ownershipError = await ensureRecordOwned(db, userId, table, recordId);
  if (ownershipError) return ownershipError;

  const refError = await validateOwnedRefs(db, userId, table, data);
  if (refError) return { record_id: recordId, table, action: 'create', ok: false, error: refError };
  if ((table === 'transactions' || table === 'recurrings') && data.type !== undefined && data.type !== 'income' && data.type !== 'expense') {
    return { record_id: recordId, table, action: 'create', ok: false, error: 'Unsupported transaction type' };
  }
  if (table === 'categories') {
    const access = await getUserAccess(db, userId);
    if (data.is_default !== 1 && data.is_default !== true && !access.entitlements.canCreateCustomCategories) {
      return { record_id: recordId, table, action: 'create', ok: false, error: 'Free plan includes starter categories only. Upgrade to create custom categories.' };
    }
  }

  const existing = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`)
    .bind(recordId, userId)
    .first<{ id: string }>();
  if (existing) {
    if (table === 'audit_logs') return { record_id: recordId, table, action: 'create', ok: true };
    return processUpdate(db, userId, table, recordId, data);
  }

  const allowed = TABLE_COLUMNS[table];
  const now = Date.now();

  // Build column/value pairs, only allowing whitelisted columns
  const cols: string[] = [];
  const vals: unknown[] = [];

  for (const col of allowed) {
    if (col === 'user_id') {
      cols.push(col);
      vals.push(userId); // always force to authenticated user
    } else if (col === 'id') {
      cols.push(col);
      vals.push(recordId);
    } else if (col === 'created_at' && data[col] != null) {
      cols.push(col);
      vals.push(data[col]);
    } else if (col === 'updated_at') {
      cols.push(col);
      vals.push(data[col] ?? now);
    } else if (data[col] !== undefined) {
      cols.push(col);
      vals.push(data[col] ?? null);
    }
  }

  // Ensure required columns
  if (!cols.includes('created_at')) {
    cols.push('created_at');
    vals.push(now);
  }
  if (!cols.includes('updated_at')) {
    cols.push('updated_at');
    vals.push(now);
  }

  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  const statements = [db.prepare(sql).bind(...vals)];

  if (table === 'transactions' && data.account_id && data.type && data.amount) {
    const balanceUpdate = balanceStatement(db, userId, data.account_id as string, data.type as string, data.amount as number);
    if (balanceUpdate) statements.push(balanceUpdate);
  }

  await db.batch(statements);
  if (table !== 'audit_logs') {
    await clearTombstone(db, userId, table, recordId);
  }

  return { record_id: recordId, table, action: 'create', ok: true };
}

/** Process a single update operation */
async function processUpdate(
  db: D1Database, userId: string, table: TableName, recordId: string, data: Record<string, unknown>,
): Promise<OpResult> {
  const refError = await validateOwnedRefs(db, userId, table, data);
  if (refError) return { record_id: recordId, table, action: 'update', ok: false, error: refError };
  if ((table === 'transactions' || table === 'recurrings') && data.type !== undefined && data.type !== 'income' && data.type !== 'expense') {
    return { record_id: recordId, table, action: 'update', ok: false, error: 'Unsupported transaction type' };
  }
  if (table === 'categories') {
    const existingCategory = await getCategoryPolicyRow(db, userId, recordId);
    if (isLockedOtherCategory(existingCategory) && (data.name !== undefined || data.type !== undefined)) {
      return { record_id: recordId, table, action: 'update', ok: false, error: 'Other category name and type cannot be changed' };
    }
  }

  const allowed = TABLE_COLUMNS[table];
  const now = Date.now();

  // For transactions, check if account/amount/type changed for balance adjustment
  let existingTx: { account_id: string | null; type: string; amount: number } | null = null;
  if (table === 'transactions' && (data.account_id !== undefined || data.amount !== undefined || data.type !== undefined)) {
    existingTx = await db
      .prepare('SELECT account_id, type, amount FROM transactions WHERE id = ? AND user_id = ?')
      .bind(recordId, userId)
      .first<{ account_id: string | null; type: string; amount: number }>();
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const col of allowed) {
    if (PROTECTED_COLUMNS.has(col) || col === 'id' || col === 'created_at') continue;
    if (col === 'updated_at') continue; // handled separately
    if (data[col] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(data[col] ?? null);
    }
  }

  if (sets.length === 0) {
    return { record_id: recordId, table, action: 'update', ok: true };
  }

  sets.push('updated_at = ?');
  values.push(data.updated_at ?? now);
  values.push(recordId, userId);

  const statements = [db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values)];

  // Adjust balance for transaction account/amount/type changes
  if (table === 'transactions' && existingTx) {
    const adjustments = getTransactionBalanceAdjustments(
      { accountId: existingTx.account_id, type: existingTx.type, amount: existingTx.amount },
      {
        accountId: data.account_id !== undefined ? (data.account_id as string | null) : existingTx.account_id,
        type: (data.type as string) ?? existingTx.type,
        amount: (data.amount as number) ?? existingTx.amount,
      },
    );

    for (const adjustment of adjustments) {
      const statement = balanceStatement(db, userId, adjustment.accountId, adjustment.type, adjustment.amount, adjustment.revert);
      if (statement) statements.push(statement);
    }
  }

  await db.batch(statements);

  return { record_id: recordId, table, action: 'update', ok: true };
}

/** Process a single delete operation */
async function processDelete(
  db: D1Database, userId: string, table: TableName, recordId: string,
): Promise<OpResult> {
  const deletedAt = Date.now();
  if (table === 'audit_logs') {
    return { record_id: recordId, table, action: 'delete', ok: false, error: 'Audit logs are append-only' };
  }

  let transactionBalanceRevert: D1PreparedStatement | null = null;
  if (table === 'transactions') {
    const existing = await db
      .prepare('SELECT account_id, type, amount FROM transactions WHERE id = ? AND user_id = ?')
      .bind(recordId, userId)
      .first<{ account_id: string | null; type: string; amount: number }>();

    if (existing) {
      transactionBalanceRevert = balanceStatement(db, userId, existing.account_id, existing.type, existing.amount, true);
    }
  }

  // For categories, keep locked Other as the permanent fallback.
  if (table === 'categories') {
    const existingCategory = await getCategoryPolicyRow(db, userId, recordId);
    if (isLockedOtherCategory(existingCategory)) {
      return { record_id: recordId, table, action: 'delete', ok: false, error: 'Cannot delete Other category' };
    }
    await db.prepare('UPDATE transactions SET category_id = NULL, updated_at = ? WHERE category_id = ? AND user_id = ?')
      .bind(Date.now(), recordId, userId).run();
    await db.prepare('UPDATE budgets SET category_id = NULL, updated_at = ? WHERE category_id = ? AND user_id = ?')
      .bind(Date.now(), recordId, userId).run();
    await db.prepare('UPDATE debts SET category_id = NULL, updated_at = ? WHERE category_id = ? AND user_id = ?')
      .bind(Date.now(), recordId, userId).run();
  }

  if (table === 'accounts') {
    await db.prepare('UPDATE debts SET account_id = NULL, updated_at = ? WHERE account_id = ? AND user_id = ?')
      .bind(Date.now(), recordId, userId).run();
    await db.prepare('UPDATE debt_repayments SET account_id = NULL, updated_at = ? WHERE account_id = ? AND user_id = ?')
      .bind(Date.now(), recordId, userId).run();
  }

  const deleteStatements: D1PreparedStatement[] = [];
  if (transactionBalanceRevert) deleteStatements.push(transactionBalanceRevert);

  // Soft delete for accounts and budgets, hard delete for others
  if (table === 'accounts') {
    deleteStatements.push(db.prepare('UPDATE accounts SET is_archived = 1, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(deletedAt, recordId, userId));
  } else if (table === 'budgets') {
    deleteStatements.push(db.prepare('UPDATE budgets SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(deletedAt, recordId, userId));
  } else {
    deleteStatements.push(db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`)
      .bind(recordId, userId));
  }
  await db.batch(deleteStatements);

  await recordTombstone(db, userId, table, recordId, deletedAt);

  return { record_id: recordId, table, action: 'delete', ok: true };
}

/** Pull changes from a single table using a stable updated_at/id cursor. */
async function pullTable(db: D1Database, userId: string, table: TableName, cursor: SyncCursor | undefined, fallbackSince: number, limit: number) {
  const parsedCursor = parseCursor(cursor, fallbackSince);
  const { results } = await db
    .prepare(`SELECT * FROM ${table} WHERE user_id = ? AND (updated_at > ? OR (updated_at = ? AND id > ?)) ORDER BY updated_at ASC, id ASC LIMIT ?`)
    .bind(userId, parsedCursor.timestamp, parsedCursor.timestamp, parsedCursor.id, limit + 1)
    .all<UpdatedRow>();
  const rows = results.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore: results.length > limit,
    nextCursor: last ? formatCursor(last.updated_at, last.id) : formatCursor(parsedCursor.timestamp, parsedCursor.id),
  };
}

async function pullTombstones(db: D1Database, userId: string, tables: TableName[], cursor: SyncCursor | undefined, fallbackSince: number, limit: number) {
  const parsedCursor = parseCursor(cursor, fallbackSince);
  if (tables.length === 0) return { rows: [] as TombstoneRow[], hasMore: false, nextCursor: formatCursor(parsedCursor.timestamp, parsedCursor.id) };
  const placeholders = tables.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT table_name, record_id, deleted_at
       FROM sync_tombstones
       WHERE user_id = ?
         AND (deleted_at > ? OR (deleted_at = ? AND record_id > ?))
         AND table_name IN (${placeholders})
       ORDER BY deleted_at ASC, record_id ASC
       LIMIT ?`,
    )
    .bind(userId, parsedCursor.timestamp, parsedCursor.timestamp, parsedCursor.id, ...tables, limit + 1)
    .all<TombstoneRow>();
  const rows = results.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore: results.length > limit,
    nextCursor: last ? formatCursor(last.deleted_at, last.record_id) : formatCursor(parsedCursor.timestamp, parsedCursor.id),
  };
}

// ── Routes ──

/** POST /sync/push — Bulk push operations from client */
sync.post('/push', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { operations } = parsed.data;
  const results: OpResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const op of operations) {
    try {
      let result: OpResult;

      switch (op.action) {
        case 'create':
          if (!op.data) throw new Error('Data required for create');
          result = await processCreate(db, userId, op.table, op.record_id, op.data as Record<string, unknown>);
          break;
        case 'update':
          if (!op.data) throw new Error('Data required for update');
          result = await processUpdate(db, userId, op.table, op.record_id, op.data as Record<string, unknown>);
          break;
        case 'delete':
          result = await processDelete(db, userId, op.table, op.record_id);
          break;
      }

      results.push(result);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      results.push({ record_id: op.record_id, table: op.table, action: op.action, ok: false, error });
      failed++;
    }
  }

  return c.json({
    ok: true,
    data: { processed, failed, results },
    server_time: Date.now(),
  });
});

/** POST /sync/pull — Pull server changes since last_synced_at */
sync.post('/pull', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = pullSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { last_synced_at, tables, cursors, limit } = parsed.data;
  const tablesToPull = tables ?? [...ALLOWED_TABLES];

  const changes: Record<string, unknown[]> = {};
  const nextCursors: Record<string, string> = {};
  let totalChanges = 0;
  let hasMore = false;

  for (const table of tablesToPull) {
    const page = await pullTable(db, userId, table, cursors?.[table], last_synced_at, limit);
    changes[table] = page.rows;
    totalChanges += page.rows.length;
    nextCursors[table] = page.nextCursor;
    hasMore = hasMore || page.hasMore;
  }

  const tombstones = await pullTombstones(db, userId, tablesToPull, cursors?.deletions, last_synced_at, limit);
  totalChanges += tombstones.rows.length;
  nextCursors.deletions = tombstones.nextCursor;
  hasMore = hasMore || tombstones.hasMore;

  return c.json({
    ok: true,
    data: {
      changes,
      deletions: tombstones.rows,
      next_cursors: nextCursors,
      has_more: hasMore,
      total_changes: totalChanges,
      server_time: Date.now(),
    },
  });
});

/** POST /sync/full — Push local changes + pull server changes in one request */
sync.post('/full', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = fullSyncSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { operations, last_synced_at, tables, cursors, limit } = parsed.data;

  // Phase 1: Push local changes to server
  const pushResults: OpResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const op of operations) {
    try {
      let result: OpResult;

      switch (op.action) {
        case 'create':
          if (!op.data) throw new Error('Data required for create');
          result = await processCreate(db, userId, op.table, op.record_id, op.data as Record<string, unknown>);
          break;
        case 'update':
          if (!op.data) throw new Error('Data required for update');
          result = await processUpdate(db, userId, op.table, op.record_id, op.data as Record<string, unknown>);
          break;
        case 'delete':
          result = await processDelete(db, userId, op.table, op.record_id);
          break;
      }

      pushResults.push(result);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      pushResults.push({ record_id: op.record_id, table: op.table, action: op.action, ok: false, error });
      failed++;
    }
  }

  // Phase 2: Pull server changes
  const tablesToPull = tables ?? [...ALLOWED_TABLES];
  const changes: Record<string, unknown[]> = {};
  const nextCursors: Record<string, string> = {};
  let totalChanges = 0;
  let hasMore = false;

  for (const table of tablesToPull) {
    const page = await pullTable(db, userId, table, cursors?.[table], last_synced_at, limit);
    changes[table] = page.rows;
    totalChanges += page.rows.length;
    nextCursors[table] = page.nextCursor;
    hasMore = hasMore || page.hasMore;
  }

  const tombstones = await pullTombstones(db, userId, tablesToPull, cursors?.deletions, last_synced_at, limit);
  totalChanges += tombstones.rows.length;
  nextCursors.deletions = tombstones.nextCursor;
  hasMore = hasMore || tombstones.hasMore;

  return c.json({
    ok: true,
    data: {
      push: { processed, failed, results: pushResults },
      pull: { changes, deletions: tombstones.rows, next_cursors: nextCursors, has_more: hasMore, total_changes: totalChanges },
      server_time: Date.now(),
    },
  });
});

/** GET /sync/devices — List registered sync devices and current entitlement. */
sync.get('/devices', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const access = await getUserAccess(db, userId);
  const { results } = await db
    .prepare('SELECT id, name, platform, first_seen_at, last_seen_at, is_active FROM sync_devices WHERE user_id = ? ORDER BY last_seen_at DESC')
    .bind(userId)
    .all();

  return c.json({
    ok: true,
    data: {
      devices: results,
      entitlements: {
        can_use_multi_device_sync: access.entitlements.canUseMultiDeviceSync,
        max_sync_devices: access.entitlements.maxSyncDevices,
      },
    },
  });
});

/** POST /sync/devices — Register or refresh this install as a sync device. */
sync.post('/devices', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = registerDeviceSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);

  const owner = await db
    .prepare('SELECT user_id FROM sync_devices WHERE id = ?')
    .bind(parsed.data.id)
    .first<{ user_id: string }>();
  if (owner && owner.user_id !== userId) return c.json({ ok: false, error: 'Device id already belongs to another user.' }, 409);

  const access = await getUserAccess(db, userId);
  const active = await db
    .prepare('SELECT id FROM sync_devices WHERE user_id = ? AND is_active = 1')
    .bind(userId)
    .all<{ id: string }>();
  const existing = active.results.find((device) => device.id === parsed.data.id);
  if (!existing && active.results.length >= access.entitlements.maxSyncDevices) {
    return c.json({
      ok: false,
      error: access.entitlements.canUseMultiDeviceSync
        ? 'Sync device limit reached.'
        : 'Free plan includes one sync device. Upgrade to Premium for multi-device sync.',
      entitlements: {
        can_use_multi_device_sync: access.entitlements.canUseMultiDeviceSync,
        max_sync_devices: access.entitlements.maxSyncDevices,
      },
    }, 403);
  }

  const now = Date.now();
  await db
    .prepare(`INSERT INTO sync_devices (id, user_id, name, platform, first_seen_at, last_seen_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, platform = excluded.platform, last_seen_at = excluded.last_seen_at, is_active = 1`)
    .bind(parsed.data.id, userId, parsed.data.name ?? null, parsed.data.platform ?? null, now, now)
    .run();

  return c.json({ ok: true, data: { id: parsed.data.id } }, existing ? 200 : 201);
});

/** DELETE /sync/devices/:id — Deactivate a sync device slot. */
sync.delete('/devices/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');
  await c.env.DB
    .prepare('UPDATE sync_devices SET is_active = 0, last_seen_at = ? WHERE id = ? AND user_id = ?')
    .bind(Date.now(), deviceId, userId)
    .run();
  return c.json({ ok: true });
});

export { sync };
