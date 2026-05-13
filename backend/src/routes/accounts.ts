/**
 * Castar — Account Routes
 *
 * GET    /accounts          — List user accounts
 * POST   /accounts          — Create
 * PUT    /accounts/:id      — Update
 * DELETE /accounts/:id      — Archive (soft delete)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import type { Env, Variables } from '../types';

const accounts = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const createAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  type: z.enum(['cash', 'card', 'bank', 'savings']).default('cash'),
  currency: z.string().min(3).max(3).default('UZS'),
  balance: z.number().default(0),
  icon: z.string().nullish(),
  color: z.string().nullish(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  type: z.enum(['cash', 'card', 'bank', 'savings']).optional(),
  currency: z.string().min(3).max(3).optional(),
  balance: z.number().optional(),
  icon: z.string().nullish(),
  color: z.string().nullish(),
  is_archived: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).optional(),
});

// ── Routes ──

/** GET /accounts — List all user accounts (excluding archived by default) */
accounts.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const includeArchived = c.req.query('include_archived') === '1';

  const sql = includeArchived
    ? 'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC'
    : 'SELECT * FROM accounts WHERE user_id = ? AND is_archived = 0 ORDER BY created_at ASC';

  const { results } = await db.prepare(sql).bind(userId).all();
  return c.json({ ok: true, data: results });
});

/** POST /accounts — Create a new account */
accounts.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();

  await db
    .prepare(
      'INSERT INTO accounts (id, user_id, name, type, currency, balance, icon, color, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
    )
    .bind(data.id, userId, data.name, data.type, data.currency, data.balance, data.icon ?? null, data.color ?? null, now, now)
    .run();
  await clearTombstone(db, userId, 'accounts', data.id);

  return c.json({ ok: true, data: { id: data.id } }, 201);
});

/** PUT /accounts/:id — Update an account */
accounts.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db
    .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) return c.json({ ok: false, error: 'Account not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();

  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.type !== undefined) { sets.push('type = ?'); values.push(data.type); }
  if (data.currency !== undefined) { sets.push('currency = ?'); values.push(data.currency); }
  if (data.balance !== undefined) { sets.push('balance = ?'); values.push(data.balance); }
  if (data.icon !== undefined) { sets.push('icon = ?'); values.push(data.icon ?? null); }
  if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color ?? null); }
  if (data.is_archived !== undefined) { sets.push('is_archived = ?'); values.push(data.is_archived); }

  if (sets.length === 0) return c.json({ ok: true, data: { id } });

  sets.push('updated_at = ?');
  values.push(now, id, userId);

  await db
    .prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  return c.json({ ok: true, data: { id } });
});

/** DELETE /accounts/:id — Archive an account (soft delete) */
accounts.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db
    .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) return c.json({ ok: false, error: 'Account not found' }, 404);

  const deletedAt = Date.now();
  await db
    .prepare('UPDATE accounts SET is_archived = 1, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(deletedAt, id, userId)
    .run();
  await recordTombstone(db, userId, 'accounts', id, deletedAt);

  return c.json({ ok: true });
});

export { accounts };
