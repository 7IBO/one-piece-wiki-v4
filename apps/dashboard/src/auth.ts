/**
 * Client-side auth helpers (ADR-017 — stateless signed cookies, no
 * external auth library). The session cookie is HttpOnly so the
 * browser holds it transparently; this module only knows three
 * verbs:
 *
 *   - `auth.me()`               — read `/api/auth/me` projection
 *   - `auth.signInAnonymous(n)` — POST `/api/auth/anonymous`
 *   - `auth.signInWithGitHub()` — navigate to `/api/auth/login/github`
 *                                 (302 → GitHub → callback → home)
 *   - `auth.signOut()`          — POST `/api/auth/sign-out`
 */
import { useEffect, useState } from 'react';

export type CurrentUser =
  | {
    readonly kind: 'github';
    readonly login: string;
    readonly displayName: string;
  }
  | {
    readonly kind: 'anonymous';
    readonly nickname: string;
    readonly displayName: string;
  };

export const auth = {
  async me(): Promise<CurrentUser | null> {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`auth/me ${res.status}`);
    return (await res.json()) as CurrentUser;
  },

  /**
   * Anonymous sign-in. Server-side `normalizeNickname` re-validates
   * the value (1-32 chars, restricted alphabet), so a malicious
   * client crafting an invalid name gets a 400 — we don't need to
   * defend against it here, just trim.
   */
  async signInAnonymous(nickname: string): Promise<CurrentUser> {
    const trimmed = nickname.trim();
    if (trimmed === '') throw new Error('Nickname required.');
    const res = await fetch('/api/auth/anonymous', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: trimmed }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`auth/anonymous ${res.status}: ${text}`);
    }
    invalidateMe();
    return (await res.json()) as CurrentUser;
  },

  /**
   * GitHub sign-in is a full-page redirect (server 302s to GitHub's
   * authorize URL with an anti-CSRF state). After the user approves
   * GitHub redirects back to `/api/auth/callback/github`, the server
   * sets the cookie and 302s to `/`.
   */
  signInWithGitHubUrl(): string {
    return '/api/auth/login/github';
  },
  signInWithGitHub(): void {
    globalThis.location.assign('/api/auth/login/github');
  },

  async signOut(): Promise<void> {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    invalidateMe();
  },
};

/**
 * Process-wide promise cache so every component that asks for the
 * current user shares one network round trip per session, rather
 * than firing /api/auth/me independently.
 */
let mePromise: Promise<CurrentUser | null> | null = null;

function invalidateMe(): void {
  mePromise = null;
}

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
