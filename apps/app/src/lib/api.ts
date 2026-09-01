import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  CreateReadingInput,
  CreateTagInput,
  Insight,
  Reading,
  ScanResult,
  Share,
  Summary,
  Tag,
  UpdateTagInput,
  User,
} from '@mp/shared';
import { loadToken } from './session';

/**
 * The API client.
 *
 * EXPO_PUBLIC_ variables are inlined at build time, which is what lets one codebase
 * point at localhost during development and Cloud Run once deployed.
 */
function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Deployed, the web build is served by the API itself, so same-origin requests
  // need no host at all.
  if (Platform.OS === 'web') return '';

  // In Expo Go the app runs on a phone, where "localhost" is the phone itself.
  // hostUri is the dev machine's address on the network - the same one the bundle
  // was just downloaded from - so the API is reachable at that host on port 8080
  // without anyone having to look up their own IP.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const lanHost = hostUri?.split(':')[0];
  if (lanHost) return `http://${lanHost}:8080`;

  // A native build with no configured URL: nothing sensible is left to guess.
  return 'http://localhost:8080';
}

const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const token = await loadToken();

  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE_URL}/api${path}`, {
    method: options.method ?? (options.body || options.formData ? 'POST' : 'GET'),
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    // Carries the httpOnly cookie on the web build; ignored on native.
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? 'unknown',
      payload.message ?? 'Something went wrong.',
    );
  }
  return payload as T;
}

export const api = {
  // auth
  requestLogin: (email: string, name?: string) =>
    request<{ sent: true }>('/auth/request', { body: { email, ...(name ? { name } : {}) } }),
  verifyCode: (email: string, code: string) =>
    request<{ user: User; sessionToken: string }>('/auth/verify', { body: { email, code } }),
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // tags
  listTags: () => request<{ tags: Tag[] }>('/tags'),
  createTag: (input: CreateTagInput) => request<{ tag: Tag }>('/tags', { body: input }),
  updateTag: (id: string, input: UpdateTagInput) =>
    request<{ tag: Tag }>(`/tags/${id}`, { method: 'PATCH', body: input }),
  deleteTag: (id: string) => request<{ archived: boolean }>(`/tags/${id}`, { method: 'DELETE' }),

  // readings
  listReadings: (params: { from?: string; to?: string; limit?: number; patientId?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    );
    return request<{ readings: Reading[]; nextCursor: string | null }>(`/readings?${query}`);
  },
  createReading: (input: CreateReadingInput) =>
    request<{ reading: Reading }>('/readings', { body: input }),
  deleteReading: (id: string) => request<void>(`/readings/${id}`, { method: 'DELETE' }),

  // the capture flow
  scan: (uri: string) => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      // On web the camera hands back a blob URL, which FormData cannot take directly.
      return fetch(uri)
        .then((r) => r.blob())
        .then((blob) => {
          form.append('photo', blob, 'reading.jpg');
          return request<ScanResult>('/scans', { formData: form });
        });
    }
    form.append('photo', {
      uri,
      name: 'reading.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    return request<ScanResult>('/scans', { formData: form });
  },

  // reports
  // patientId is how a doctor views someone else's history; patients omit it and
  // the API resolves the subject to the caller.
  summary: (tz: string, patientId?: string) =>
    request<{ summary: Summary }>(`/reports/summary?${reportQuery(tz, patientId)}`),
  series: (tz: string, patientId?: string) =>
    request<{
      points: {
        id: string;
        measuredAt: string;
        systolic: number;
        diastolic: number;
        pulse: number | null;
        category: string;
      }[];
      daily: { day: string; systolic: number; diastolic: number; count: number }[];
    }>(`/reports/series?${reportQuery(tz, patientId)}`),
  insights: (patientId?: string) =>
    request<{ insights: Insight[] }>(`/reports/insights?${reportQuery('UTC', patientId)}`),

  // sharing
  listShares: () => request<{ granted: Share[]; received: Share[] }>('/shares'),
  inviteDoctor: (doctorEmail: string, note?: string) =>
    request<{ share: Share }>('/shares', { body: { doctorEmail, ...(note ? { note } : {}) } }),
  revokeShare: (id: string) => request<void>(`/shares/${id}`, { method: 'DELETE' }),
  respondToShare: (id: string, accept: boolean) =>
    request<{ share: Share }>(`/shares/${id}/respond`, { body: { accept } }),
  listPatients: () =>
    request<{
      patients: {
        id: string;
        name: string | null;
        email: string;
        readingCount: number;
        lastMeasuredAt: string | null;
        lastReading: { systolic: number; diastolic: number } | null;
      }[];
    }>('/patients'),
};

function reportQuery(tz: string, patientId?: string): string {
  const query = new URLSearchParams({ tz });
  if (patientId) query.set('patientId', patientId);
  return query.toString();
}
