/**
 * Castar — Auth Routes
 *
 * Endpoints (matches client expectations from config.ts):
 * GET  /auth/telegram          — Telegram Login Widget page
 * GET  /auth/telegram/callback — Validate HMAC-SHA256 hash, sign JWT, redirect to deep link
 * POST /auth/email/send-code   — Send 4-digit code via Resend.com
 * POST /auth/email/verify-code — Verify code, return JWT
 * POST /auth/phone/send-code   — Send 4-digit code via Eskiz.uz
 * POST /auth/phone/verify-code — Verify code, return JWT
 *
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { getTelegramWidgetHtml, validateTelegramAuth } from '../services/telegram';
import { signJwt, verifyJwt } from '../services/jwt';
import { sendEmailCode } from '../services/email';
import { sendSmsCode } from '../services/sms';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================
// D1-backed OTP storage (persistent across Worker redeploys)
// Table: otp_codes (id, identifier, code, type, attempts, expires_at, created_at)
// ============================================================

const OTP_EXPIRY_MS = 5 * 60 * 1000;    // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000;       // 1 min between sends
const OTP_MAX_ATTEMPTS = 3;

// ============================================================
// Per-IP Rate Limiting (D1-backed)
// Table: rate_limits (ip, endpoint, request_count, window_start)
// ============================================================

const IP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const IP_RATE_MAX_REQUESTS = 10;           // max 10 OTP sends per IP per window

/**
 * Get client IP from Cloudflare headers.
 */
function getClientIp(headers: Headers): string {
  return headers.get('CF-Connecting-IP')
    || headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

/**
 * Check and increment IP rate limit.
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
async function checkIpRateLimit(
  db: D1Database,
  ip: string,
  endpoint: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowCutoff = now - IP_RATE_WINDOW_MS;

  // Cleanup old entries — fire and forget
  db.prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(windowCutoff).run().catch(() => {});

  const row = await db.prepare(
    'SELECT request_count, window_start FROM rate_limits WHERE ip = ? AND endpoint = ?',
  ).bind(ip, endpoint).first<{ request_count: number; window_start: number }>();

  if (!row || row.window_start < windowCutoff) {
    // No entry or expired — start fresh window
    await db.prepare(
      'INSERT OR REPLACE INTO rate_limits (ip, endpoint, request_count, window_start) VALUES (?, ?, 1, ?)',
    ).bind(ip, endpoint, now).run();
    return { allowed: true };
  }

  if (row.request_count >= IP_RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((row.window_start + IP_RATE_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  // Increment
  await db.prepare(
    'UPDATE rate_limits SET request_count = request_count + 1 WHERE ip = ? AND endpoint = ?',
  ).bind(ip, endpoint).run();
  return { allowed: true };
}

/** Generate a random 4-digit code */
function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Row shape returned from D1 otp_codes table */
interface OtpRow {
  id: string;
  identifier: string;
  code: string;
  type: string;
  attempts: number;
  expires_at: number;
  created_at: number;
}

/** Get existing OTP for identifier + type */
async function getOtp(db: D1Database, identifier: string, type: string): Promise<OtpRow | null> {
  return db
    .prepare('SELECT * FROM otp_codes WHERE identifier = ? AND type = ?')
    .bind(identifier, type)
    .first<OtpRow>();
}

/** Upsert OTP: delete old entry (if any) + insert new */
async function upsertOtp(
  db: D1Database,
  identifier: string,
  type: string,
  code: string,
  expiresAt: number,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM otp_codes WHERE identifier = ? AND type = ?').bind(identifier, type),
    db
      .prepare(
        'INSERT INTO otp_codes (id, identifier, code, type, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .bind(id, identifier, code, type, expiresAt, now),
  ]);
}

/** Increment attempts counter */
async function incrementAttempts(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(id).run();
}

/** Delete OTP entry */
async function deleteOtp(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM otp_codes WHERE id = ?').bind(id).run();
}

/** Clean up expired OTPs (housekeeping, fire-and-forget) */
async function cleanupExpiredOtps(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM otp_codes WHERE expires_at < ?').bind(Date.now()).run();
}

// ============================================================
// D1 user upsert — create user row on first auth, update on re-auth
// ============================================================

/** Upsert user in D1 on successful authentication */
async function upsertUser(
  db: D1Database,
  userId: string,
  fields: { telegram_id?: string; email?: string; phone?: string; display_name?: string },
): Promise<void> {
  const now = Date.now();
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();

  if (existing) {
    // Update: set auth-specific fields + updated_at
    const sets: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];
    if (fields.telegram_id !== undefined) { sets.push('telegram_id = ?'); values.push(fields.telegram_id); }
    if (fields.email !== undefined) { sets.push('email = ?'); values.push(fields.email); }
    if (fields.phone !== undefined) { sets.push('phone = ?'); values.push(fields.phone); }
    if (fields.display_name !== undefined) { sets.push('display_name = ?'); values.push(fields.display_name); }
    values.push(userId);
    await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  } else {
    // Create new user row
    await db
      .prepare(
        'INSERT INTO users (id, telegram_id, email, phone, display_name, tier, role, premium_until, subscription_status, language, primary_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        userId,
        fields.telegram_id ?? null,
        fields.email ?? null,
        fields.phone ?? null,
        fields.display_name ?? null,
        'free',
        'user',
        null,
        'none',
        'en',
        'UZS',
        now,
        now,
      )
      .run();
  }
}

// Cache bot numeric ID (Worker-scoped, survives across requests until redeploy)
let cachedBotId = '';

// GET /auth/telegram — serve Telegram Login Widget
auth.get('/telegram', async (c) => {
  const bot = c.req.query('bot') || 'castar_bot';
  const isSwitch = c.req.query('switch') === '1';
  const callbackUrl = `${new URL(c.req.url).origin}/auth/telegram/callback`;

  // Fetch bot numeric ID once (needed for "switch account" OAuth redirect)
  if (!cachedBotId && c.env.TELEGRAM_BOT_TOKEN) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`);
      const data = (await resp.json()) as { ok: boolean; result?: { id: number } };
      if (data.ok && data.result) cachedBotId = String(data.result.id);
    } catch {
      // ignore — button will fallback to reload
    }
  }

  // Switch mode: open Telegram auth in a popup/new tab.
  // The popup shows the FULL Telegram auth page where the user can:
  // - Click "Log in as different user" to enter a new phone number
  // After auth, Telegram sends postMessage to our page → we redirect to callback.
  if (isSwitch) {
    const origin = new URL(c.req.url).origin;
    const encodedOrigin = encodeURIComponent(origin);
    return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#101010">
  <title>Castar — Switch Account</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #101010;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      padding: 24px;
    }
    .title { font-size: 22px; font-weight: 500; text-align: center; margin-bottom: 8px; }
    .subtitle {
      font-size: 15px;
      color: rgba(255,255,255,0.5);
      text-align: center;
      line-height: 22px;
      max-width: 300px;
      margin-bottom: 32px;
    }
    .btn {
      display: inline-block;
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 500;
      color: #fff;
      text-decoration: none;
      padding: 14px 40px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 43px;
      background: rgba(255,255,255,0.1);
      cursor: pointer;
      text-align: center;
      transition: opacity 0.2s;
      -webkit-tap-highlight-color: transparent;
      border: none;
    }
    .btn:active { opacity: 0.6; }
    .btn.primary {
      background: #54A9EB;
      color: #fff;
    }
    .status {
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      margin-top: 16px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="title">Switch Telegram Account</div>
  <div class="subtitle">A Telegram login window will open. Tap <b>"Log in as different user"</b> to switch to a new account.</div>
  <button class="btn primary" id="openBtn" onclick="openAuth()">Open Telegram Login</button>
  <div class="status" id="status">Waiting for authentication...</div>

  <script>
    var authUrl = 'https://oauth.telegram.org/auth?bot_id=${cachedBotId}&origin=${encodedOrigin}&embed=1&request_access=write';
    var callbackBase = '${origin}/auth/telegram/callback';
    var authWindow = null;

    // Listen for postMessage from Telegram auth popup
    window.addEventListener('message', function(event) {
      // Accept messages from Telegram
      if (event.origin !== 'https://oauth.telegram.org') return;

      try {
        var data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { return; }
        }

        // Telegram sends: { event: 'auth_result', result: { id, first_name, ... } }
        // or: just the result object, or: { auth_result: { ... } }
        var result = null;
        if (data && data.event === 'auth_result' && data.result) {
          result = data.result;
        } else if (data && data.auth_result) {
          result = data.auth_result;
        } else if (data && data.id && data.hash) {
          result = data;
        }

        if (result && result.id && result.hash) {
          // Build callback URL with auth data as query params
          var params = new URLSearchParams();
          var keys = Object.keys(result);
          for (var i = 0; i < keys.length; i++) {
            params.set(keys[i], String(result[keys[i]]));
          }

          // Close popup if it's still open
          if (authWindow && !authWindow.closed) {
            try { authWindow.close(); } catch(e) {}
          }

          // Redirect to our callback
          window.location.href = callbackBase + '?' + params.toString();
        }
      } catch(e) {
        console.log('postMessage error:', e);
      }
    });

    function openAuth() {
      var btn = document.getElementById('openBtn');
      var status = document.getElementById('status');
      btn.textContent = 'Opening...';
      btn.style.opacity = '0.6';
      status.style.display = 'block';

      // Open Telegram auth in a new window/tab
      authWindow = window.open(authUrl, '_blank');

      // If popup was blocked, fallback to same-window navigation
      if (!authWindow || authWindow.closed) {
        status.textContent = 'Popup blocked. Redirecting...';
        setTimeout(function() {
          window.location.href = authUrl;
        }, 500);
      } else {
        btn.textContent = 'Waiting...';
        // Poll to detect if window was closed without auth
        var poll = setInterval(function() {
          if (authWindow && authWindow.closed) {
            clearInterval(poll);
            btn.textContent = 'Open Telegram Login';
            btn.style.opacity = '1';
            status.style.display = 'none';
          }
        }, 500);
      }
    }
  </script>
</body>
</html>`);
  }

  const html = getTelegramWidgetHtml(bot, callbackUrl, cachedBotId);
  return c.html(html);
});

// GET /auth/telegram/switch — clear TG session via redirect chain:
// 1. Set cookie tg_switch=1 on our domain
// 2. 302 redirect to oauth.telegram.org/auth/logout (clears TG OAuth cookies on telegram.org domain)
// 3. After logout, Telegram redirects to our origin root "/"
// 4. Root handler sees tg_switch cookie → redirects to widget page
// 5. Widget loads with clean TG session → shows login button
auth.get('/telegram/switch', async (c) => {
  // Ensure we have the bot numeric ID
  if (!cachedBotId && c.env.TELEGRAM_BOT_TOKEN) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`);
      const data = (await resp.json()) as { ok: boolean; result?: { id: number } };
      if (data.ok && data.result) cachedBotId = String(data.result.id);
    } catch { /* ignore */ }
  }

  // Set a short-lived cookie so the root handler knows to redirect to widget page
  c.header('Set-Cookie', 'tg_switch=1; Path=/; Max-Age=60; SameSite=Lax');

  // Direct 302 to Telegram's logout endpoint.
  // Because the browser navigates TO telegram.org, the TG cookies are
  // on the same domain and WILL be cleared (unlike iframe which fails cross-origin).
  // Telegram requires 'origin' parameter — must match our Worker origin.
  const origin = encodeURIComponent(new URL(c.req.url).origin);
  return c.redirect(`https://oauth.telegram.org/auth/logout?bot_id=${cachedBotId}&origin=${origin}`);
});

// GET /auth/telegram/callback — handle Telegram widget callback
auth.get('/telegram/callback', async (c) => {
  // 1. Extract all query params from Telegram widget redirect
  const url = new URL(c.req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });


  // 2. Validate HMAC-SHA256 hash + auth_date freshness
  const isValid = await validateTelegramAuth(params, c.env.TELEGRAM_BOT_TOKEN);

  if (!isValid) {
    const paramKeys = Object.keys(params);
    console.log('[Telegram Callback] Validation FAILED. Keys:', paramKeys.join(','));
    return c.html(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Castar — Auth Error</title>
<style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#101010;font-family:sans-serif;color:#fff;text-align:center}.container{padding:24px}h1{color:#F55858}a{color:#4B8DF5}pre{text-align:left;background:#1a1a1a;padding:12px;border-radius:8px;margin:12px 0;font-size:11px;word-break:break-all;max-width:90vw;overflow-x:auto;color:#ccc}</style>
</head><body><div class="container">
<h1>Auth Failed</h1>
<p>Telegram auth validation failed.</p>
<pre>keys: ${paramKeys.join(', ') || '(none)'}\nhash: ${params['hash'] ? 'present' : 'missing'}\nauth_date: ${params['auth_date'] || 'missing'}\nid: ${params['id'] ? 'present' : 'missing'}</pre>
<p><a href="${new URL(c.req.url).origin}/auth/telegram?bot=castar_bot">Try again</a></p>
</div></body></html>`, 403);
  }

  console.log('[Telegram Callback] Validation OK');

  // 3. Build user object matching client TelegramUser shape
  const telegramUser = {
    id: params['id'] || '',
    first_name: params['first_name'] || '',
    last_name: params['last_name'] || '',
    username: params['username'] || '',
    photo_url: params['photo_url'] || '',
  };

  // 4. Use Telegram user ID as the userId for JWT
  const userId = `tg_${telegramUser.id}`;

  // 5. Sign JWT (30 days expiry)
  const token = await signJwt(userId, c.env.JWT_SECRET);

  // 5b. Upsert user row in D1 (create on first auth, update on re-auth)
  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || undefined;
  await upsertUser(c.env.DB, userId, {
    telegram_id: telegramUser.id,
    display_name: displayName,
  }).catch((err) => console.log('[Telegram Callback] upsertUser error:', err));

  // 6. Build deep link
  const userJson = encodeURIComponent(JSON.stringify(telegramUser));
  const deepLink = `castar://auth/callback?token=${token}&user=${userJson}`;

  console.log('[Telegram Callback] Redirecting to deep link');

  // 7. Return HTML page that attempts deep link with fallback
  //    (some browsers block custom scheme redirects via 302)
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#101010">
  <title>Castar — Authorized</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      background: #101010;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      position: relative;
    }
    .glow {
      position: absolute;
      top: -40%;
      left: -20%;
      width: 140%;
      height: 100%;
      background: radial-gradient(ellipse at 30% 20%, rgba(23,229,108,0.08) 0%, rgba(23,229,108,0) 60%);
      pointer-events: none;
    }
    .glow2 {
      position: absolute;
      top: -30%;
      right: -10%;
      width: 60%;
      height: 60%;
      background: radial-gradient(ellipse at center, rgba(23,229,108,0.06) 0%, rgba(23,229,108,0) 55%);
      pointer-events: none;
    }
    .logo {
      margin-top: 78px;
      z-index: 10;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      justify-content: center;
      z-index: 1;
      padding: 0 24px;
      width: 100%;
    }
    .check-icon {
      margin-bottom: 32px;
    }
    .title {
      font-size: 32px;
      font-weight: 500;
      color: #FFFFFF;
      text-align: center;
      line-height: 40px;
    }
    .subtitle {
      font-size: 16px;
      font-weight: 400;
      color: rgba(255,255,255,0.4);
      text-align: center;
      line-height: 22px;
      margin-top: 8px;
      max-width: 277px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: calc(100% - 48px);
      max-width: 345px;
      height: 51px;
      background: #FFFFFF;
      border-radius: 43px;
      text-decoration: none;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      font-weight: 400;
      line-height: 20px;
      color: #0A0A0A;
      margin-top: 32px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active {
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="glow2"></div>

  <div class="logo">
    <svg width="49" height="46" viewBox="0 0 49 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.98343 12.3283C9.38617 7.58872 17.3686 8.05095 23.4014 11.1007L26.0342 12.5929L23.0137 12.9122C17.9759 13.7619 12.904 16.6709 9.34573 20.4992C7.73404 22.2779 6.427 24.318 5.7637 26.5929C3.91853 32.235 6.23411 39.3068 11.711 42.4367C11.9636 42.5582 12.215 42.6705 12.4737 42.7736C12.7146 42.869 12.9604 42.956 13.209 43.0343V43.0792C12.953 43.0077 12.6994 42.9276 12.4492 42.84C12.185 42.7467 11.9254 42.6464 11.6651 42.5363C6.63598 40.019 3.29201 34.1617 3.75101 28.2579C2.85842 27.3331 2.06319 26.2967 1.42093 25.1554C-0.0703107 22.6104 -0.591641 19.1283 0.858429 16.2677C1.6097 14.7162 2.72509 13.4227 3.98343 12.3283ZM19.8086 11.6564C14.8857 9.95133 9.03349 10.1057 5.03421 13.5636C3.88096 14.5325 2.89663 15.6528 2.24417 16.9493C1.01094 19.2996 1.10202 22.1936 2.24026 24.7423C2.65692 25.6991 3.19715 26.6165 3.83304 27.463C3.89172 27.0328 3.97033 26.6028 4.07132 26.1749C4.63209 23.5131 6.03578 21.0835 7.82327 19.1154C11.1341 15.6147 15.1903 12.9953 19.8086 11.6564Z" fill="white"/>
      <path d="M15.3069 21.3875C14.8183 26.4871 16.26 32.1312 18.9642 36.6004C20.2524 38.6682 21.879 40.5149 23.9232 41.7762C28.8235 45.0399 36.2344 44.5748 40.6058 40.0613C40.7923 39.8405 40.9701 39.6156 41.139 39.3846C41.7102 38.5996 42.1929 37.7341 42.4671 36.7996H42.4691C42.201 37.7366 41.7404 38.6138 41.1976 39.4266C41.0372 39.6655 40.8687 39.8995 40.6917 40.1307C37.0274 44.3594 30.526 46.1244 24.9944 44.1512C23.8696 44.7876 22.659 45.2991 21.3851 45.6297C18.5348 46.4303 15.0116 45.9797 12.679 43.7898C11.4276 42.6628 10.5076 41.2695 9.80499 39.7977C6.68362 33.3116 9.15251 25.6928 13.6526 20.5584L15.7835 18.3514L15.3069 21.3875ZM13.2562 24.2186C10.3536 28.5938 9.01148 34.3172 11.2757 39.1111C11.8883 40.4532 12.6812 41.6805 13.721 42.6463C15.629 44.4858 18.4405 45.1847 21.1995 44.7312C22.2397 44.5716 23.2745 44.2765 24.263 43.867C23.8591 43.6955 23.4604 43.5047 23.0706 43.2908C20.6151 42.0257 18.6354 39.9791 17.2142 37.6922C14.7704 33.5765 13.3442 29.0021 13.2562 24.2186Z" fill="white"/>
      <path d="M45.0168 33.7147C39.6141 38.4543 31.6317 37.992 25.5989 34.9423L22.9661 33.4501L25.9866 33.1307C31.0244 32.281 36.0962 29.3721 39.6545 25.5438C41.2663 23.7651 42.5732 21.7249 43.2366 19.4501C45.0817 13.8079 42.7662 6.73613 37.2893 3.60632C37.0367 3.48482 36.7852 3.37252 36.5266 3.26941C36.2859 3.17403 36.0405 3.08694 35.7922 3.00867V2.96375C36.0479 3.03517 36.3011 3.11553 36.551 3.203C36.8153 3.29623 37.0748 3.39659 37.3352 3.50671C42.3644 6.02393 45.7083 11.8813 45.2493 17.785C46.1419 18.7099 46.9371 19.7463 47.5793 20.8876C49.0706 23.4326 49.5919 26.9147 48.1418 29.7753C47.3905 31.3268 46.2752 32.6203 45.0168 33.7147ZM29.1926 34.3866C34.1154 36.0915 39.9669 35.9371 43.9661 32.4794C45.1193 31.5105 46.1036 30.3902 46.7561 29.0936C47.9894 26.7434 47.8983 23.8494 46.76 21.3007C46.3433 20.3438 45.8031 19.4265 45.1672 18.58C45.1085 19.0102 45.0299 19.4402 44.929 19.868C44.3682 22.5299 42.9645 24.9594 41.177 26.9276C37.8662 30.4281 33.8107 33.0477 29.1926 34.3866Z" fill="white"/>
      <path d="M27.4159 0.369598C30.2663 -0.43102 33.7894 0.0194238 36.122 2.20944C37.3734 3.33655 38.2934 4.72975 38.996 6.20163C42.1172 12.6877 39.6484 20.3066 35.1483 25.4409L33.0175 27.6479L33.494 24.6118C33.9827 19.5123 32.5409 13.8681 29.8368 9.3989C28.5485 7.331 26.922 5.48442 24.8778 4.22311C19.9775 0.959157 12.5666 1.42437 8.19521 5.93796C8.00866 6.15875 7.83088 6.38368 7.662 6.61472C7.07998 7.4146 6.58849 8.29751 6.31728 9.25241C6.58293 8.29549 7.05041 7.40073 7.60341 6.57272C7.76374 6.33381 7.93227 6.09982 8.10927 5.86862C11.7737 1.63979 18.2748 -0.125343 23.8065 1.84811C24.9314 1.21162 26.1419 0.700218 27.4159 0.369598ZM35.08 3.353C33.172 1.51334 30.3606 0.814541 27.6015 1.26804C26.5611 1.42768 25.5265 1.72271 24.538 2.13229C24.942 2.3038 25.3405 2.49451 25.7304 2.70847C28.1859 3.97362 30.1656 6.02014 31.5868 8.3071C34.0305 12.4228 35.4568 16.9972 35.5448 21.7807C38.4474 17.4055 39.7894 11.682 37.5253 6.88815C36.9126 5.546 36.1198 4.31887 35.08 3.353Z" fill="white"/>
    </svg>
  </div>

  <div class="container">
    <!-- Green check circle -->
    <svg class="check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#17E56C"/>
      <path d="M15 24.5L21 30.5L33 18.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>

    <div class="title">Authorized!</div>
    <div class="subtitle">You have successfully logged in. Return to the app to continue.</div>
    <a class="btn" href="${deepLink}">Open application</a>
  </div>

  <script>window.location.href="${deepLink}";</script>
</body>
</html>`);
});

// POST /auth/email/send-code
auth.post('/email/send-code', async (c) => {
  // Per-IP rate limit
  const ip = getClientIp(c.req.raw.headers);
  const ipCheck = await checkIpRateLimit(c.env.DB, ip, 'email/send').catch(() => ({ allowed: true as const }));
  if (!ipCheck.allowed) {
    return c.json({ ok: false, error: 'Too many requests from this IP', retryAfter: ipCheck.retryAfter ?? 60 }, 429);
  }

  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return c.json({ ok: false, error: 'Email is required' }, 400);
  }

  const existing = await getOtp(c.env.DB, email, 'email');

  // Rate limit: 1 code per 60 seconds
  if (existing && Date.now() - existing.created_at < OTP_COOLDOWN_MS) {
    const retryAfter = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - existing.created_at)) / 1000);
    return c.json({ ok: false, error: 'Too many requests', retryAfter }, 429);
  }

  const code = generateCode();
  await upsertOtp(c.env.DB, email, 'email', code, Date.now() + OTP_EXPIRY_MS);

  const emailResult = await sendEmailCode(email, code, c.env.RESEND_API_KEY);
  if (!emailResult.ok) {
    console.log(`[Email OTP] Failed to send email: ${emailResult.error}`);
    // Don't fail — code is in D1, visible in wrangler tail
  }

  // Housekeeping: clean up expired OTPs (fire and forget)
  cleanupExpiredOtps(c.env.DB).catch(() => {});

  return c.json({ ok: true, expiresIn: 300 });
});

// POST /auth/email/verify-code
auth.post('/email/verify-code', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>();
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!email || !code) {
    return c.json({ ok: false, error: 'Email and code are required' }, 400);
  }

  const entry = await getOtp(c.env.DB, email, 'email');

  if (!entry) {
    return c.json({ ok: false, error: 'No code sent for this email' }, 400);
  }

  // Check expiry
  if (Date.now() > entry.expires_at) {
    await deleteOtp(c.env.DB, entry.id);
    return c.json({ ok: false, error: 'Code expired' }, 400);
  }

  // Check attempts
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(c.env.DB, entry.id);
    return c.json({ ok: false, error: 'Too many attempts', attemptsLeft: 0 }, 400);
  }

  await incrementAttempts(c.env.DB, entry.id);

  if (entry.code !== code) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - entry.attempts - 1;
    console.log(`[Email OTP] Wrong code, ${attemptsLeft} attempts left`);
    return c.json({ ok: false, error: 'Invalid code', attemptsLeft }, 400);
  }

  // Success — delete OTP, sign JWT, upsert user
  await deleteOtp(c.env.DB, entry.id);
  const userId = `email_${email.replace(/[^a-z0-9]/g, '_')}`;
  const token = await signJwt(userId, c.env.JWT_SECRET);

  // Upsert user row in D1
  await upsertUser(c.env.DB, userId, { email }).catch((err) =>
    console.log(`[Email OTP] upsertUser error:`, err),
  );

  console.log('[Email OTP] Verified OK');

  return c.json({ ok: true, token, email });
});

// POST /auth/phone/send-code
auth.post('/phone/send-code', async (c) => {
  // Per-IP rate limit
  const ip = getClientIp(c.req.raw.headers);
  const ipCheck = await checkIpRateLimit(c.env.DB, ip, 'phone/send').catch(() => ({ allowed: true as const }));
  if (!ipCheck.allowed) {
    return c.json({ ok: false, error: 'Too many requests from this IP', retryAfter: ipCheck.retryAfter ?? 60 }, 429);
  }

  const body = await c.req.json<{ phone?: string }>();
  const phone = body.phone?.trim();

  if (!phone) {
    return c.json({ ok: false, error: 'Phone number is required' }, 400);
  }

  const existing = await getOtp(c.env.DB, phone, 'phone');

  // Rate limit: 1 code per 60 seconds
  if (existing && Date.now() - existing.created_at < OTP_COOLDOWN_MS) {
    const retryAfter = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - existing.created_at)) / 1000);
    return c.json({ ok: false, error: 'Too many requests', retryAfter }, 429);
  }

  const code = generateCode();
  await upsertOtp(c.env.DB, phone, 'phone', code, Date.now() + OTP_EXPIRY_MS);

  const smsResult = await sendSmsCode(phone, code, c.env.ESKIZ_TOKEN);
  if (!smsResult.ok) {
    console.log(`[Phone OTP] Failed to send SMS: ${smsResult.error}`);
    // Don't fail — code is in D1, visible in wrangler tail
  }

  // Housekeeping: clean up expired OTPs (fire and forget)
  cleanupExpiredOtps(c.env.DB).catch(() => {});

  return c.json({ ok: true, expiresIn: 300 });
});

// POST /auth/phone/verify-code
auth.post('/phone/verify-code', async (c) => {
  const body = await c.req.json<{ phone?: string; code?: string }>();
  const phone = body.phone?.trim();
  const code = body.code?.trim();

  if (!phone || !code) {
    return c.json({ ok: false, error: 'Phone and code are required' }, 400);
  }

  const entry = await getOtp(c.env.DB, phone, 'phone');

  if (!entry) {
    return c.json({ ok: false, error: 'No code sent for this phone' }, 400);
  }

  // Check expiry
  if (Date.now() > entry.expires_at) {
    await deleteOtp(c.env.DB, entry.id);
    return c.json({ ok: false, error: 'Code expired' }, 400);
  }

  // Check attempts
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(c.env.DB, entry.id);
    return c.json({ ok: false, error: 'Too many attempts', attemptsLeft: 0 }, 400);
  }

  await incrementAttempts(c.env.DB, entry.id);

  if (entry.code !== code) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - entry.attempts - 1;
    console.log(`[Phone OTP] Wrong code, ${attemptsLeft} attempts left`);
    return c.json({ ok: false, error: 'Invalid code', attemptsLeft }, 400);
  }

  // Success — delete OTP, sign JWT, upsert user
  await deleteOtp(c.env.DB, entry.id);
  const userId = `phone_${phone.replace(/\D/g, '')}`;
  const token = await signJwt(userId, c.env.JWT_SECRET);

  // Upsert user row in D1
  await upsertUser(c.env.DB, userId, { phone }).catch((err) =>
    console.log(`[Phone OTP] upsertUser error:`, err),
  );

  console.log('[Phone OTP] Verified OK');

  return c.json({ ok: true, token, phone });
});

// ─── POST /auth/refresh — Refresh JWT token ────────────────────────────────
// Requires a valid (non-expired) Bearer token. Issues a fresh token with
// a new 30-day expiry window. This extends the session without re-authentication.

auth.post('/refresh', async (c) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ ok: false, error: 'Missing Authorization header' }, 401);
  }

  try {
    const payload = await verifyJwt(header.slice(7), c.env.JWT_SECRET);
    const newToken = await signJwt(payload.sub, c.env.JWT_SECRET);
    return c.json({ ok: true, token: newToken });
  } catch {
    return c.json({ ok: false, error: 'Invalid or expired token' }, 401);
  }
});

export { auth };
