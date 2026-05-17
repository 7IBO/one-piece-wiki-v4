/**
 * `POST /api/admin/promote {prNumber}` — admin-only: approve a PR
 * carrying staged images. Promotes the staged R2 objects from
 * `pending/` to `images/`, rewrites `staging://` URLs on the PR head
 * branch, and squash-merges the PR. See `src/server/admin-promote.ts`
 * for the detailed flow.
 */
import { isAdmin, installationClient } from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import { promoteAndMergePR } from '../server/admin-promote';
import { badRequest, json } from '../server/catalogue';
import { tryLoadConfig } from '../server/github';
import { r2Config } from '../server/r2';
import { readDashboardSession } from '../server/session';

export const Route = createFileRoute('/api/admin/promote')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = tryLoadConfig();
        if (cfg === null) return json({ error: 'GitHub auth not configured.' }, 503);

        const session = readDashboardSession(request);
        if (session === null) return json({ error: 'Sign in first.' }, 401);
        if (session.kind !== 'github' || !isAdmin(cfg, session.login)) {
          return new Response(JSON.stringify({ error: 'Admin only.' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }
        const r2 = r2Config();
        if (r2 === null) {
          return json(
            { error: 'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.' },
            503,
          );
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        const prNumber = (body as { prNumber?: unknown }).prNumber;
        if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
          return badRequest('prNumber must be a positive integer.');
        }
        try {
          const octokit = await installationClient(cfg);
          const outcome = await promoteAndMergePR({
            octokit,
            cfg,
            r2,
            prNumber,
            approverLogin: session.login,
          });
          return json(outcome);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[admin-promote] PR #${prNumber} failed: ${message}\n`);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
