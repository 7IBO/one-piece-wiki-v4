/**
 * Client-side auth helpers. The session cookie is HTTP-only so the
 * browser holds it transparently; we just call /api/auth/me to learn
 * the current user.
 */
import { useEffect, useState } from 'react';

export type CurrentUser = { readonly login: string; };

export const auth = {
  async me(): Promise<CurrentUser | null> {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`auth/me ${res.status}`);
    return (await res.json()) as CurrentUser;
  },
  loginUrl(): string {
    return '/api/auth/login';
  },
  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  },
};

/**
 * Process-wide promise cache so every component that asks for the
 * current user shares one network round trip per session, rather
 * than firing /api/auth/me independently.
 */
let mePromise: Promise<CurrentUser | null> | null = null;

export function useCurrentUser(): { user: CurrentUser | null; loaded: boolean; } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (mePromise === null) {
      mePromise = auth.me().catch(() => null);
    }
    let cancelled = false;
    void mePromise.then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { user, loaded };
}
