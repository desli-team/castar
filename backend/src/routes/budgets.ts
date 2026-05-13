/**
 * Castar — Budget Routes
 *
 * GET    /budgets          — List active budgets (enriched with spent/remaining/%)
 * POST   /budgets          — Create
 * PUT    /budgets/:id      — Update limit/period
 * DELETE /budgets/:id      — Deactivate (soft delete: is_active = 0)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { clearTombstone, recordTombstone } from '../services/tombstones';
import type { Env, Variables } from '../types';

const budgets = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const createBudgetSchema = z.object({
  id: z.string().min(1),
  category_id: z.string().nullish(),
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default('UZS'),
  period: z.enum(['daily', 'weekly', 'fourteen_days', 'monthly', 'yearly']),
  start_date: z.number().int().positive(),
  warning_threshold: z.number().min(1).max(200).default(80),
  critical_threshold: z.number().min(1).max(250).default(100),
  is_hard_limit: z.boolean().default(false),
  rollover_enabled: z.boolean().default(false),
}).refine((data) => data.warning_threshold < data.critical_threshold, {
  message: 'warning_threshold must be below critical_threshold',
  path: ['warning_threshold'],
});

const updateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  period: z.enum(['daily', 'weekly', 'fourteen_days', 'monthly', 'yearly']).optional(),
  category_id: z.string().nullish(),
  start_date: z.number().int().positive().optional(),
  warning_threshold: z.number().min(1).max(200).optional(),
  critical_threshold: z.number().min(1).max(250).optional(),
  is_hard_limit: z.boolean().optional(),
  rollover_enabled: z.boolean().optional(),
}).refine((data) => {
  if (data.warning_threshold === undefined || data.critical_threshold === undefined) return true;
  return data.warning_threshold < data.critical_threshold;
}, {
  message: 'warning_threshold must be below critical_threshold',
  path: ['warning_threshold'],
});

// ── Helpers ──

/** Calculate current period start timestamp for a budget, never before its configured start date. */
function getPeriodStart(period: string, startDate: number): number {
  const now = new Date();
  let periodStart: number;
  switch (period) {
    case 'daily':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      break;
    case 'weekly': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      periodStart = new Date(now.getFullYear(), now.getMonth(), diff).getTime();
      break;
    }
    case 'fourteen_days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 13);
      start.setHours(0, 0, 0, 0);
      periodStart = start.getTime();
      break;
    }
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
    case 'yearly':
      periodStart = new Date(now.getFullYear(), 0, 1).getTime();
      break;
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
  }
  return Math.max(periodStart, startDate);
}

// ── Routes ──

/** GET /budgets — List active budgets enriched with spent data */
budgets.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const includeInactive = c.req.query('include_inactive') === '1';

  const sql = includeInactive
    ? 'SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM budgets WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC';

  const { results: rows } = await db.prepare(sql).bind(userId).all<{
    id: string; user_id: string; category_id: string | null; name: string;
    amount: number; currency: string; period: string; start_date: number;
    warning_threshold: number; critical_threshold: number; is_hard_limit: number; rollover_enabled: number;
    is_active: number; created_at: number; updated_at: number;
  }>();

  // Enrich each budget with spent amount from transactions in current period
  const enriched = await Promise.all(
    rows.map(async (budget) => {
      const periodStart = getPeriodStart(budget.period, budget.start_date);
      const now = Date.now();

      let spentSql = 'SELECT COALESCE(SUM(amount), 0) as spent FROM transactions WHERE user_id = ? AND type = ? AND currency = ? AND date >= ? AND date <= ?';
      const params: unknown[] = [userId, 'expense', budget.currency, periodStart, now];

      if (budget.category_id) {
        spentSql += ' AND category_id = ?';
        params.push(budget.category_id);
      }

      const row = await db.prepare(spentSql).bind(...params).first<{ spent: number }>();
      const spent = row?.spent ?? 0;
      const remaining = budget.amount - spent;
      const percentage = budget.amount > 0 ? Math.min(100, Math.round((spent / budget.amount) * 10000) / 100) : 0;
      const rawPercentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      const health = remaining < 0
        ? 'over'
        : rawPercentage >= budget.critical_threshold
          ? 'critical'
          : rawPercentage >= budget.warning_threshold
            ? 'warning'
            : 'safe';

      return { ...budget, spent, remaining, percentage, health, period_start: periodStart };
    }),
  );

  return c.json({ ok: true, data: enriched });
});

/** POST /budgets — Create a new budget */
budgets.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = createBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();

  await db
    .prepare(
      'INSERT INTO budgets (id, user_id, category_id, name, amount, currency, period, start_date, warning_threshold, critical_threshold, is_hard_limit, rollover_enabled, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
    )
    .bind(data.id, userId, data.category_id ?? null, data.name, data.amount, data.currency, data.period, data.start_date, data.warning_threshold, data.critical_threshold, data.is_hard_limit ? 1 : 0, data.rollover_enabled ? 1 : 0, now, now)
    .run();
  await clearTombstone(db, userId, 'budgets', data.id);

  return c.json({ ok: true, data: { id: data.id } }, 201);
});

/** PUT /budgets/:id — Update a budget */
budgets.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM budgets WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Budget not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = updateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.amount !== undefined) { sets.push('amount = ?'); values.push(data.amount); }
  if (data.currency !== undefined) { sets.push('currency = ?'); values.push(data.currency); }
  if (data.period !== undefined) { sets.push('period = ?'); values.push(data.period); }
  if (data.category_id !== undefined) { sets.push('category_id = ?'); values.push(data.category_id ?? null); }
  if (data.start_date !== undefined) { sets.push('start_date = ?'); values.push(data.start_date); }
  if (data.warning_threshold !== undefined) { sets.push('warning_threshold = ?'); values.push(data.warning_threshold); }
  if (data.critical_threshold !== undefined) { sets.push('critical_threshold = ?'); values.push(data.critical_threshold); }
  if (data.is_hard_limit !== undefined) { sets.push('is_hard_limit = ?'); values.push(data.is_hard_limit ? 1 : 0); }
  if (data.rollover_enabled !== undefined) { sets.push('rollover_enabled = ?'); values.push(data.rollover_enabled ? 1 : 0); }

  if (sets.length === 0) return c.json({ ok: true, data: { id } });

  sets.push('updated_at = ?');
  values.push(now, id, userId);

  await db.prepare(`UPDATE budgets SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true, data: { id } });
});

/** DELETE /budgets/:id — Soft delete (deactivate) */
budgets.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM budgets WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) return c.json({ ok: false, error: 'Budget not found' }, 404);

  const deletedAt = Date.now();
  await db.prepare('UPDATE budgets SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?').bind(deletedAt, id, userId).run();
  await recordTombstone(db, userId, 'budgets', id, deletedAt);
  return c.json({ ok: true });
});

export { budgets };
