/**
 * `GET /api/entities/$type/$slug` — single entity payload for the
 * editor. Returns the entity's `data`, current `sha` on GitHub main
 * (or the PR head branch when a resume-PR matches), and per-locale
 * translations bundled in.
 *
 * Resume-editing: if the session has an open PR targeting this
 * entity, surface that PR's payload (not main's) so the contributor
 * resumes from where they left off. The `resumePR` metadata lets the
 * frontend render a banner and the save flow append a commit instead
 * of opening a new PR.
 *
 * POST (save flow) lands in this same file in Phase D so the route
 * definition stays single-sourced. For now only GET is registered.
 */
import {
  findOpenPRForEntity,
  getFile,
  type GitHubAppConfig,
  installationClient,
} from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import {
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
import { readDashboardSession } from '../server/session';

function relativeDataPath(type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/entities/${type}/${fileBase}.json`;
}

function relativeTranslationsPath(locale: Locale, type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/translations/${locale}/${type}/${fileBase}.json`;
}

/**
 * Read translation files for the entity off a PR branch. Mirrors
 * `readTranslationsFor` (filesystem) but goes through Octokit so we
 * see the contributor's in-flight translation edits. Missing files
 * become empty objects so the form can still render every key.
 */
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
      // Malformed — leave empty for this locale. Same forgiving
      // behaviour as the local-file reader.
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

            // Resume-PR lookup. Only relevant if the session has a
            // matchable identity (anonymous-with-empty-nickname can't
            // be disambiguated against PR bodies).
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
                      // Malformed JSON on the branch — fall back to
                      // main's version (already loaded into `data`).
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
                // Resume lookup failed (search API timeout, etc.) —
                // fall through with main's content. Don't surface
                // the error; the regular read path is still useful.
                process.stderr.write(
                  `[resume-pr] lookup failed for ${entity.id}: ${
                    err instanceof Error ? err.message : String(err)
                  }\n`,
                );
              }
            }

            // Fallback SHA lookup on main when resume-PR didn't run
            // (or didn't yield a SHA).
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
    },
  },
});
