/**
 * `GET /api/auth/login/github` — 302 to GitHub's authorize URL with
 * an anti-CSRF state. The browser comes back to
 * `/api/auth/callback/github` after the user approves.
 *
 * State is stateless-HMAC signed (see `src/server/oauth-state.ts`) so
 * the `/login` and `/callback` requests don't have to land on the
 * same function instance — a hard requirement on Vercel's serverless
 * runtime.
 */
import { authorizeUrl } from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import { badRequest } from '../server/catalogue';
import { configError, tryLoadConfig } from '../server/github';
import { mintOAuthState } from '../server/oauth-state';

const PUBLIC_BASE_URL = process.env['DASHBOARD_PUBLIC_URL'] ?? 'http://localhost:4100';

export const Route = createFileRoute('/api/auth/login/github')({
  server: {
    handlers: {
      GET: () => {
        const cfg = tryLoadConfig();
        if (cfg === null) {
          return badRequest(`GitHub auth disabled: ${configError() ?? 'config missing'}`);
        }
        const state = mintOAuthState();
        const url = authorizeUrl(cfg, `${PUBLIC_BASE_URL}/api/auth/callback/github`, state);
        return new Response(null, { status: 302, headers: { location: url } });
      },
    },
  },
});
