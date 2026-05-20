/**
 * Castar — JWT Auth Middleware
 * Verifies Bearer token and sets userId in context.
 */

import { createMiddleware } from 'hono/factory';
import { verifyJwt } from '../services/jwt';
import type { Env, Variables } from '../types';

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ ok: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = header.slice(7);
  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub);
    await next();
  } catch {
    return c.json({ ok: false, error: 'Invalid or expired token' }, 401);
  }
});
