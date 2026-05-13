/**
 * Castar — Debt/Lending Routes
 *
 * GET    /debts                    — List debts and IOUs
 * POST   /debts                    — Create debt
 * PUT    /debts/:id                — Update debt
 * POST   /debts/:id/repayments     — Add repayment + linked transaction
 * DELETE /debts/:id                — Delete debt record
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import type { Env, Variables } from '../types';

const debts = new Hono<{ Bindings: Env; Variables: Variables }>();

const createDebtSchema = z.object({
  id: z.string().min(1),
  person_name: z.string().min(1).max(120),
  direction: z.enum(['i_owe', 'owes_me']),
  principal_amount: z.number().positive(),
  remaining_amount: z.number().min(0).optional(),
  currency: z.string().min(3).max(3).default('UZS'),
  category_id: z.string().nullish(),
  account_id: z.string().nullish(),
  due_date: z.number().int().positive().nullish(),
  note: z.string().max(1000).nullish(),
});

const updateDebtSchema = createDebtSchema.omit({ id: true }).partial().extend({
  status: z.enum(['active', 'settled']).optional(),
  settled_at: z.number().int().positive().nullish(),
});

const repaymentSchema = z.object({
  id: z.string().min(1),
  transaction_id: z.string().min(1),
  account_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default('UZS'),
  note: z.string().max(1000).nullish(),
  date: z.number().int().positive(),
});

async function validateOwnedRef(
  db: D1Database,
  userId: string,
  table: 'accounts' | 'categories',
  id: string | null | undefined,
  label: string,
): Promise<string | null> {
  if (!id) return null;
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).first();
  return row ? null : `${label} does not belong to the authenticated user`;
}

async function validateDebtRefs(
  db: D1Database,
  userId: string,
  data: { account_id?: string | null; category_id?: string | null },
): Promise<string | null> {
  const accountError = await validateOwnedRef(db, userId, 'accounts', data.account_id, 'account_id');
  if (accountError) return accountError;
  const categoryError = await validateOwnedRef(db, userId, 'categories', data.category_id, 'category_id');
  if (categoryError) return categoryError;
  return null;
}

function balanceStatement(db: D1Database, userId: string, accountId: string, type: 'income' | 'expense', amount: number) {
  const delta = type === 'income' ? amount : -amount;
  return db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(delta, Date.now(), accountId, userId);
}

debts.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const { results } = await db
    .prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY status ASC, updated_at DESC')
    .bind(userId)
    .all();
  return c.json({ ok: true, data: results });
});

debts.get('/:id/repayments', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;
  const { results } = await db
    .prepare('SELECT * FROM debt_repayments WHERE user_id = ? AND debt_id = ? ORDER BY date ASC')
    .bind(userId, id)
    .all();
  return c.json({ ok: true, data: results });
});

debts.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  const parsed = createDebtSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);

  const data = parsed.data;
  const refError = await validateDebtRefs(db, userId, data);
  if (refError) return c.json({ ok: false, error: refError }, 400);

  const now = Date.now();
  await db.prepare(
    `INSERT INTO debts (id, user_id, person_name, direction, principal_amount, remaining_amount, currency, category_id, account_id, due_date, note, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    data.id, userId, data.person_name, data.direction, data.principal_amount,
    data.remaining_amount ?? data.principal_amount, data.currency, data.category_id ?? null,
    data.account_id ?? null, data.due_date ?? null, data.note ?? null, now, now,
  ).run();
  await clearTombstone(db, userId, 'debts', data.id);
  return c.json({ ok: true, data: { id: data.id } }, 201);
});

debts.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;
  const existing = await db.prepare('SELECT id FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Debt not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  const parsed = updateDebtSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);

  const data = parsed.data;
  const refError = await validateDebtRefs(db, userId, data);
  if (refError) return c.json({ ok: false, error: refError }, 400);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    sets.push(`${key} = ?`);
    values.push(value ?? null);
  }
  if (sets.length === 0) return c.json({ ok: true, data: { id } });
  sets.push('updated_at = ?');
  values.push(Date.now(), id, userId);
  await db.prepare(`UPDATE debts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true, data: { id } });
});

debts.post('/:id/repayments', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;
  const debt = await db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).first<{
    id: string; person_name: string; direction: 'i_owe' | 'owes_me'; remaining_amount: number; category_id: string | null;
  }>();
  if (!debt) return c.json({ ok: false, error: 'Debt not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  const parsed = repaymentSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);

  const data = parsed.data;
  const accountError = await validateOwnedRef(db, userId, 'accounts', data.account_id, 'account_id');
  if (accountError) return c.json({ ok: false, error: accountError }, 400);

  if (data.amount > debt.remaining_amount) return c.json({ ok: false, error: 'Repayment exceeds remaining amount' }, 400);
  if (!debt.category_id) return c.json({ ok: false, error: 'Debt repayment category is required' }, 400);

  const now = Date.now();
  const type = debt.direction === 'i_owe' ? 'expense' : 'income';
  const remaining = Math.max(0, debt.remaining_amount - data.amount);
  const status = remaining <= 0 ? 'settled' : 'active';

  await db.batch([
    db.prepare(
      `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, currency, description, date, is_recurring, debt_id, voice_input, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
    ).bind(data.transaction_id, userId, data.account_id, debt.category_id, type, data.amount, data.currency, `Debt repayment: ${debt.person_name}`, data.date, debt.id, now, now),
    balanceStatement(db, userId, data.account_id, type, data.amount),
    db.prepare(
      `INSERT INTO debt_repayments (id, user_id, debt_id, transaction_id, account_id, amount, currency, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(data.id, userId, debt.id, data.transaction_id, data.account_id, data.amount, data.currency, data.note ?? null, data.date, now, now),
    db.prepare('UPDATE debts SET remaining_amount = ?, status = ?, settled_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(remaining, status, status === 'settled' ? now : null, now, id, userId),
  ]);

  await clearTombstone(db, userId, 'transactions', data.transaction_id);
  await clearTombstone(db, userId, 'debt_repayments', data.id);
  return c.json({ ok: true, data: { id: data.id, transaction_id: data.transaction_id, remaining_amount: remaining, status } }, 201);
});

debts.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;
  const existing = await db.prepare('SELECT id FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Debt not found' }, 404);
  const deletedAt = Date.now();
  await db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).run();
  await recordTombstone(db, userId, 'debts', id, deletedAt);
  return c.json({ ok: true });
});

export { debts };
