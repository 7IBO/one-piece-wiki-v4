/**
 * `GET /api/auth/callback/github?code&state` — finishes the OAuth
 * dance: verifies `state`, exchanges the code for the user's login +
 * numeric id, rejects blocked logins, mints a `github`-kind session
 * cookie, then 302s back to the home page.
 */
import { exchangeCode } from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import { badRequest } from '../server/catalogue';
import { isBlockedLogin } from '../server/blocklist';
import { configError, tryLoadConfig } from '../server/github';
import { verifyOAuthState } from '../server/oauth-state';
import { buildCookie, newGithubSession } from '../server/session';

const PUBLIC_BASE_URL = process.env['DASHBOARD_PUBLIC_URL'] ?? 'http://localhost:4100';

export const Route = createFileRoute('/api/auth/callback/github')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = tryLoadConfig();
        if (cfg === null) {
          return badRequest(`GitHub auth disabled: ${configError() ?? 'config missing'}`);
        }
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (code === null || state === null) return badRequest('Missing code or state.');
        if (!verifyOAuthState(state)) return badRequest('Invalid OAuth state.');

        const user = await exchangeCode(cfg, code);
        if (isBlockedLogin(user.login)) {
          return new Response(`User @${user.login} is blocked.`, {
            status: 403,
            headers: { 'content-type': 'text/plain' },
          });
        }
        const session = newGithubSession(user.login, user.id);
        return new Response(null, {
          status: 302,
          headers: {
            location: `${PUBLIC_BASE_URL}/`,
            'set-cookie': buildCookie(session),
          },
        });
      },
    },
  },
});
