/**
 * Client-side auth helpers. The session cookie is HTTP-only so the
 * browser holds it transparently; we just call /api/auth/me to learn
 * the current user.
 */
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
