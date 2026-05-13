/**
 * Castar — User Settings Routes
 *
 * GET  /settings — Get current user settings, role, subscription status, and entitlements
 * PUT  /settings — Update settings (upsert: creates user row if missing)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { buildUserAccess } from '../services/entitlements';

const settings = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Validation ──

const updateSettingsSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  language: z.string().min(2).max(5).optional(),
  primary_currency: z.string().min(3).max(3).optional(),
});

// ── Routes ──

/** GET /settings — Get current user settings */
settings.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const user = await db
    .prepare('SELECT id, display_name, language, primary_currency, tier, role, premium_until, subscription_status, telegram_id, email, phone, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user) {
    // User row doesn't exist yet — return defaults
    return c.json({
      ok: true,
      data: {
        id: userId,
        display_name: null,
        language: 'en',
        primary_currency: 'UZS',
        tier: 'free',
        role: 'user',
        premium_until: null,
        subscription_status: 'none',
        entitlements: buildUserAccess(null).entitlements,
      },
    });
  }

  const access = buildUserAccess(user);
  return c.json({
    ok: true,
    data: {
      ...user,
      tier: access.tier,
      role: access.role,
      premium_until: access.premiumUntil,
      subscription_status: access.subscriptionStatus,
      entitlements: access.entitlements,
    },
  });
});

/** PUT /settings — Update user settings (upsert: create user row if missing) */
settings.put('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const now = Date.now();

  // Check if user row exists
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();

  if (!existing) {
    // Create user row with defaults + provided fields
    await db
      .prepare(
        'INSERT INTO users (id, display_name, language, primary_currency, tier, role, premium_until, subscription_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(userId, data.display_name ?? null, data.language ?? 'en', data.primary_currency ?? 'UZS', 'free', 'user', null, 'none', now, now)
      .run();

    return c.json({ ok: true, data: { id: userId } }, 201);
  }

  // Update existing user
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.display_name !== undefined) { sets.push('display_name = ?'); values.push(data.display_name); }
  if (data.language !== undefined) { sets.push('language = ?'); values.push(data.language); }
  if (data.primary_currency !== undefined) { sets.push('primary_currency = ?'); values.push(data.primary_currency); }

  if (sets.length === 0) return c.json({ ok: true, data: { id: userId } });

  sets.push('updated_at = ?');
  values.push(now, userId);

  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true, data: { id: userId } });
});

export { settings };
