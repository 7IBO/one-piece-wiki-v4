/**
 * Catch-all server route for every `/api/*` request (ADR-018).
 *
 * Rather than break the existing handler in `api/server.ts` into one
 * file per endpoint (~15 files, scattering rate-limit map, session
 * guards, admin checks), we mount a single splat catch-all here that
 * forwards the raw Request to `handleApiRequest`. Existing routing
 * + guards live exactly where they were before the migration; only
 * the entrypoint changed.
 *
 * The `$.ts` filename is TanStack Router's convention for a splat /
 * wildcard parameter — every path segment under `/api/` falls
 * through here.
 */
import { createFileRoute } from '@tanstack/react-router';
import { handleApiRequest } from '../../../api/server';

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleApiRequest(request),
      POST: ({ request }) => handleApiRequest(request),
      PUT: ({ request }) => handleApiRequest(request),
      DELETE: ({ request }) => handleApiRequest(request),
      PATCH: ({ request }) => handleApiRequest(request),
    },
  },
});
