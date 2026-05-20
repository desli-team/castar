type PersistedAuthUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const AUTH_ID_PREFIXES = ['tg_', 'email_', 'phone_'] as const;

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeAuthPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export function getTelegramAuthUserId(telegramId: string | number): string {
  const value = String(telegramId).trim();
  return value.startsWith('tg_') ? value : `tg_${value}`;
}

export function getEmailAuthUserId(email: string): string {
  return `email_${normalizeAuthEmail(email).replace(/[^a-z0-9]/g, '_')}`;
}

export function getPhoneAuthUserId(phone: string): string {
  return `phone_${phone.replace(/\D/g, '')}`;
}

export function isCanonicalAuthUserId(userId: string): boolean {
  return AUTH_ID_PREFIXES.some((prefix) => userId.startsWith(prefix));
}

function hasTelegramProfileFields(user: PersistedAuthUser): boolean {
  return Boolean(user.first_name || user.last_name || user.username || user.photo_url);
}

export function getCanonicalAuthUserId(user: PersistedAuthUser): string {
  if (isCanonicalAuthUserId(user.id)) return user.id;
  if (user.id.includes('@')) return getEmailAuthUserId(user.id);
  if (!hasTelegramProfileFields(user) && user.id.replace(/\D/g, '').length >= 7) {
    return getPhoneAuthUserId(user.id);
  }
  return getTelegramAuthUserId(user.id);
}

export function getLegacyAuthUserIds(user: PersistedAuthUser, canonicalUserId: string): string[] {
  const ids = new Set<string>();
  const rawId = user.id.trim();
  if (rawId && rawId !== canonicalUserId) ids.add(rawId);

  if (canonicalUserId.startsWith('tg_')) {
    const unprefixed = canonicalUserId.slice(3);
    if (unprefixed && unprefixed !== canonicalUserId) ids.add(unprefixed);
  }

  if (canonicalUserId.startsWith('email_') && user.id.includes('@')) {
    ids.add(normalizeAuthEmail(user.id));
  }

  if (canonicalUserId.startsWith('phone_')) {
    const normalized = normalizeAuthPhone(user.id);
    const digits = user.id.replace(/\D/g, '');
    if (normalized) ids.add(normalized);
    if (digits) ids.add(digits);
  }

  ids.delete(canonicalUserId);
  return [...ids];
}
