/**
 * Castar — Transaction Routes
 *
 * GET    /transactions          — List with filters (type, categoryId, dateFrom, dateTo, limit, offset)
 * POST   /transactions          — Create + adjust account balance
 * GET    /transactions/:id      — Get single
 * PUT    /transactions/:id      — Update
 * DELETE /transactions/:id      — Delete + revert account balance
 *
 * GET    /transactions/summary  — Aggregated totals (income, expense, net) for a period
 * GET    /transactions/income-analytics — Income grouped by source, currency, and month
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import { getTransactionBalanceAdjustments } from '../services/transactionBalance';
import type { Env, Variables } from '../types';

const transactions = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const createTransactionSchema = z.object({
  id: z.string().min(1),
  account_id: z.string().nullish(),
  category_id: z.string().nullish(),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  description: z.string().max(500).nullish(),
  date: z.number().int().positive(),
  is_recurring: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).default(0),
  recurring_id: z.string().nullish(),
  debt_id: z.string().nullish(),
  voice_input: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).default(0),
  reviewed: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).default(0),
});

const updateTransactionSchema = z.object({
  account_id: z.string().nullish(),
  category_id: z.string().nullish(),
  type: z.enum(['income', 'expense']).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().max(500).nullish(),
  date: z.number().int().positive().optional(),
  debt_id: z.string().nullish(),
  reviewed: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).optional(),
});

// ── Helpers ──

async function validateOwnedRef(
  db: D1Database,
  userId: string,
  table: 'accounts' | 'categories' | 'debts' | 'recurrings',
  id: string | null | undefined,
  label: string,
): Promise<string | null> {
  if (!id) return null;
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).first();
  return row ? null : `${label} does not belong to the authenticated user`;
}

async function validateTransactionRefs(
  db: D1Database,
  userId: string,
  data: { account_id?: string | null; category_id?: string | null; debt_id?: string | null; recurring_id?: string | null },
): Promise<string | null> {
  const accountError = await validateOwnedRef(db, userId, 'accounts', data.account_id, 'account_id');
  if (accountError) return accountError;
  const categoryError = await validateOwnedRef(db, userId, 'categories', data.category_id, 'category_id');
  if (categoryError) return categoryError;
  const debtError = await validateOwnedRef(db, userId, 'debts', data.debt_id, 'debt_id');
  if (debtError) return debtError;
  const recurringError = await validateOwnedRef(db, userId, 'recurrings', data.recurring_id, 'recurring_id');
  if (recurringError) return recurringError;
  return null;
}

function balanceStatement(db: D1Database, userId: string, accountId: string | null | undefined, type: string, amount: number, revert = false) {
  if (!accountId) return null;
  const sign = type === 'income' ? 1 : -1;
  const delta = revert ? -sign * amount : sign * amount;
  return db
    .prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(delta, Date.now(), accountId, userId);
}

// ── Routes ──

/** GET /transactions/summary — Aggregated totals for a period */
transactions.get('/summary', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');

  let sql = 'SELECT type, SUM(amount) as total FROM transactions WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (dateFrom) { sql += ' AND date >= ?'; params.push(Number(dateFrom)); }
  if (dateTo) { sql += ' AND date <= ?'; params.push(Number(dateTo)); }

  sql += ' GROUP BY type';

  const { results } = await db.prepare(sql).bind(...params).all<{ type: string; total: number }>();

  const summary = { income: 0, expense: 0, net: 0 };
  for (const row of results) {
    if (row.type === 'income') summary.income = row.total;
    else if (row.type === 'expense') summary.expense = row.total;
  }
  summary.net = summary.income - summary.expense;

  return c.json({ ok: true, data: summary });
});

/** GET /transactions/income-analytics — Income grouped by source, currency, and month */
transactions.get('/income-analytics', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');

  const where = ['t.user_id = ?', "t.type = 'income'"];
  const params: unknown[] = [userId];

  if (dateFrom) { where.push('t.date >= ?'); params.push(Number(dateFrom)); }
  if (dateTo) { where.push('t.date <= ?'); params.push(Number(dateTo)); }

  const whereSql = where.join(' AND ');

  const bySource = await db.prepare(
    `SELECT
       t.category_id as category_id,
       COALESCE(c.name, 'Income') as category_name,
       COALESCE(c.icon, '↗') as category_icon,
       COALESCE(c.color, '#09AD4D') as category_color,
       t.currency as currency,
       SUM(t.amount) as total,
       COUNT(*) as count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
     WHERE ${whereSql}
     GROUP BY t.category_id, t.currency
     ORDER BY total DESC`,
  ).bind(...params).all();

  const byCurrency = await db.prepare(
    `SELECT currency, SUM(amount) as total, COUNT(*) as count
     FROM transactions t
     WHERE ${whereSql}
     GROUP BY currency
     ORDER BY total DESC`,
  ).bind(...params).all();

  const monthlyTrend = await db.prepare(
    `SELECT strftime('%Y-%m', datetime(t.date / 1000, 'unixepoch')) as month,
            t.currency as currency,
            SUM(t.amount) as total,
            COUNT(*) as count
     FROM transactions t
     WHERE ${whereSql}
     GROUP BY month, t.currency
     ORDER BY month ASC`,
  ).bind(...params).all();

  const recent = await db.prepare(
    `SELECT
       t.id,
       COALESCE(t.description, c.name, 'Income') as title,
       COALESCE(c.name, 'Income') as source_name,
       COALESCE(c.icon, '↗') as icon,
       COALESCE(c.color, '#09AD4D') as color,
       t.amount,
       t.currency,
       t.date
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
     WHERE ${whereSql}
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT 5`,
  ).bind(...params).all();

  return c.json({
    ok: true,
    data: {
      bySource: bySource.results,
      byCurrency: byCurrency.results,
      monthlyTrend: monthlyTrend.results,
      recent: recent.results,
    },
  });
});

/** GET /transactions — List with filters */
transactions.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const type = c.req.query('type');
  const categoryId = c.req.query('category_id');
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const offset = Number(c.req.query('offset')) || 0;

  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (categoryId) { sql += ' AND category_id = ?'; params.push(categoryId); }
  if (dateFrom) { sql += ' AND date >= ?'; params.push(Number(dateFrom)); }
  if (dateTo) { sql += ' AND date <= ?'; params.push(Number(dateTo)); }

  sql += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await db.prepare(sql).bind(...params).all();

  return c.json({ ok: true, data: results });
});

/** POST /transactions — Create a transaction */
transactions.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = createTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const refError = await validateTransactionRefs(db, userId, data);
  if (refError) return c.json({ ok: false, error: refError }, 400);

  const now = Date.now();

  const statements = [
    db
      .prepare(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, currency, description, date, is_recurring, recurring_id, debt_id, voice_input, reviewed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        data.id, userId, data.account_id ?? null, data.category_id ?? null,
        data.type, data.amount, data.currency, data.description ?? null,
        data.date, data.is_recurring, data.recurring_id ?? null, data.debt_id ?? null,
        data.voice_input, data.reviewed, now, now,
      ),
  ];
  const balanceUpdate = balanceStatement(db, userId, data.account_id, data.type, data.amount);
  if (balanceUpdate) statements.push(balanceUpdate);
  await db.batch(statements);
  await clearTombstone(db, userId, 'transactions', data.id);

  return c.json({ ok: true, data: { id: data.id } }, 201);
});

/** GET /transactions/:id — Get a single transaction */
transactions.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const row = await db
    .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!row) return c.json({ ok: false, error: 'Transaction not found' }, 404);
  return c.json({ ok: true, data: row });
});

/** PUT /transactions/:id — Update a transaction */
transactions.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db
    .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ account_id: string | null; type: string; amount: number }>();

  if (!existing) return c.json({ ok: false, error: 'Transaction not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = updateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const refError = await validateTransactionRefs(db, userId, data);
  if (refError) return c.json({ ok: false, error: refError }, 400);

  const now = Date.now();

  const adjustments = getTransactionBalanceAdjustments(
    { accountId: existing.account_id, type: existing.type, amount: existing.amount },
    {
      accountId: data.account_id !== undefined ? (data.account_id ?? null) : existing.account_id,
      type: data.type ?? existing.type,
      amount: data.amount ?? existing.amount,
    },
  );

  const balanceUpdates = adjustments
    .map((adjustment) => balanceStatement(db, userId, adjustment.accountId, adjustment.type, adjustment.amount, adjustment.revert))
    .filter((statement): statement is D1PreparedStatement => Boolean(statement));

  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.account_id !== undefined) { sets.push('account_id = ?'); values.push(data.account_id ?? null); }
  if (data.category_id !== undefined) { sets.push('category_id = ?'); values.push(data.category_id ?? null); }
  if (data.type !== undefined) { sets.push('type = ?'); values.push(data.type); }
  if (data.amount !== undefined) { sets.push('amount = ?'); values.push(data.amount); }
  if (data.currency !== undefined) { sets.push('currency = ?'); values.push(data.currency); }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description ?? null); }
  if (data.date !== undefined) { sets.push('date = ?'); values.push(data.date); }
  if (data.debt_id !== undefined) { sets.push('debt_id = ?'); values.push(data.debt_id ?? null); }
  if (data.reviewed !== undefined) { sets.push('reviewed = ?'); values.push(data.reviewed); }

  if (sets.length === 0) return c.json({ ok: true, data: { id } });

  sets.push('updated_at = ?');
  values.push(now, id, userId);

  await db.batch([
    db
      .prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...values),
    ...balanceUpdates,
  ]);

  return c.json({ ok: true, data: { id } });
});

/** DELETE /transactions/:id — Delete a transaction + revert balance */
transactions.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db
    .prepare('SELECT account_id, type, amount FROM transactions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ account_id: string | null; type: string; amount: number }>();

  if (!existing) return c.json({ ok: false, error: 'Transaction not found' }, 404);

  const deletedAt = Date.now();
  const balanceUpdate = balanceStatement(db, userId, existing.account_id, existing.type, existing.amount, true);
  await db.batch([
    db
      .prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
      .bind(id, userId),
    ...(balanceUpdate ? [balanceUpdate] : []),
  ]);
  await recordTombstone(db, userId, 'transactions', id, deletedAt);

  return c.json({ ok: true });
});

export { transactions };
