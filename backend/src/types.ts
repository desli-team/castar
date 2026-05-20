/**
 * Castar Backend — Type definitions
 */

/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ESKIZ_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  GOOGLE_CLOUD_STT_KEY: string;
}

/** JWT payload shape */
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

/** Hono context variables (set by middleware) */
export interface Variables {
  userId: string;
}

/** Standard API response */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** OTP send response (matches client expectations) */
export interface SendCodeResponse {
  ok: boolean;
  expiresIn?: number;
  error?: string;
  retryAfter?: number;
}

/** OTP verify response (matches client expectations) */
export interface VerifyCodeResponse {
  ok: boolean;
  token?: string;
  email?: string;
  phone?: string;
  error?: string;
  attemptsLeft?: number;
}
