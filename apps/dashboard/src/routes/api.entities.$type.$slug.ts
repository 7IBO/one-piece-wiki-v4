/**
 * `GET /api/entities/$type/$slug`  — single entity payload for the editor.
 * `POST /api/entities/$type/$slug` — submit an edit (opens a PR, or
 *                                    appends a commit to a resume-PR).
 *
 * Resume-editing: if the session has an open PR targeting this
 * entity, the GET surfaces that PR's payload (not main's) so the
 * contributor resumes where they left off, and the POST appends a
 * commit to the same PR instead of opening a parallel one.
 */
import {
  findOpenPRForEntity,
  getFile,
  type GitHubAppConfig,
  installationClient,
  OptimisticLockError,
  submitEntityEdit,
} from '@onepiece-wiki/github-client';
import { buildEntitySchema } from '@onepiece-wiki/schema-engine';
import { createFileRoute } from '@tanstack/react-router';
import { isBlockedIp, isBlockedLogin } from '../server/blocklist';
import {
  badRequest,
  findEntity,
  json,
  LOCALES,
  type Locale,
  notFound,
  readTranslationsFor,
  snapshot,
  UNIVERSE,
} from '../server/catalogue';
import {
  isInstallMissing,
  looksLikeMissingInstallation,
  markInstallMissing,
  tryLoadConfig,
} from '../server/github';
import { normalizeNickname } from '../server/nickname';
import {
  ANON_WRITE_LIMIT,
  isAdminSession,
  rateLimitHit,
  rateLimitKey,
} from '../server/rate-limit';
import { readDashboardSession } from '../server/session';

function relativeDataPath(type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/entities/${type}/${fileBase}.json`;
}

function relativeTranslationsPath(locale: Locale, type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/translations/${locale}/${type}/${fileBase}.json`;
}

async function readTranslationsFromBranch(
  octokit: Awaited<ReturnType<typeof installationClient>>,
  cfg: GitHubAppConfig,
  type: string,
  fileBase: string,
  branch: string,
): Promise<Record<Locale, Record<string, string>>> {
  const out = { en: {}, fr: {} } as Record<Locale, Record<string, string>>;
  for (const locale of LOCALES) {
    // eslint-disable-next-line no-await-in-loop
    const f = await getFile(octokit, cfg, relativeTranslationsPath(locale, type, fileBase), branch);
    if (f === null) continue;
    try {
      const parsed = JSON.parse(f.content) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out[locale] = parsed as Record<string, string>;
      }
    } catch {
      // Malformed — leave empty for this locale.
    }
  }
  return out;
}

export const Route = createFileRoute('/api/entities/$type/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { type, slug } = params;
        const snap = await snapshot();
        const entity = await findEntity(snap, type, slug);
        if (entity === undefined) {
          return notFound(`No entity of type ${type} with slug ${slug}`);
        }

        const session = readDashboardSession(request);
        const fileBase = entity.id.split(':')[1] ?? slug;

        let data: Record<string, unknown> = entity.data;
        let sha: string | null = null;
        let translations = await readTranslationsFor(type, fileBase);
        let resumePR:
          | { number: number; htmlUrl: string; headBranch: string }
          | null = null;

        const cfg = tryLoadConfig();
        if (cfg !== null && !isInstallMissing()) {
          try {
            const octokit = await installationClient(cfg);

            if (
              session !== null
              && !(session.kind === 'anonymous' && session.nickname === '')
            ) {
              try {
                const identity = session.kind === 'github'
                  ? { kind: 'github' as const, login: session.login }
                  : { kind: 'anonymous' as const, nickname: session.nickname };
                const open = await findOpenPRForEntity(octokit, cfg, identity, entity.id);
                if (open !== null) {
                  resumePR = {
                    number: open.number,
                    htmlUrl:
                      `https://github.com/${cfg.dataRepo.owner}/${cfg.dataRepo.repo}/pull/${open.number}`,
                    headBranch: open.headBranch,
                  };
                  const onBranch = await getFile(
                    octokit,
                    cfg,
                    relativeDataPath(type, fileBase),
                    open.headBranch,
                  );
                  if (onBranch !== null) {
                    sha = onBranch.sha;
                    try {
                      const parsed = JSON.parse(onBranch.content) as unknown;
                      if (
                        parsed !== null
                        && typeof parsed === 'object'
                        && !Array.isArray(parsed)
                      ) {
                        data = parsed as Record<string, unknown>;
                      }
                    } catch {
                      // Malformed JSON on the branch — fall back to main's version.
                    }
                    translations = await readTranslationsFromBranch(
                      octokit,
                      cfg,
                      type,
                      fileBase,
                      open.headBranch,
                    );
                  }
                }
              } catch (err) {
                process.stderr.write(
                  `[resume-pr] lookup failed for ${entity.id}: ${
                    err instanceof Error ? err.message : String(err)
                  }\n`,
                );
              }
            }

            if (sha === null) {
              const file = await getFile(octokit, cfg, relativeDataPath(type, fileBase));
              sha = file?.sha ?? null;
            }
          } catch (err) {
            if (looksLikeMissingInstallation(err)) {
              markInstallMissing();
            } else {
              process.stderr.write(
                `[api/entities] getFile failed for ${entity.id}: ${
                  err instanceof Error ? err.message : String(err)
                }\n`,
              );
            }
          }
        }

        return json({
          id: entity.id,
          type,
          slug,
          data,
          sha,
          translations,
          ...(resumePR !== null ? { resumePR } : {}),
        });
      },

      POST: async ({ request, params }) => {
        const { type, slug } = params;

        // BLOCKED_IPS kill-switch — applied to any write before doing
        // real work. Generic 403 so scraping the blocklist is boring.
        if (isBlockedIp(
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
        )) {
          return new Response(JSON.stringify({ error: 'Forbidden.' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }

        const session = readDashboardSession(request);
        if (session === null) {
          return json({ error: 'Sign in (anonymous or GitHub) before saving.' }, 401);
        }

        // BLOCKED_GITHUB_USERNAMES kill-switch. The OAuth callback also
        // rejects blocked logins at session issuance; this guard defends
        // against a session created before the login was added.
        if (session.kind === 'github' && isBlockedLogin(session.login)) {
          return new Response(
            JSON.stringify({ error: `User @${session.login} is blocked.` }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          );
        }

        const cfg = tryLoadConfig();
        if (cfg === null) {
          return json({ error: 'GitHub auth not configured.' }, 503);
        }

        // Rate limit non-admin sessions.
        if (!isAdminSession(session)) {
          if (rateLimitHit('save', rateLimitKey(session, request), ANON_WRITE_LIMIT)) {
            return new Response(
              JSON.stringify({
                error: `Rate limit reached (${ANON_WRITE_LIMIT}/hour). Try again later.`,
              }),
              { status: 429, headers: { 'content-type': 'application/json' } },
            );
          }
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (body === null || typeof body !== 'object') {
          return badRequest('Body must be an object with { data, sha }.');
        }
        const payload = body as {
          data?: Record<string, unknown>;
          sha?: string | null;
          translations?: Partial<Record<Locale, Record<string, string>>>;
        };
        if (
          payload.data === undefined
          || typeof payload.data !== 'object'
          || payload.data === null
        ) {
          return badRequest('Body.data must be the entity object.');
        }

        let anonymousNickname: string | null = null;
        if (session.kind === 'anonymous') {
          const checked = normalizeNickname(session.nickname);
          if (checked !== null && typeof checked === 'object') return badRequest(checked.error);
          anonymousNickname = checked;
        }

        const snap = await snapshot();
        const entity = await findEntity(snap, type, slug);
        if (entity === undefined) {
          return notFound(`No entity of type ${type} with slug ${slug}`);
        }

        if (payload.data['id'] !== entity.id) {
          return badRequest(`data.id must equal "${entity.id}".`);
        }
        if (payload.data['type'] !== type) return badRequest(`data.type must equal "${type}".`);
        if (payload.data['slug'] !== slug) return badRequest(`data.slug must equal "${slug}".`);

        // Server-side schema validation — same Zod validator the CLI
        // uses in `bun run validate`. An edit that passes here is
        // guaranteed to pass CI once the PR opens.
        const entitySchema = buildEntitySchema(type, snap.validated);
        if (entitySchema === undefined) {
          return badRequest(`No schema registered for entity type "${type}".`);
        }
        const validation = entitySchema.safeParse(payload.data);
        if (!validation.success) {
          const issues = validation.error.errors.map((issue) => ({
            path: issue.path.map((p) => String(p)),
            message: issue.message,
          }));
          const summary = issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('; ');
          return json(
            {
              error: `Entity validation failed: ${summary}`,
              code: 'validation_failed',
              issues,
            },
            400,
          );
        }

        const fileBase = entity.id.split(':')[1] ?? slug;
        const path = relativeDataPath(type, fileBase);
        const newContent = `${JSON.stringify(payload.data, null, 2)}\n`;

        const extraFiles: { path: string; content: string }[] = [];
        for (const locale of LOCALES) {
          const map = payload.translations?.[locale];
          if (map === undefined) continue;
          const filtered: Record<string, string> = {};
          for (const [k, v] of Object.entries(map)) {
            if (typeof v === 'string' && v.length > 0) filtered[k] = v;
          }
          if (Object.keys(filtered).length === 0) continue;
          extraFiles.push({
            path: relativeTranslationsPath(locale, type, fileBase),
            content: `${JSON.stringify(filtered, null, 2)}\n`,
          });
        }

        const octokit = await installationClient(cfg);

        // Resume-editing routing: if this contributor already has an
        // open PR for this entity, append a commit to that PR's
        // branch instead of opening a parallel PR. Lookup runs
        // server-side using the session identity (cookie) — no
        // client param to spoof.
        let existingPR:
          | { number: number; htmlUrl: string; headBranch: string }
          | undefined;
        if (session.kind === 'github' || (session.kind === 'anonymous' && session.nickname !== '')) {
          try {
            const identity = session.kind === 'github'
              ? { kind: 'github' as const, login: session.login }
              : { kind: 'anonymous' as const, nickname: session.nickname };
            const open = await findOpenPRForEntity(octokit, cfg, identity, entity.id);
            if (open !== null) {
              existingPR = {
                number: open.number,
                htmlUrl:
                  `https://github.com/${cfg.dataRepo.owner}/${cfg.dataRepo.repo}/pull/${open.number}`,
                headBranch: open.headBranch,
              };
            }
          } catch (err) {
            // Resume lookup is best-effort. If it fails (search
            // index lag, rate limit, …) we fall through to opening
            // a new PR — at worst the contributor ends up with two
            // PRs on the same entity, which the admin can dedup.
            process.stderr.write(
              `[resume-pr] save-lookup failed for ${entity.id}: ${
                err instanceof Error ? err.message : String(err)
              }\n`,
            );
          }
        }

        try {
          const pr = await submitEntityEdit(octokit, cfg, {
            entityId: entity.id,
            path,
            newContent,
            expectedSha: payload.sha ?? null,
            contributorLogin: session.kind === 'github' ? session.login : null,
            contributorId: session.kind === 'github' ? session.userId : null,
            ...(anonymousNickname !== null ? { anonymousNickname } : {}),
            extraFiles,
            ...(existingPR !== undefined ? { existingPR } : {}),
          });
          return json({ ok: true, pr });
        } catch (err) {
          if (err instanceof OptimisticLockError) {
            return json({ error: err.message, currentSha: err.currentSha }, 409);
          }
          throw err;
        }
      },
    },
  },
});
