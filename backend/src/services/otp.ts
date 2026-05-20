export function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  const maxUnbiased = Math.floor(0x100000000 / 9000) * 9000;

  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= maxUnbiased);

  const value = bytes[0] % 9000;
  return String(1000 + value).padStart(4, '0');
}
