/**
 * `GET /api/entities/$type/$slug` — single entity payload for the
 * editor. Returns the entity's `data`, current `sha` on GitHub main,
 * and per-locale translations bundled in.
 *
 * Phase B port: GET only, no session-aware resume-PR yet (that
 * arrives in Phase C with the auth port). If the GitHub App config
 * is missing or the app isn't installed on the data repo, `sha` is
 * returned as `null` and the read path keeps working — the dashboard
 * already renders an "not on GitHub yet" badge in that case.
 *
 * POST (save flow) lands in this same file in Phase D so the route
 * definition stays single-sourced. For now only GET is registered.
 */
import { getFile, installationClient } from '@onepiece-wiki/github-client';
import { createFileRoute } from '@tanstack/react-router';
import {
  findEntity,
  json,
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

/**
 * Repo-relative path the GitHub client expects. The on-disk loader
 * uses an absolute path via `catalogue.dataPath`; this is the same
 * file expressed relative to the repo root.
 */
function relativeDataPath(type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/entities/${type}/${fileBase}.json`;
}

export const Route = createFileRoute('/api/entities/$type/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { type, slug } = params;
        const snap = await snapshot();
        const entity = await findEntity(snap, type, slug);
        if (entity === undefined) {
          return notFound(`No entity of type ${type} with slug ${slug}`);
        }

        const fileBase = entity.id.split(':')[1] ?? slug;
        const translations = await readTranslationsFor(type, fileBase);
        let sha: string | null = null;

        // Best-effort SHA lookup. Skips silently if the GitHub App
        // isn't configured or installed — the editor renders an
        // "not on GitHub yet" badge in that case.
        const cfg = tryLoadConfig();
        if (cfg !== null && !isInstallMissing()) {
          try {
            const octokit = await installationClient(cfg);
            const file = await getFile(octokit, cfg, relativeDataPath(type, fileBase));
            sha = file?.sha ?? null;
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
          data: entity.data,
          sha,
          translations,
        });
      },
    },
  },
});
