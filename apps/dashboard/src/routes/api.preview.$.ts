/**
 * `GET /api/preview/<key>...` — resolve a `staging://<key>` placeholder
 * to a short-lived signed R2 GET URL and 302 to it. The dashboard's
 * `<img src>` hits this route for staged images so:
 *
 *  - the signed URL never lands in HTML markup or referrer headers
 *    (it lives only in the redirect's Location header)
 *  - the URL expires after 60s so a leaked preview link goes stale
 *    almost immediately
 *
 * The key may contain slashes (e.g. `pending/foo.png`) so the route
 * uses TanStack Router's splat (`$`) syntax — `params._splat` is
 * the URL-encoded remainder after `/api/preview/`.
 *
 * Auth: any authenticated user. The staged bytes are nominally
 * private; without a session the route returns 401 so the public
 * web cannot enumerate `pending/` keys.
 */
import { createFileRoute } from '@tanstack/react-router';
import { badRequest, json } from '../server/catalogue';
import { presignRead, r2Config } from '../server/r2';
import { readDashboardSession } from '../server/session';

export const Route = createFileRoute('/api/preview/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = readDashboardSession(request);
        if (session === null) return json({ error: 'Sign in to preview staged images.' }, 401);

        const cfg = r2Config();
        if (cfg === null) {
          return json(
            { error: 'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.' },
            503,
          );
        }
        const raw = (params as { _splat?: string })._splat ?? '';
        const key = decodeURIComponent(raw);
        if (key === '' || key.includes('..')) return badRequest('Invalid key.');
        try {
          const signed = await presignRead(cfg, key, 60);
          return new Response(null, { status: 302, headers: { location: signed } });
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : String(err));
        }
      },
    },
  },
});
