import type { Insight, Reading, Share, Summary, User } from '@mp/shared';

/**
 * The same API the patient app uses.
 *
 * Authentication is the session cookie and nothing else. In development Vite
 * proxies /api to the API, and in production this app is served from the same
 * origin - so the cookie applies in both, and no token is ever put in
 * localStorage where a script could read it.
 */
export class ApiError extends Error {
  // Written out rather than as a constructor parameter property: the template
  // enables erasableSyntaxOnly, which forbids syntax TypeScript cannot simply strip.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: options.body ? { 'content-type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new ApiError(response.status, payload.message ?? 'Something went wrong.');
  return payload as T;
}

export interface Patient {
  id: string;
  name: string | null;
  email: string;
  readingCount: number;
  lastMeasuredAt: string | null;
  lastReading: { systolic: number; diastolic: number } | null;
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

const reportQuery = (patientId?: string, from?: string) => {
  const query = new URLSearchParams({ tz: timeZone });
  if (patientId) query.set('patientId', patientId);
  if (from) query.set('from', from);
  return query.toString();
};

export const api = {
  requestLogin: (email: string) => request<{ sent: true }>('/auth/request', { body: { email } }),
  verifyCode: (email: string, code: string) =>
    request<{ user: User }>('/auth/verify', { body: { email, code } }),
  verifyToken: (token: string) => request<{ user: User }>('/auth/verify', { body: { token } }),
  me: () => request<{ user: User; patientCount: number; pendingInvitations: number }>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listPatients: () => request<{ patients: Patient[] }>('/patients'),
  listShares: () => request<{ granted: Share[]; received: Share[] }>('/shares'),
  respondToShare: (id: string, accept: boolean) =>
    request<{ share: Share }>(`/shares/${id}/respond`, { body: { accept } }),

  readings: (patientId: string, from: string) =>
    request<{ readings: Reading[]; nextCursor: string | null }>(
      `/readings?patientId=${patientId}&from=${encodeURIComponent(from)}&limit=1000`,
    ),
  summary: (patientId: string, from?: string) =>
    request<{ summary: Summary }>(`/reports/summary?${reportQuery(patientId, from)}`),
  insights: (patientId: string) =>
    request<{ insights: Insight[] }>(`/reports/insights?${reportQuery(patientId)}`),
};
