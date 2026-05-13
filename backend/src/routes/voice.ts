/**
 * Castar — Voice Recognition Route
 *
 * POST /api/voice/recognize
 *   Body: multipart/form-data { audio: WAV file, language: string }
 *   Response: { text: string, confidence: number }
 *
 * Proxies audio to Google Cloud Speech-to-Text V2 REST API.
 * The API key is stored as a Cloudflare secret, never exposed to the client.
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';

type SupportedSttLanguage = 'uz-UZ' | 'ru-RU' | 'en-US';

const SUPPORTED_LANGUAGES: SupportedSttLanguage[] = ['uz-UZ', 'ru-RU', 'en-US'];

/**
 * Google Cloud STT V2 recognizer endpoint.
 * Uses the global recognizer (_) for on-demand recognition.
 * Docs: https://cloud.google.com/speech-to-text/v2/docs/reference/rest/v2/projects.locations.recognizers/recognize
 */
const GOOGLE_STT_V2_URL =
  'https://speech.googleapis.com/v2/projects/-/locations/global/recognizers/_:recognize';

/** Max audio size: 10MB (Google limit for synchronous requests) */
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;

interface GoogleSttResponse {
  results?: Array<{
    languageCode?: string;
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  }>;
}

const voice = new Hono<{ Bindings: Env; Variables: Variables }>();

voice.post('/recognize', async (c) => {
  const apiKey = c.env.GOOGLE_CLOUD_STT_KEY;
  if (!apiKey) {
    return c.json({ ok: false, error: 'Voice recognition not configured' }, 503);
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ ok: false, error: 'Invalid form data' }, 400);
  }

  // Extract preferred language + multilingual recognition list.
  // Interface language is only a preference; recognition should work for RU/UZ/EN regardless of UI locale.
  const language = formData.get('language') as string | null;
  if (!language || !SUPPORTED_LANGUAGES.includes(language as SupportedSttLanguage)) {
    return c.json({
      ok: false,
      error: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
    }, 400);
  }

  const rawLanguages = formData.get('languages') as string | null;
  const requestedLanguages = parseLanguages(rawLanguages);
  const languageCodes = uniqueSupportedLanguages([
    language as SupportedSttLanguage,
    ...requestedLanguages,
  ]);

  // Extract audio file
  const audioFile = formData.get('audio') as unknown as { size: number; arrayBuffer(): Promise<ArrayBuffer> } | null;
  if (!audioFile || typeof audioFile === 'string') {
    return c.json({ ok: false, error: 'Missing audio file' }, 400);
  }

  if (audioFile.size > MAX_AUDIO_SIZE) {
    return c.json({ ok: false, error: 'Audio file too large (max 10MB)' }, 413);
  }

  // Read audio as ArrayBuffer → base64
  const audioBuffer = await audioFile.arrayBuffer();
  const audioBytes = new Uint8Array(audioBuffer);
  const audioBase64 = uint8ArrayToBase64(audioBytes);

  // Build Google Cloud STT V2 request
  const sttRequest = {
    config: {
      languageCodes,
      model: 'short',
      autoDecodingConfig: {},
    },
    content: audioBase64,
  };

  // Call Google Cloud STT V2
  try {
    const response = await fetch(`${GOOGLE_STT_V2_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sttRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[Voice] Google STT error:', response.status, errorBody);
      return c.json({
        ok: false,
        error: `Speech recognition failed (${response.status})`,
      }, 502);
    }

    const data = (await response.json()) as GoogleSttResponse;

    // Extract best result
    const firstResult = data.results?.[0]?.alternatives?.[0];
    const text = firstResult?.transcript?.trim() ?? '';
    const confidence = firstResult?.confidence ?? 0;

    const detectedLanguage = normalizeDetectedLanguage(data.results?.[0]?.languageCode);

    return c.json({
      ok: true,
      text,
      confidence,
      language: detectedLanguage ?? language,
      detectedLanguage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Voice] STT request failed:', message);
    return c.json({ ok: false, error: 'Speech recognition unavailable' }, 502);
  }
});

function parseLanguages(rawLanguages: string | null): SupportedSttLanguage[] {
  if (!rawLanguages) return SUPPORTED_LANGUAGES;

  try {
    const parsed = JSON.parse(rawLanguages) as unknown;
    if (!Array.isArray(parsed)) return SUPPORTED_LANGUAGES;
    return parsed.filter((item): item is SupportedSttLanguage =>
      typeof item === 'string' && SUPPORTED_LANGUAGES.includes(item as SupportedSttLanguage),
    );
  } catch {
    return SUPPORTED_LANGUAGES;
  }
}

function uniqueSupportedLanguages(languages: SupportedSttLanguage[]): SupportedSttLanguage[] {
  const unique = languages.filter((language, index) => languages.indexOf(language) === index);
  return unique.length > 0 ? unique : SUPPORTED_LANGUAGES;
}

function normalizeDetectedLanguage(languageCode?: string): SupportedSttLanguage | undefined {
  if (!languageCode) return undefined;
  return SUPPORTED_LANGUAGES.find((language) => languageCode.toLowerCase().startsWith(language.toLowerCase().slice(0, 2)));
}

/**
 * Convert Uint8Array to base64 string.
 * Uses built-in btoa available in Cloudflare Workers runtime.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export { voice };
