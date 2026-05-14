/**
 * High-level save flow used by the dashboard.
 *
 * 1. Read current file from main; capture its SHA.
 * 2. If `expectedSha` doesn't match the current SHA, throw
 *    OptimisticLockError so the dashboard can show a conflict.
 * 3. Create a branch named edit/<safe-id>/<ts>.
 * 4. Write the new content to the branch with the matching SHA.
 * 5. Open a PR labelled "edit" + "via-dashboard".
 *
 * Returns the opened PR.
 */
import type { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './config.ts';
import {
  createBranch,
  getFile,
  type OpenedPR,
  openPullRequest,
  OptimisticLockError,
  writeFile,
} from './repo-ops.ts';

export type SaveRequest = {
  readonly entityId: string;
  readonly path: string;
  readonly newContent: string;
  readonly expectedSha: string | null;
  readonly contributorLogin: string;
};

function safeBranchSegment(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

export async function submitEntityEdit(
  octokit: Octokit,
  config: GitHubAppConfig,
  request: SaveRequest,
): Promise<OpenedPR> {
  const current = await getFile(octokit, config, request.path);
  if (current !== null) {
    if (request.expectedSha !== null && current.sha !== request.expectedSha) {
      throw new OptimisticLockError(request.path, request.expectedSha, current.sha);
    }
  }

  const ts = new Date().toISOString().replace(/[:.TZ]/g, '').slice(0, 14);
  const branch = `edit/${safeBranchSegment(request.entityId)}/${ts}`;
  await createBranch(octokit, config, branch);

  await writeFile(
    octokit,
    config,
    branch,
    request.path,
    request.newContent,
    current?.sha ?? null,
    `Edit ${request.entityId}`,
  );

  return openPullRequest(octokit, config, {
    headBranch: branch,
    title: `Edit ${request.entityId}`,
    body: [
      `Edit submitted via the dashboard.`,
      ``,
      `Contributor: @${request.contributorLogin}`,
      `Entity: \`${request.entityId}\``,
      `File: \`${request.path}\``,
    ].join('\n'),
    labels: ['edit', 'via-dashboard'],
  });
}
