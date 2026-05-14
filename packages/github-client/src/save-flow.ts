/**
 * High-level save flow used by the dashboard.
 *
 * 1. Read the entity file from main; capture its SHA.
 * 2. If the dashboard's expectedSha doesn't match, throw
 *    OptimisticLockError so the dashboard can show a conflict.
 * 3. Create a branch named edit/<safe-id>/<ts>.
 * 4. Write the entity file to the branch (one commit).
 * 5. Write each additional file (typically translations) to the same
 *    branch, one commit per file. Each file's pre-existing SHA is
 *    fetched first; new files are created without a SHA.
 * 6. Open a PR labelled "edit" + "via-dashboard".
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

export type ExtraFile = {
  readonly path: string;
  readonly content: string;
};

export type SaveRequest = {
  readonly entityId: string;
  readonly path: string;
  readonly newContent: string;
  readonly expectedSha: string | null;
  readonly contributorLogin: string;
  readonly extraFiles?: readonly ExtraFile[];
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

  const extraPaths: string[] = [];
  for (const file of request.extraFiles ?? []) {
    const existing = await getFile(octokit, config, file.path, branch);
    await writeFile(
      octokit,
      config,
      branch,
      file.path,
      file.content,
      existing?.sha ?? null,
      `Update ${file.path}`,
    );
    extraPaths.push(file.path);
  }

  const fileList = [`File: \`${request.path}\``, ...extraPaths.map((p) => `File: \`${p}\``)];

  return openPullRequest(octokit, config, {
    headBranch: branch,
    title: `Edit ${request.entityId}`,
    body: [
      `Edit submitted via the dashboard.`,
      ``,
      `Contributor: @${request.contributorLogin}`,
      `Entity: \`${request.entityId}\``,
      ...fileList,
    ].join('\n'),
    labels: ['edit', 'via-dashboard'],
  });
}
