/**
 * Castar — Cloud Speech Recognition (Google Cloud STT V2)
 *
 * Records audio via expo-av and sends it to Google Cloud Speech-to-Text
 * through the backend proxy (API key is NOT stored in client).
 *
 * Supported languages: uz-UZ, ru-RU, en-US
 */

import { Audio } from 'expo-av';

export type SupportedSttLanguage = 'uz-UZ' | 'ru-RU' | 'en-US';

export const SUPPORTED_STT_LANGUAGES: SupportedSttLanguage[] = ['uz-UZ', 'ru-RU', 'en-US'];

interface CloudRecognitionResult {
  text: string;
  confidence: number;
  language: SupportedSttLanguage;
  detectedLanguage?: SupportedSttLanguage;
}

interface RecordingState {
  recording: Audio.Recording | null;
  isRecording: boolean;
}

const state: RecordingState = {
  recording: null,
  isRecording: false,
};

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/**
 * Request microphone permissions.
 * Must be called before startRecording().
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

/**
 * Start recording audio from the microphone.
 */
export async function startRecording(): Promise<void> {
  if (state.isRecording) return;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
  state.recording = recording;
  state.isRecording = true;
}

/**
 * Stop recording and return the file URI.
 */
export async function stopRecording(): Promise<string | null> {
  if (!state.recording || !state.isRecording) return null;

  state.isRecording = false;
  await state.recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  const uri = state.recording.getURI();
  state.recording = null;
  return uri;
}

/**
 * Send recorded audio to Google Cloud STT via backend proxy.
 *
 * The backend endpoint proxies to Google Cloud STT V2 and handles
 * the API key securely. Expected backend route:
 *   POST /api/voice/recognize
 *   Body: multipart/form-data { audio: file, language: string }
 *   Response: { text: string, confidence: number }
 */
export async function recognizeAudio(
  audioUri: string,
  language: SupportedSttLanguage,
  backendUrl: string,
  languages: SupportedSttLanguage[] = SUPPORTED_STT_LANGUAGES,
): Promise<CloudRecognitionResult> {
  const formData = new FormData();

  formData.append('audio', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'recording.wav',
  } as unknown as Blob);

  formData.append('language', language);
  formData.append('languages', JSON.stringify(languages));

  const response = await fetch(`${backendUrl}/api/voice/recognize`, {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.ok) {
    throw new Error(`Cloud STT failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { text: string; confidence: number; language?: SupportedSttLanguage; detectedLanguage?: SupportedSttLanguage };

  return {
    text: data.text,
    confidence: data.confidence,
    language: data.language ?? language,
    detectedLanguage: data.detectedLanguage,
  };
}

/**
 * Convenience: record, stop, and recognize in one call.
 * Returns null if recording fails or no audio is captured.
 */
export async function recordAndRecognize(
  language: SupportedSttLanguage,
  backendUrl: string,
  durationMs: number = 5000,
): Promise<CloudRecognitionResult | null> {
  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) return null;

  await startRecording();

  await new Promise((resolve) => setTimeout(resolve, durationMs));

  const uri = await stopRecording();
  if (!uri) return null;

  return recognizeAudio(uri, language, backendUrl);
}

export function isRecording(): boolean {
  return state.isRecording;
}

export async function cancelRecording(): Promise<void> {
  if (!state.recording || !state.isRecording) return;
  state.isRecording = false;
  await state.recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  state.recording = null;
}
