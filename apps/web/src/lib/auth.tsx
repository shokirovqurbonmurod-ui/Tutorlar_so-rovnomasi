'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStore } from './api';
import type { AuthUser } from './types';

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...perms: string[]) => boolean;
  is: (...roles: string[]) => boolean;
}

const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.get<AuthUser>('/api/auth/me');
      setUser(me);
      tokenStore.setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  React.useEffect(() => {
    const cached = tokenStore.getUser();
    if (cached) setUser(cached);
    if (tokenStore.get()) {
      void refresh().finally(() => setLoading(false));
    } else {
      // try silent refresh via cookie
      void (async () => {
        try {
          const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
          if (res.ok) {
            const data = (await res.json()) as { accessToken: string; user: AuthUser };
            tokenStore.set(data.accessToken);
            tokenStore.setUser(data.user);
            setUser(data.user);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [refresh]);

  const login = React.useCallback(async (identifier: string, password: string) => {
    const data = await api.post<{ accessToken: string; user: AuthUser }>('/api/auth/login', { identifier, password });
    tokenStore.set(data.accessToken);
    tokenStore.setUser(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    tokenStore.set(null);
    tokenStore.setUser(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const can = React.useCallback((...perms: string[]) => !!user && (perms.length === 0 || perms.some((p) => user.permissions.includes(p))), [user]);
  const is = React.useCallback((...roles: string[]) => !!user && roles.includes(user.role.key), [user]);

  const value = React.useMemo(() => ({ user, loading, login, logout, refresh, can, is }), [user, loading, login, logout, refresh, can, is]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
