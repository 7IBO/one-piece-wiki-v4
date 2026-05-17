/**
 * `POST /api/auth/sign-out` — clear the session cookie. 204 No Content
 * (no body) so the client doesn't need to parse JSON.
 */
import { createFileRoute } from '@tanstack/react-router';
import { clearCookie } from '../server/session';

export const Route = createFileRoute('/api/auth/sign-out')({
  server: {
    handlers: {
      POST: () => {
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': clearCookie() },
        });
      },
    },
  },
});
