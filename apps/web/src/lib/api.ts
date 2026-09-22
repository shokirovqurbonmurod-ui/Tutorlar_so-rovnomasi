'use client';
import type { AuthUser } from './types';

const TOKEN_KEY = 'ts_access_token';
const USER_KEY = 'ts_user';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string | null) => {
    if (typeof window === 'undefined') return;
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  },
  getUser: (): AuthUser | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },
  setUser: (u: AuthUser | null) => {
    if (typeof window === 'undefined') return;
    if (u) window.localStorage.setItem(USER_KEY, JSON.stringify(u));
    else window.localStorage.removeItem(USER_KEY);
  },
};

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string; user: AuthUser };
        tokenStore.set(data.accessToken);
        tokenStore.setUser(data.user);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query) {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, opts: { retry?: boolean; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';

  const res = await fetch(path, { method, headers, credentials: 'include', body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/api/auth/login')) {
    const fresh = await refreshAccessToken();
    if (fresh) return request<T>(method, path, body, { ...opts, retry: false });
    tokenStore.set(null);
    tokenStore.setUser(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  if (opts.raw) return res as unknown as T;

  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, payload.error?.code ?? 'ERROR', payload.error?.message ?? `So'rov bajarilmadi (${res.status})`, payload.error?.details);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** Download a file (blob) with auth header and trigger browser save. */
  download: async (path: string, filename?: string) => {
    const res = await request<Response>('GET', path, undefined, { raw: true });
    if (!res.ok) {
      let msg = `Yuklab bo'lmadi (${res.status})`;
      try {
        const j = await res.json();
        msg = j.error?.message ?? msg;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, 'DOWNLOAD_FAILED', msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition');
    const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    const name = filename ?? (m ? decodeURIComponent(m[1]) : 'export');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
