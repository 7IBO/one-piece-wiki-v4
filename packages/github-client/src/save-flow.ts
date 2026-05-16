/**
 * High-level save flow used by the dashboard.
 *
 * Authorship model: every commit and the PR itself are made by the
 * GitHub App's installation token, so the bot is the listed author.
 * Contributor attribution depends on whether the dashboard caller
 * is authenticated:
 *
 *   - **Authenticated** (contributor or admin) — commits carry a
 *     `Co-authored-by: <login> <id+login@users.noreply.github.com>`
 *     trailer; the PR body `@mention`s the contributor.
 *   - **Anonymous** (no session) — no trailer at all (PR is
 *     bot-authored only). The PR body shows the optional
 *     self-chosen `anonymousNickname` as a plain string (NO `@`
 *     prefix — it isn't a GitHub handle). No identifying
 *     metadata (IP, fingerprint, etc.) is stored or surfaced.
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
 * 6. Open a PR labelled "edit" + "via-dashboard" (+ "anonymous"
 *    when the contributor is null).
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
  /** GitHub login of the contributor, or null for anonymous edits. */
  readonly contributorLogin: string | null;
  /** Numeric user id, paired with login for the noreply email
   *  trailer. Null when anonymous. */
  readonly contributorId: number | null;
  /** Self-chosen display name for anonymous contributions. Surfaces
   *  in the PR body verbatim with NO `@` prefix (it isn't a GitHub
   *  handle). Ignored when `contributorLogin` is non-null. */
  readonly anonymousNickname?: string;
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

function commitMessage(
  subject: string,
  login: string | null,
  id: number | null,
): string {
  // Anonymous: bare subject — no trailer. The GitHub App is the
  // sole author of the commit; nothing to credit.
  if (login === null || id === null) return `${subject}\n`;
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
    commitMessage(`Edit ${request.entityId}`, request.contributorLogin, request.contributorId),
  );

  const extraPaths: string[] = [];
  for (const file of request.extraFiles ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await getFile(octokit, config, file.path, branch);
    // eslint-disable-next-line no-await-in-loop
    await writeFile(
      octokit,
      config,
      branch,
      file.path,
      file.content,
      existing?.sha ?? null,
      commitMessage(`Update ${file.path}`, request.contributorLogin, request.contributorId),
    );
    extraPaths.push(file.path);
  }

  const fileLines = [request.path, ...extraPaths].map((p) => `- \`${p}\``);
  const anonymous = request.contributorLogin === null;
  const nickname = request.anonymousNickname?.trim() ?? '';

  // PR body header:
  //  - Authenticated: "Submitted by @login via the dashboard."
  //  - Anonymous with nickname: "Submitted by **Nickname** (anonymous)…"
  //  - Anonymous without nickname: "Anonymous contribution via…"
  // The nickname is rendered as bold plain text — never with `@`,
  // so a reviewer can't confuse it for a GitHub handle.
  const headerLine = anonymous
    ? (nickname !== ''
      ? `Submitted by **${nickname}** (anonymous, via the dashboard).`
      : `**Anonymous contribution** via the dashboard.`)
    : `Submitted by @${request.contributorLogin} via the dashboard.`;

  const footer = anonymous
    ? [
      `---`,
      `_This pull request was opened anonymously through the dashboard._`,
      `_The displayed name is self-chosen by the contributor and is_`,
      `_not verified — treat it as a label, not an identity._`,
      `_The commit author is the dashboard bot; no \`Co-authored-by\` is set._`,
    ]
    : [
      `---`,
      `_This pull request was opened by the dashboard bot on behalf of`,
      `@${request.contributorLogin}. The contributor is credited as`,
      `\`Co-authored-by\` on every commit so their GitHub account`,
      `appears on the contribution graph._`,
    ];

  return openPullRequest(octokit, config, {
    headBranch: branch,
    title: `Edit ${request.entityId}`,
    body: [
      headerLine,
      ``,
      `**Entity:** \`${request.entityId}\``,
      ``,
      `**Files changed:**`,
      ...fileLines,
      ``,
      ...footer,
    ].join('\n'),
    labels: anonymous ? ['edit', 'via-dashboard', 'anonymous'] : ['edit', 'via-dashboard'],
  });
}
