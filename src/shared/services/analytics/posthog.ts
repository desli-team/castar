/**
 * Castar — PostHog Analytics Service
 *
 * EU-hosted instance for GDPR compliance.
 * Keep financial analytics payloads intentionally coarse:
 * never send raw descriptions, names, audio, or exact amounts.
 */

import { usePostHog, type PostHog } from 'posthog-react-native';

export const POSTHOG_API_KEY = 'phc_JY…mT7A';
export const POSTHOG_HOST = 'https://eu.i.posthog.com';

export function isPostHogConfigured(): boolean {
  return /^phc_[A-Za-z0-9_/-]{20,}$/.test(POSTHOG_API_KEY);
}

export type SafeAnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_PROPERTY_KEYS = [
  'amount',
  'audio',
  'description',
  'exact_amount',
  'name',
  'note',
  'person',
  'raw',
  'text',
  'transcript',
];

function isSensitiveProperty(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_PROPERTY_KEYS.some((sensitiveKey) => normalized.includes(sensitiveKey));
}

function sanitizeProperties(properties: SafeAnalyticsProperties): SafeAnalyticsProperties {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, isSensitiveProperty(key) ? 'redacted' : value]),
  );
}

export function captureSafeEvent(
  posthog: PostHog | undefined | null,
  event: string,
  properties: SafeAnalyticsProperties = {},
): void {
  if (!posthog) return;

  posthog.capture(event, {
    ...sanitizeProperties(properties),
    privacy: 'financial_payload_masked',
  });
}

export function useSafePostHog(): PostHog | null {
  if (!isPostHogConfigured()) return null;
  return usePostHog();
}
