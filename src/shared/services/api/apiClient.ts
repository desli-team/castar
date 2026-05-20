/**
 * Castar — API Client
 *
 * HTTP client for the Cloudflare Worker backend.
 * - Auto-attaches JWT from authStore
 * - Converts snake_case ↔ camelCase at the boundary
 * - Parses `{ ok, data, error }` envelope
 */

import { TELEGRAM_CONFIG } from '../../constants/config';
import { useAuthStore } from '../../../features/auth/store/authStore';

// ── Base URL ──

const BASE_URL = TELEGRAM_CONFIG.workerUrl;

// ── snake_case ↔ camelCase converters ──

/** Convert a single snake_case string to camelCase */
function snakeToCamelStr(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a single camelCase string to snake_case */
function camelToSnakeStr(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Deep-convert object keys from snake_case → camelCase */
export function snakeToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => snakeToCamel(item)) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamelStr(key)] = snakeToCamel(value);
    }
    return result as T;
  }
  return obj as T;
}

/** Deep-convert object keys from camelCase → snake_case */
export function camelToSnake<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => camelToSnake(item)) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelToSnakeStr(key)] = camelToSnake(value);
    }
    return result as T;
  }
  return obj as T;
}

// ── Error class ──

export class ApiError extends Error {
  status: number;
  serverError?: string;

  constructor(status: number, message: string, serverError?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.serverError = serverError;
  }
}

// ── Backend envelope type ──

interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  server_time?: number;
}

// ── Client ──

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Get token from Zustand store (works outside React components)
  const token = useAuthStore.getState().token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Make an API request and parse the `{ ok, data }` envelope.
 * - Sends body keys in snake_case
 * - Returns data with keys in camelCase
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  let url = `${BASE_URL}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const init: RequestInit = {
    method,
    headers: getAuthHeaders(),
  };

  if (body !== undefined && body !== null) {
    // Convert camelCase → snake_case for backend
    init.body = JSON.stringify(camelToSnake(body));
  }

  const response = await fetch(url, init);

  // Handle non-JSON responses (e.g., network errors)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.status, `Server error: ${response.status}`);
    }
    // For 204 No Content or similar
    return undefined as T;
  }

  const envelope: ApiEnvelope = await response.json();

  if (!response.ok || !envelope.ok) {
    throw new ApiError(
      response.status,
      envelope.error || `Request failed: ${response.status}`,
      envelope.error,
    );
  }

  // Convert snake_case → camelCase and return data
  return snakeToCamel<T>(envelope.data);
}

// ── Public API ──

export const apiClient = {
  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return request<T>('GET', path, undefined, params);
  },

  post<T>(path: string, data?: unknown): Promise<T> {
    return request<T>('POST', path, data);
  },

  put<T>(path: string, data?: unknown): Promise<T> {
    return request<T>('PUT', path, data);
  },

  patch<T>(path: string, data?: unknown): Promise<T> {
    return request<T>('PATCH', path, data);
  },

  delete<T = void>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
};
