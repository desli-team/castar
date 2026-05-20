/**
 * Castar — App Configuration
 */

export const APP_CONFIG = {
  name: 'Castar',
  version: '1.0.0',
  defaultCurrency: 'UZS',
  defaultLanguage: 'uz',
  supportedLanguages: ['uz', 'ru', 'en'] as const,
  supportedCurrencies: ['UZS', 'USD', 'EUR', 'RUB'] as const,
  currencyUpdateIntervalMs: 60 * 60 * 1000, // 1 hour
  maxSyncRetries: 3,
} as const;

export type SupportedLanguage = (typeof APP_CONFIG.supportedLanguages)[number];
export type SupportedCurrency = (typeof APP_CONFIG.supportedCurrencies)[number];

/**
 * Telegram Auth configuration.
 *
 * Before deploying:
 * 1. Create a bot via @BotFather -> get BOT_TOKEN
 * 2. Deploy Cloudflare Worker (see /backend)
 * 3. Update workerUrl with your Worker domain
 * 4. Update botUsername with your bot's username
 */
export const TELEGRAM_CONFIG = {
  /** Backend API URL (no trailing slash). */
  workerUrl: 'https://apicastar.desli.uz',
  /** Telegram bot username (without @) */
  botUsername: 'castar_bot',
  /** Deep link scheme */
  scheme: 'castar',
} as const;

/** Email auth API endpoints (same Cloudflare Worker) */
export const EMAIL_AUTH_CONFIG = {
  /** Send verification code to email */
  sendCodeUrl: `${TELEGRAM_CONFIG.workerUrl}/auth/email/send-code`,
  /** Verify code and get JWT */
  verifyCodeUrl: `${TELEGRAM_CONFIG.workerUrl}/auth/email/verify-code`,
} as const;

/** Phone (SMS) auth API endpoints (same Cloudflare Worker) */
export const PHONE_AUTH_CONFIG = {
  /** Send SMS verification code to phone */
  sendCodeUrl: `${TELEGRAM_CONFIG.workerUrl}/auth/phone/send-code`,
  /** Verify SMS code and get JWT */
  verifyCodeUrl: `${TELEGRAM_CONFIG.workerUrl}/auth/phone/verify-code`,
} as const;
