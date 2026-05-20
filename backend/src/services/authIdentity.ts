export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizePhone(phone: string): string {
  const digits = getPhoneDigits(phone);
  return digits ? `+${digits}` : '';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isValidPhone(phone: string): boolean {
  const digits = getPhoneDigits(phone);
  return digits.length >= 7 && digits.length <= 15;
}

export function getTelegramUserId(telegramId: string | number): string {
  const value = String(telegramId).trim();
  return value.startsWith('tg_') ? value : `tg_${value}`;
}

export function getEmailUserId(email: string): string {
  return `email_${normalizeEmail(email).replace(/[^a-z0-9]/g, '_')}`;
}

export function getPhoneUserId(phone: string): string {
  return `phone_${getPhoneDigits(phone)}`;
}
