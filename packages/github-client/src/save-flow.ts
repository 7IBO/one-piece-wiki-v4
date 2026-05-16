/**
 * High-level save flow used by the dashboard.
 *
 * Authorship model: every commit and the PR itself are made by the
 * GitHub App's installation token, so the bot is the listed author.
 * The human maintainer is credited via two mechanisms:
 *
 *   1. **Commit `Co-authored-by:` trailers** — GitHub recognises this
 *      and shows the user as co-author of each commit, attributes the
 *      contribution to their graph, and surfaces them in the PR's
 *      "Co-authored-by" footer. Format:
 *      `Co-authored-by: <login> <id+login@users.noreply.github.com>`.
 *
 *   2. **PR body** — the user is `@mention`'d at the top so reviewers
 *      see who submitted the change and the user gets notifications.
 *
 * Steps:
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
  readonly contributorId: number;
  readonly extraFiles?: readonly ExtraFile[];
};

function safeBranchSegment(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

/**
 * Build the GitHub-recognised commit trailer that credits the human
 * contributor as co-author of a bot-authored commit.
 * https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors
 */
function coAuthoredByTrailer(login: string, id: number): string {
  return `Co-authored-by: ${login} <${id}+${login}@users.noreply.github.com>`;
}

function commitMessage(subject: string, login: string, id: number): string {
  return `${subject}\n\n${coAuthoredByTrailer(login, id)}\n`;
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
    commitMessage(
      `Edit ${request.entityId}`,
      request.contributorLogin,
      request.contributorId,
    ),
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
      commitMessage(
        `Update ${file.path}`,
        request.contributorLogin,
        request.contributorId,
      ),
    );
    extraPaths.push(file.path);
  }

  const fileLines = [request.path, ...extraPaths].map((p) => `- \`${p}\``);

  return openPullRequest(octokit, config, {
    headBranch: branch,
    title: `Edit ${request.entityId}`,
    body: [
      `Submitted by @${request.contributorLogin} via the dashboard.`,
      ``,
      `**Entity:** \`${request.entityId}\``,
      ``,
      `**Files changed:**`,
      ...fileLines,
      ``,
      `---`,
      `_This pull request was opened by the dashboard bot on behalf of`,
      `@${request.contributorLogin}. The contributor is credited as`,
      `\`Co-authored-by\` on every commit so their GitHub account`,
      `appears on the contribution graph._`,
    ].join('\n'),
    labels: ['edit', 'via-dashboard'],
  });
}
