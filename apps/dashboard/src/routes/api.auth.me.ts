/**
 * `GET /api/auth/me` — stable projection of the current session. The
 * shape is decoupled from the cookie's internal layout so the cookie
 * format can change without breaking clients.
 *
 * Returns 401 when no session is present (read-only visitor) — the
 * `auth.me()` client helper treats 401 as "signed out" and returns
 * `null` without surfacing an error.
 */
import { createFileRoute } from '@tanstack/react-router';
import { json } from '../server/catalogue';
import { type DashboardSession, readDashboardSession } from '../server/session';

function projectMe(session: DashboardSession): {
  kind: 'github' | 'anonymous';
  login?: string;
  nickname?: string;
  displayName: string;
} {
  if (session.kind === 'github') {
    return { kind: 'github', login: session.login, displayName: session.login };
  }
  return {
    kind: 'anonymous',
    nickname: session.nickname,
    displayName: session.nickname,
  };
}

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const session = readDashboardSession(request);
        if (session === null) return json({ error: 'Not signed in.' }, 401);
        return json(projectMe(session));
      },
    },
  },
});
