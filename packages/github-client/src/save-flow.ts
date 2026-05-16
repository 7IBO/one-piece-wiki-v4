/**
 * High-level save flow used by the dashboard.
 *
 * Authorship model (revised per ADR-016): every commit and the PR
 * itself are made by the GitHub App's installation token, so the bot
 * is the sole listed author on every commit. We deliberately do NOT
 * emit a `Co-authored-by:` trailer for any flow — the resulting commits
 * appearing on a contributor's GitHub graph proved confusing in user
 * testing (anonymous and GitHub-signed-in users both expected the same
 * presentation), and the trailer is purely cosmetic for a bot-owned
 * repository where review attribution is what matters.
 *
 * The human contributor is mentioned exactly once, in the PR body's
 * "Contributors" section:
 *
 *   - **GitHub** — `@login` so GitHub renders the mention as a link.
 *   - **Anonymous** — bold plain text `**Pseudo**` (NO `@`) so a
 *     reviewer cannot confuse the self-chosen label for a real handle.
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
  /** GitHub login of the contributor, or null for anonymous edits.
   *  Surfaces as `@login` in the PR body's Contributors section. */
  readonly contributorLogin: string | null;
  /** Numeric user id, preserved for future use (e.g. potential
   *  re-enable of Co-authored-by trailers). Null when anonymous. */
  readonly contributorId: number | null;
  /** Self-chosen display name for anonymous contributions. Surfaces
   *  in the PR body's Contributors section as bold plain text with
   *  NO `@` prefix (it isn't a GitHub handle). Ignored when
   *  `contributorLogin` is non-null. */
  readonly anonymousNickname?: string;
  readonly extraFiles?: readonly ExtraFile[];
  /**
   * When set, skip the "create branch + open PR" steps and append a
   * commit to this existing PR's head branch instead. Powers the
   * resume-editing flow (ADR-016 deferred → done): a contributor with
   * an in-flight PR for this entity keeps editing on that same PR
   * rather than opening N parallel PRs on the same file.
   *
   * The caller has already verified the PR is open + owned by the
   * current session (via `findOpenPRForEntity`); this function trusts
   * that check and doesn't re-validate. If the branch has been deleted
   * upstream between the lookup and the write, GitHub returns 404 on
   * the writeFile call and the dashboard surfaces the failure.
   */
  readonly existingPR?: {
    readonly number: number;
    readonly htmlUrl: string;
    readonly headBranch: string;
  };
};

function safeBranchSegment(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

/**
 * Commit subject only — no body, no trailer. ADR-016: the bot is the
 * sole listed commit author; the human contributor is named once in
 * the PR body (Contributors section) rather than smeared across every
 * commit trailer. Keeps `git log` clean and review attribution clear.
 */
function commitMessage(subject: string): string {
  return `${subject}\n`;
}

export async function submitEntityEdit(
  octokit: Octokit,
  config: GitHubAppConfig,
  request: SaveRequest,
): Promise<OpenedPR & { reused: boolean; }> {
  // Resume-editing branch: skip ALL the branch/PR scaffolding and
  // append commits to the existing PR's head branch. The optimistic-
  // lock check still runs — but against the branch's tip, not main —
  // so a parallel push to the same branch from another tab is caught.
  if (request.existingPR !== undefined) {
    const branch = request.existingPR.headBranch;
    const onBranch = await getFile(octokit, config, request.path, branch);
    if (onBranch !== null && request.expectedSha !== null && onBranch.sha !== request.expectedSha) {
      throw new OptimisticLockError(request.path, request.expectedSha, onBranch.sha);
    }
    await writeFile(
      octokit,
      config,
      branch,
      request.path,
      request.newContent,
      onBranch?.sha ?? null,
      commitMessage(`Edit ${request.entityId}`),
    );
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
        commitMessage(`Update ${file.path}`),
      );
    }
    return {
      number: request.existingPR.number,
      htmlUrl: request.existingPR.htmlUrl,
      headBranch: branch,
      reused: true,
    };
  }

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
    commitMessage(`Edit ${request.entityId}`),
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
      commitMessage(`Update ${file.path}`),
    );
    extraPaths.push(file.path);
  }

  const fileLines = [request.path, ...extraPaths].map((p) => `- \`${p}\``);
  const anonymous = request.contributorLogin === null;
  const nickname = request.anonymousNickname?.trim() ?? '';

  // Contributors section — single source of attribution. We always
  // emit exactly one bullet so a future "resume editing" flow that
  // adds commits to an existing PR doesn't accidentally collect
  // duplicate names (each save reopens the PR body in full).
  const contributorBullet = anonymous
    ? (nickname !== ''
      ? `- **${nickname}** _(anonymous contributor)_`
      : `- _Anonymous contributor_`)
    : `- @${request.contributorLogin}`;

  const footer = anonymous
    ? [
      `---`,
      `_Opened anonymously through the dashboard. The contributor name_`,
      `_above is self-chosen and unverified — treat it as a label, not_`,
      `_an identity. The dashboard bot is the sole commit author._`,
    ]
    : [
      `---`,
      `_Opened through the dashboard. The dashboard bot is the sole_`,
      `_commit author; the contributor is credited only in this PR_`,
      `_body (no \`Co-authored-by\` trailers — see ADR-016)._`,
    ];

  const opened = await openPullRequest(octokit, config, {
    headBranch: branch,
    title: `Edit ${request.entityId}`,
    body: [
      `**Contributors**`,
      contributorBullet,
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
  return { ...opened, reused: false };
}
