/**
 * Castar — Recurring Transaction Routes
 *
 * GET    /recurrings              — List all recurring rules
 * POST   /recurrings              — Create
 * PUT    /recurrings/:id          — Update
 * PATCH  /recurrings/:id/pause    — Toggle pause/resume (is_active)
 * DELETE /recurrings/:id          — Hard delete
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import type { Env, Variables } from '../types';

const recurrings = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const createRecurringSchema = z.object({
  id: z.string().min(1),
  account_id: z.string().nullish(),
  category_id: z.string().nullish(),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default('UZS'),
  description: z.string().max(500).nullish(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  next_date: z.number().int().positive(),
});

const updateRecurringSchema = z.object({
  account_id: z.string().nullish(),
  category_id: z.string().nullish(),
  type: z.enum(['income', 'expense']).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().max(500).nullish(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  next_date: z.number().int().positive().optional(),
});

// ── Routes ──

/** GET /recurrings — List all recurring rules for user */
recurrings.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db
    .prepare('SELECT * FROM recurrings WHERE user_id = ? ORDER BY next_date ASC')
    .bind(userId)
    .all();

  return c.json({ ok: true, data: results });
});

/** POST /recurrings — Create a new recurring rule */
recurrings.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = createRecurringSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO recurrings (id, user_id, account_id, category_id, type, amount, currency, description, frequency, next_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      data.id, userId, data.account_id ?? null, data.category_id ?? null,
      data.type, data.amount, data.currency, data.description ?? null,
      data.frequency, data.next_date, now, now,
    )
    .run();
  await clearTombstone(db, userId, 'recurrings', data.id);

  return c.json({ ok: true, data: { id: data.id } }, 201);
});

/** PUT /recurrings/:id — Update a recurring rule */
recurrings.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM recurrings WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Recurring rule not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = updateRecurringSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.account_id !== undefined) { sets.push('account_id = ?'); values.push(data.account_id ?? null); }
  if (data.category_id !== undefined) { sets.push('category_id = ?'); values.push(data.category_id ?? null); }
  if (data.type !== undefined) { sets.push('type = ?'); values.push(data.type); }
  if (data.amount !== undefined) { sets.push('amount = ?'); values.push(data.amount); }
  if (data.currency !== undefined) { sets.push('currency = ?'); values.push(data.currency); }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description ?? null); }
  if (data.frequency !== undefined) { sets.push('frequency = ?'); values.push(data.frequency); }
  if (data.next_date !== undefined) { sets.push('next_date = ?'); values.push(data.next_date); }

  if (sets.length === 0) return c.json({ ok: true, data: { id } });

  sets.push('updated_at = ?');
  values.push(now, id, userId);

  await db.prepare(`UPDATE recurrings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true, data: { id } });
});

/** PATCH /recurrings/:id/pause — Toggle pause/resume */
recurrings.patch('/:id/pause', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db
    .prepare('SELECT id, is_active FROM recurrings WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string; is_active: number }>();

  if (!existing) return c.json({ ok: false, error: 'Recurring rule not found' }, 404);

  const newState = existing.is_active ? 0 : 1;
  await db
    .prepare('UPDATE recurrings SET is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(newState, Date.now(), id, userId)
    .run();

  return c.json({ ok: true, data: { id, is_active: newState } });
});

/** DELETE /recurrings/:id — Hard delete */
recurrings.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM recurrings WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Recurring rule not found' }, 404);

  const deletedAt = Date.now();
  await db.prepare('DELETE FROM recurrings WHERE id = ? AND user_id = ?').bind(id, userId).run();
  await recordTombstone(db, userId, 'recurrings', id, deletedAt);
  return c.json({ ok: true });
});

export { recurrings };
