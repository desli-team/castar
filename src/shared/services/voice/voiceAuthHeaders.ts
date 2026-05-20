export function buildVoiceRecognitionHeaders(token: string | null): Record<string, string> | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}
