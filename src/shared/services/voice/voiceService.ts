/**
 * Castar — Unified Voice Recognition Service
 *
 * Automatically selects between cloud (Google Cloud STT) and
 * offline (VOSK) recognition based on network availability.
 *
 * Flow:
 *   1. Check network → online? use cloud : use offline
 *   2. Record audio / stream microphone
 *   3. Get transcribed text
 *   4. Pass text to voiceParser.ts → VoiceParseResult
 */

import NetInfo from '@react-native-community/netinfo';
import { SUPPORTED_STT_LANGUAGES, type SupportedSttLanguage } from './cloudRecognition';
import type { VoiceParseResult } from '../../types';
import { parseVoiceInput } from './voiceParser';

export type VoiceMode = 'cloud' | 'offline' | 'auto';

export interface VoiceRecognitionOptions {
  language: SupportedSttLanguage;
  languages?: SupportedSttLanguage[];
  mode?: VoiceMode;
  backendUrl?: string;
  maxDurationMs?: number;
}

export interface VoiceRecognitionResult {
  text: string;
  confidence: number;
  language: SupportedSttLanguage;
  detectedLanguage?: SupportedSttLanguage;
  mode: 'cloud' | 'offline';
  parsed: VoiceParseResult;
}

type VoiceStateCallback = (state: VoiceServiceState) => void;

export interface VoiceServiceState {
  isRecording: boolean;
  isProcessing: boolean;
  mode: 'cloud' | 'offline' | null;
  error: string | null;
}

const DEFAULT_BACKEND_URL = 'https://castar-auth.ivcswebofficial.workers.dev';
const DEFAULT_MAX_DURATION_MS = 7000;

let stateCallback: VoiceStateCallback | null = null;
let currentState: VoiceServiceState = {
  isRecording: false,
  isProcessing: false,
  mode: null,
  error: null,
};

function updateState(partial: Partial<VoiceServiceState>): void {
  currentState = { ...currentState, ...partial };
  stateCallback?.(currentState);
}

/**
 * Register a callback to receive state updates.
 */
export function onStateChange(callback: VoiceStateCallback): () => void {
  stateCallback = callback;
  return () => {
    stateCallback = null;
  };
}

/**
 * Get the current service state.
 */
export function getState(): VoiceServiceState {
  return { ...currentState };
}

/**
 * Check if the device is online.
 */
async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

/**
 * Determine which recognition mode to use.
 */
async function resolveMode(mode: VoiceMode): Promise<'cloud' | 'offline'> {
  if (mode === 'cloud') return 'cloud';
  if (mode === 'offline') return 'offline';
  // auto: prefer cloud if online
  return (await isOnline()) ? 'cloud' : 'offline';
}

/**
 * Map app language codes to a preferred STT language code.
 * Voice recognition itself is multilingual and must not be limited by UI language.
 */
export function appLanguageToStt(lang: string): SupportedSttLanguage {
  switch (lang) {
    case 'uz':
      return 'uz-UZ';
    case 'ru':
      return 'ru-RU';
    case 'en':
      return 'en-US';
    default:
      return 'uz-UZ';
  }
}

export function getMultilingualSttLanguages(preferred: SupportedSttLanguage): SupportedSttLanguage[] {
  return [preferred, ...SUPPORTED_STT_LANGUAGES.filter((language) => language !== preferred)];
}

/**
 * Start voice recognition with automatic mode selection.
 *
 * Cloud mode: records audio → sends to backend → gets text
 * Offline mode: starts VOSK streaming → gets text in real-time
 */
export async function recognize(
  options: VoiceRecognitionOptions,
): Promise<VoiceRecognitionResult | null> {
  const {
    language,
    languages = getMultilingualSttLanguages(language),
    mode: requestedMode = 'auto',
    backendUrl = DEFAULT_BACKEND_URL,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
  } = options;

  updateState({ error: null });

  const resolvedMode = await resolveMode(requestedMode);
  updateState({ mode: resolvedMode });

  try {
    if (resolvedMode === 'cloud') {
      return await recognizeCloud(language, backendUrl, maxDurationMs, languages);
    } else {
      return await recognizeOffline(language, maxDurationMs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateState({ error: message, isRecording: false, isProcessing: false });

    // Fallback: if cloud fails, try offline
    if (resolvedMode === 'cloud' && requestedMode === 'auto') {
      try {
        updateState({ mode: 'offline', error: null });
        return await recognizeOffline(language, maxDurationMs);
      } catch (fallbackError) {
        const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        updateState({ error: fallbackMsg, isRecording: false, isProcessing: false });
        return null;
      }
    }

    return null;
  }
}

/**
 * Cloud recognition: record → send to backend → get result.
 */
async function recognizeCloud(
  language: SupportedSttLanguage,
  backendUrl: string,
  maxDurationMs: number,
  languages: SupportedSttLanguage[],
): Promise<VoiceRecognitionResult | null> {
  const cloud = await import('./cloudRecognition');

  const hasPermission = await cloud.requestMicrophonePermission();
  if (!hasPermission) {
    updateState({ error: 'Microphone permission denied' });
    return null;
  }

  updateState({ isRecording: true });
  await cloud.startRecording();

  await new Promise((resolve) => setTimeout(resolve, maxDurationMs));

  const uri = await cloud.stopRecording();
  updateState({ isRecording: false });

  if (!uri) {
    updateState({ error: 'No audio recorded' });
    return null;
  }

  updateState({ isProcessing: true });
  const result = await cloud.recognizeAudio(uri, language, backendUrl, languages);
  updateState({ isProcessing: false });

  if (!result.text) return null;

  return {
    text: result.text,
    confidence: result.confidence,
    language: result.language,
    detectedLanguage: result.detectedLanguage,
    mode: 'cloud',
    parsed: parseVoiceInput(result.text),
  };
}

/**
 * Offline recognition: VOSK streaming → collect final result.
 */
async function recognizeOffline(
  language: SupportedSttLanguage,
  maxDurationMs: number,
): Promise<VoiceRecognitionResult | null> {
  const offline = await import('./offlineRecognition');

  return new Promise((resolve) => {
    let lastResult = '';
    let lastConfidence = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    updateState({ isRecording: true });

    const finish = () => {
      clearTimeout(timeoutId);
      offline.stopRecognition();
      updateState({ isRecording: false, isProcessing: false });

      if (!lastResult) {
        resolve(null);
        return;
      }

      resolve({
        text: lastResult,
        confidence: lastConfidence,
        language,
        mode: 'offline',
        parsed: parseVoiceInput(lastResult),
      });
    };

    offline.startRecognition(
      language,
      (result) => {
        lastResult = result.text;
        lastConfidence = result.confidence;
      },
      (error) => {
        updateState({ error: error.message });
        finish();
      },
    );

    timeoutId = setTimeout(finish, maxDurationMs);
  });
}

/**
 * Cancel any ongoing recognition.
 */
export async function cancel(): Promise<void> {
  try {
    const cloud = await import('./cloudRecognition');
    await cloud.cancelRecording();
  } catch {
    // ignore
  }

  try {
    const offline = await import('./offlineRecognition');
    offline.stopRecognition();
  } catch {
    // ignore
  }

  updateState({ isRecording: false, isProcessing: false, mode: null });
}
