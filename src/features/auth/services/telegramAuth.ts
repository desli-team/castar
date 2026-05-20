/**
 * Castar — Telegram Auth Service
 *
 * Handles:
 *  - Building the Worker auth URL for WebView
 *  - Parsing the deep link callback (castar://auth/callback?token=...&user=...)
 *  - Persisting / reading / clearing the JWT via expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';
import { TELEGRAM_CONFIG } from '../../../shared/constants/config';
import { getEmailAuthUserId, getPhoneAuthUserId } from './authIdentity';

// ===================== Types =====================

export interface TelegramUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  photo_url: string;
}

export interface AuthCallbackResult {
  token: string;
  user: TelegramUser;
}

// ===================== Constants =====================

const TOKEN_KEY = 'castar_auth_token';
const USER_KEY = 'castar_auth_user';
const DISPLAY_NAME_KEY = 'castar_display_name';
const PIN_KEY = 'castar_pin';
const PIN_SALT_KEY = 'castar_pin_salt';
const LOCKOUT_UNTIL_KEY = 'castar_lockout_until';
const FAILED_ATTEMPTS_KEY = 'castar_failed_attempts';

// ===================== Auth URL =====================

/**
 * Returns the full URL to open in the browser for Telegram login.
 * @param lang — current app language code (uz, ru, en, etc.)
 */
export function getTelegramAuthUrl(lang?: string): string {
  const base = `${TELEGRAM_CONFIG.workerUrl}/auth/telegram?bot=${TELEGRAM_CONFIG.botUsername}`;
  return lang ? `${base}&lang=${lang}` : base;
}

// ===================== Callback Parsing =====================

/**
 * Check if a URL is the auth callback deep link.
 */
export function isAuthCallback(url: string): boolean {
  return url.startsWith('castar://auth/callback');
}

/**
 * Parse the auth callback URL and extract token + user.
 * Returns null if parsing fails.
 */
export function parseAuthCallback(url: string): AuthCallbackResult | null {
  try {
    // URL constructor doesn't handle custom schemes well,
    // so we replace the scheme with https:// for parsing.
    const parsed = new URL(url.replace('castar://', 'https://placeholder/'));
    const token = parsed.searchParams.get('token');
    const userJson = parsed.searchParams.get('user');

    if (!token || !userJson) return null;

    const user: TelegramUser = JSON.parse(decodeURIComponent(userJson));

    if (!user.id) return null;

    return { token, user };
  } catch {
    return null;
  }
}

// ===================== Token Persistence =====================

/**
 * Save JWT token to secure storage.
 */
export async function persistToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * Read JWT token from secure storage.
 * Returns null if not found.
 */
export async function getPersistedToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

/**
 * Remove JWT token from secure storage.
 */
export async function clearPersistedToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ===================== User Persistence =====================

/**
 * Save Telegram user data to secure storage.
 */
export async function persistUser(user: TelegramUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

/**
 * Read Telegram user data from secure storage.
 * Returns null if not found.
 */
export async function getPersistedUser(): Promise<TelegramUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramUser;
  } catch {
    return null;
  }
}

/**
 * Remove Telegram user data from secure storage.
 */
export async function clearPersistedUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

// ===================== Display Name Persistence =====================

/**
 * Save display name to secure storage.
 * This persists across logout so returning users skip SetName.
 */
export async function persistDisplayName(name: string): Promise<void> {
  await SecureStore.setItemAsync(DISPLAY_NAME_KEY, name);
}

/**
 * Read display name from secure storage.
 * Returns null if not set (first-time user).
 */
export async function getPersistedDisplayName(): Promise<string | null> {
  return SecureStore.getItemAsync(DISPLAY_NAME_KEY);
}

/**
 * Remove display name from secure storage.
 */
export async function clearPersistedDisplayName(): Promise<void> {
  await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
}

// ===================== Pure JS SHA-256 (no native modules) =====================
// Needed because crypto.subtle / expo-crypto may not be available in all
// dev builds. This is a faithful FIPS 180-4 implementation operating on
// ASCII-only inputs (hex salt + numeric PIN).

/** SHA-256 round constants (first 32 bits of fractional parts of cube roots of first 64 primes). */
const K256: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Pure JS SHA-256 (FIPS 180-4).
 * Input: ASCII string (salt hex chars + PIN digits — all single-byte).
 * Output: lowercase 64-char hex digest.
 */
function sha256(input: string): string {
  // 1. Convert ASCII string to byte array
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    bytes.push(input.charCodeAt(i) & 0xff);
  }

  // 2. Padding: append 1-bit, then zeros, then 64-bit big-endian length
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // High 32 bits of length (always 0 for inputs < 512 MB)
  bytes.push(0, 0, 0, 0);
  // Low 32 bits of length
  bytes.push(
    (bitLen >>> 24) & 0xff,
    (bitLen >>> 16) & 0xff,
    (bitLen >>> 8) & 0xff,
    bitLen & 0xff,
  );

  // 3. Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Helper: unsigned 32-bit right rotate
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  // 4. Process each 512-bit (64-byte) block
  for (let off = 0; off < bytes.length; off += 64) {
    const w: number[] = new Array(64);

    // First 16 words from block (big-endian)
    for (let i = 0; i < 16; i++) {
      w[i] = ((bytes[off + i * 4] << 24) |
              (bytes[off + i * 4 + 1] << 16) |
              (bytes[off + i * 4 + 2] << 8) |
              bytes[off + i * 4 + 3]) >>> 0;
    }

    // Extend to 64 words
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + (s0 >>> 0) + w[i - 7] + (s1 >>> 0)) >>> 0;
    }

    // Compression
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + (S1 >>> 0) + (ch >>> 0) + K256[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = ((S0 >>> 0) + (maj >>> 0)) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => v.toString(16).padStart(8, '0'))
    .join('');
}

// ===================== PIN Persistence (SHA-256 + salt) =====================

/**
 * Generate a random 16-byte hex salt.
 * Uses crypto.getRandomValues (available since RN 0.73 in Hermes).
 * Falls back to Math.random if unavailable (should never happen on RN 0.81).
 */
function generateSalt(): string {
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback: Math.random (less secure but functional)
    let salt = '';
    for (let i = 0; i < 32; i++) {
      salt += Math.floor(Math.random() * 16).toString(16);
    }
    return salt;
  }
}

/**
 * Hash a PIN with a salt using SHA-256.
 * Pure JS implementation — no native modules required.
 * Returns lowercase 64-char hex digest.
 */
function hashPin(pin: string, salt: string): string {
  return sha256(salt + pin);
}

/**
 * Save PIN code to secure storage (hashed with SHA-256 + random salt).
 * Stores the hash in PIN_KEY and the salt in PIN_SALT_KEY.
 */
export async function persistPin(pin: string): Promise<void> {
  const salt = generateSalt();
  const hash = hashPin(pin, salt);
  await Promise.all([
    SecureStore.setItemAsync(PIN_KEY, hash),
    SecureStore.setItemAsync(PIN_SALT_KEY, salt),
  ]);
}

/**
 * Verify a PIN against the stored hash.
 * Returns true if the PIN matches.
 */
export async function verifyPersistedPin(pin: string): Promise<boolean> {
  const [storedHash, salt] = await Promise.all([
    SecureStore.getItemAsync(PIN_KEY),
    SecureStore.getItemAsync(PIN_SALT_KEY),
  ]);
  if (!storedHash || !salt) return false;
  const hash = hashPin(pin, salt);
  return hash === storedHash;
}

/**
 * Check if a PIN has been set (without revealing the value).
 * Returns true if PIN hash exists in secure storage.
 */
export async function hasPersistedPin(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored != null;
}

/**
 * @deprecated Use verifyPersistedPin() instead.
 * Kept for backward compatibility during migration.
 * Returns a non-null sentinel if PIN exists (never the actual PIN).
 */
export async function getPersistedPin(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored != null ? '****' : null;
}

/**
 * Remove PIN code and salt from secure storage.
 */
export async function clearPersistedPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_KEY),
    SecureStore.deleteItemAsync(PIN_SALT_KEY),
  ]);
}

// ===================== PIN Lockout Persistence =====================

/**
 * Save lockout timestamp (epoch ms) to secure storage.
 * When set, PIN entry is blocked until Date.now() > this value.
 */
export async function persistLockoutUntil(timestamp: number): Promise<void> {
  await SecureStore.setItemAsync(LOCKOUT_UNTIL_KEY, String(timestamp));
}

/**
 * Read lockout timestamp from secure storage.
 * Returns 0 if not set (no active lockout).
 */
export async function getLockoutUntil(): Promise<number> {
  const raw = await SecureStore.getItemAsync(LOCKOUT_UNTIL_KEY);
  return raw ? Number(raw) : 0;
}

/**
 * Save failed PIN attempt count to secure storage.
 */
export async function persistFailedAttempts(count: number): Promise<void> {
  await SecureStore.setItemAsync(FAILED_ATTEMPTS_KEY, String(count));
}

/**
 * Read failed PIN attempt count from secure storage.
 * Returns 0 if not set.
 */
export async function getFailedAttempts(): Promise<number> {
  const raw = await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY);
  return raw ? Number(raw) : 0;
}

/**
 * Clear lockout data (both timestamp and attempt count).
 * Called after successful PIN entry or when lockout expires.
 */
export async function clearLockoutData(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(LOCKOUT_UNTIL_KEY),
    SecureStore.deleteItemAsync(FAILED_ATTEMPTS_KEY),
  ]);
}

// ===================== Combined Operations =====================

/**
 * Save both token and user data after successful auth.
 */
export async function persistAuth(
  token: string,
  user: TelegramUser,
): Promise<void> {
  await Promise.all([persistToken(token), persistUser(user)]);
}

/**
 * Clear session data (token + user) but keep display name.
 * Display name is preserved so returning users are recognized.
 */
export async function clearAuth(): Promise<void> {
  await Promise.all([clearPersistedToken(), clearPersistedUser()]);
}

/**
 * Clear ALL data including display name (full account reset).
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    clearPersistedToken(),
    clearPersistedUser(),
    clearPersistedDisplayName(),
    clearPersistedPin(),
    clearLinkedAccounts(),
  ]);
}

/**
 * Save email auth data (token + email as user).
 * Creates a minimal TelegramUser-compatible shape so the rest of the
 * persistence layer works identically for email and Telegram users.
 */
export async function persistEmailAuth(
  token: string,
  email: string,
): Promise<void> {
  const syntheticUser: TelegramUser = {
    id: getEmailAuthUserId(email),
    first_name: '',
    last_name: '',
    username: '',
    photo_url: '',
  };
  await persistAuth(token, syntheticUser);
}

/**
 * Save phone auth data (token + phone as user).
 * Creates a minimal TelegramUser-compatible shape so the rest of the
 * persistence layer works identically for phone, email, and Telegram users.
 */
export async function persistPhoneAuth(
  token: string,
  phone: string,
): Promise<void> {
  const syntheticUser: TelegramUser = {
    id: getPhoneAuthUserId(phone),
    first_name: '',
    last_name: '',
    username: '',
    photo_url: '',
  };
  await persistAuth(token, syntheticUser);
}

/**
 * Load persisted auth state. Returns null if no valid session exists.
 */
export async function loadPersistedAuth(): Promise<AuthCallbackResult | null> {
  const [token, user] = await Promise.all([
    getPersistedToken(),
    getPersistedUser(),
  ]);

  if (!token || !user) return null;

  return { token, user };
}

// ===================== Linked Accounts Persistence =====================
// These keys store ADDITIONAL auth methods linked from Settings.
// They are separate from the primary auth session so linking a new method
// never overwrites the existing session.

const LINKED_TG_KEY = 'castar_linked_telegram';
const LINKED_PHONE_KEY = 'castar_linked_phone';
const LINKED_EMAIL_KEY = 'castar_linked_email';

/** Save linked Telegram user data. */
export async function persistLinkedTelegram(user: TelegramUser): Promise<void> {
  await SecureStore.setItemAsync(LINKED_TG_KEY, JSON.stringify(user));
}

/** Read linked Telegram user data. Returns null if not linked. */
export async function getLinkedTelegram(): Promise<TelegramUser | null> {
  const raw = await SecureStore.getItemAsync(LINKED_TG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as TelegramUser; } catch { return null; }
}

/** Save linked phone number. */
export async function persistLinkedPhone(phone: string): Promise<void> {
  await SecureStore.setItemAsync(LINKED_PHONE_KEY, phone);
}

/** Read linked phone number. Returns null if not linked. */
export async function getLinkedPhone(): Promise<string | null> {
  return SecureStore.getItemAsync(LINKED_PHONE_KEY);
}

/** Save linked email address. */
export async function persistLinkedEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(LINKED_EMAIL_KEY, email);
}

/** Read linked email address. Returns null if not linked. */
export async function getLinkedEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(LINKED_EMAIL_KEY);
}

/** Clear all linked account data (called on full account reset). */
export async function clearLinkedAccounts(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(LINKED_TG_KEY),
    SecureStore.deleteItemAsync(LINKED_PHONE_KEY),
    SecureStore.deleteItemAsync(LINKED_EMAIL_KEY),
  ]);
}
