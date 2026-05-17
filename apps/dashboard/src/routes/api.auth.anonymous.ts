/**
 * `POST /api/auth/anonymous {nickname}` — validate the self-chosen
 * pseudo (1-32 chars, restricted alphabet — see `normalizeNickname`),
 * mint an `anonymous`-kind session cookie, return the same projection
 * the frontend reads from `/api/auth/me` so the caller has the
 * session ready without a follow-up round trip.
 */
import { createFileRoute } from '@tanstack/react-router';
import { badRequest } from '../server/catalogue';
import { normalizeNickname } from '../server/nickname';
import { buildCookie, newAnonymousSession } from '../server/session';

export const Route = createFileRoute('/api/auth/anonymous')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (body === null || typeof body !== 'object') {
          return badRequest('Body must be { nickname }.');
        }
        const raw = (body as { nickname?: unknown }).nickname;
        const nick = normalizeNickname(raw);
        if (nick === null) return badRequest('nickname is required.');
        if (typeof nick === 'object') return badRequest(nick.error);
        const session = newAnonymousSession(nick);
        return new Response(
          JSON.stringify({
            kind: 'anonymous',
            nickname: nick,
            displayName: nick,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': buildCookie(session),
            },
          },
        );
      },
    },
  },
});
