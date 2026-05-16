/**
 * App-level Octokit client backed by the GitHub App's private key.
 * Caches the installation id for the configured DATA_REPO so we don't
 * call apps.listInstallations on every request.
 */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './config.ts';

// Re-export so consumers of @onepiece-wiki/github-client can
// type-annotate Octokit instances without depending on
// @octokit/rest directly (the dep is private to this package).
export type { Octokit };

let cachedInstallationId: number | undefined;

async function resolveInstallationId(config: GitHubAppConfig): Promise<number> {
  if (cachedInstallationId !== undefined) return cachedInstallationId;
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey: config.privateKey },
  });
  const { data } = await appOctokit.apps.getRepoInstallation({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
  });
  cachedInstallationId = data.id;
  return data.id;
}

/**
 * Returns an Octokit instance authenticated as the App's installation
 * on DATA_REPO. The token is short-lived (1 hour) but Octokit's auth
 * strategy refreshes it automatically.
 */
export async function installationClient(config: GitHubAppConfig): Promise<Octokit> {
  const installationId = await resolveInstallationId(config);
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: config.privateKey,
      installationId,
    },
  });
}
