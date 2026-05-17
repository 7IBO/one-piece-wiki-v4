/**
 * `GET /api/me/contributions` — list the current session's open
 * contributions (PRs labelled `via-dashboard` whose body mentions the
 * contributor). Powers the "Vos contributions en cours" home section.
 *
 * Returns `[]` for read-only visitors rather than 401 so the home
 * page renders cleanly even when no session is present. Returns `[]`
 * too on any GitHub failure (rate limit, search index lag) — the
 * home page should keep rendering when GitHub is grumpy.
 */
import {
  installationClient,
  listOpenContributions,
  type OpenContribution,
} from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import { json } from '../server/catalogue';
import { tryLoadConfig } from '../server/github';
import { readDashboardSession } from '../server/session';

export const Route = createFileRoute('/api/me/contributions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = tryLoadConfig();
        if (cfg === null) return json({ contributions: [] as OpenContribution[] });

        const session = readDashboardSession(request);
        if (session === null) return json({ contributions: [] as OpenContribution[] });

        // An anonymous session with an empty nickname can't be matched
        // against PR bodies unambiguously — bail out rather than risk
        // returning someone else's PR.
        if (session.kind === 'anonymous' && session.nickname === '') {
          return json({ contributions: [] as OpenContribution[] });
        }

        try {
          const octokit = await installationClient(cfg);
          const list = await listOpenContributions(
            octokit,
            cfg,
            session.kind === 'github'
              ? { kind: 'github', login: session.login }
              : { kind: 'anonymous', nickname: session.nickname },
          );
          return json({ contributions: list });
        } catch (err) {
          process.stderr.write(
            `[contributions] search failed: ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
          return json({ contributions: [] as OpenContribution[] });
        }
      },
    },
  },
});
