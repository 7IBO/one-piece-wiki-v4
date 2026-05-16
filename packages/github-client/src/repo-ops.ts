/**
 * Repo-level operations on DATA_REPO. Every function expects the
 * App's installation client (see app-client.ts) — we never operate
 * as a user, so contributions are attributed to the App rather than
 * to the maintainer's personal account.
 */
import type { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './config.ts';

export type FileFetch = {
  readonly path: string;
  readonly content: string;
  readonly sha: string;
  readonly ref: string;
};

function decodeBase64(content: string): string {
  return Buffer.from(content, 'base64').toString('utf8');
}

function encodeBase64(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64');
}

/**
 * Read a file from the repo at the given ref (default: the repo's
 * default branch). Returns the raw file contents and the blob SHA —
 * the SHA is the optimistic-lock token the dashboard echoes back on
 * save.
 */
export async function getFile(
  octokit: Octokit,
  config: GitHubAppConfig,
  path: string,
  ref?: string,
): Promise<FileFetch | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.dataRepo.owner,
      repo: config.dataRepo.repo,
      path,
      ...(ref !== undefined ? { ref } : {}),
    });
    if (Array.isArray(data) || data.type !== 'file') return null;
    return {
      path: data.path,
      content: decodeBase64(data.content),
      sha: data.sha,
      ref: ref ?? '<default>',
    };
  } catch (error) {
    if ((error as { status?: number; }).status === 404) return null;
    throw error;
  }
}

/**
 * Create a branch off `fromBranch` (default branch resolved if
 * undefined). Returns the new branch name.
 */
export async function createBranch(
  octokit: Octokit,
  config: GitHubAppConfig,
  branchName: string,
  fromBranch?: string,
): Promise<string> {
  const baseBranch = fromBranch ?? (await defaultBranch(octokit, config));
  const { data: baseRef } = await octokit.git.getRef({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    ref: `heads/${baseBranch}`,
  });
  await octokit.git.createRef({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    ref: `refs/heads/${branchName}`,
    sha: baseRef.object.sha,
  });
  return branchName;
}

export async function defaultBranch(
  octokit: Octokit,
  config: GitHubAppConfig,
): Promise<string> {
  const { data } = await octokit.repos.get({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
  });
  return data.default_branch;
}

/**
 * Write file contents to a branch. If `expectedSha` is supplied, the
 * write fails when the on-disk SHA differs (optimistic lock). Pass
 * `null` for expectedSha when creating a brand-new file.
 */
export async function writeFile(
  octokit: Octokit,
  config: GitHubAppConfig,
  branch: string,
  path: string,
  content: string,
  expectedSha: string | null,
  message: string,
): Promise<{ commitSha: string; newSha: string; }> {
  const params: Parameters<typeof octokit.repos.createOrUpdateFileContents>[0] = {
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    path,
    message,
    content: encodeBase64(content),
    branch,
  };
  if (expectedSha !== null) params.sha = expectedSha;
  const { data } = await octokit.repos.createOrUpdateFileContents(params);
  return {
    commitSha: data.commit.sha ?? '',
    newSha: data.content?.sha ?? '',
  };
}

export type OpenedPR = {
  readonly number: number;
  readonly htmlUrl: string;
  readonly headBranch: string;
};

export async function openPullRequest(
  octokit: Octokit,
  config: GitHubAppConfig,
  options: {
    headBranch: string;
    baseBranch?: string;
    title: string;
    body: string;
    labels?: readonly string[];
  },
): Promise<OpenedPR> {
  const base = options.baseBranch ?? (await defaultBranch(octokit, config));
  const { data: pr } = await octokit.pulls.create({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    head: options.headBranch,
    base,
    title: options.title,
    body: options.body,
  });
  if (options.labels !== undefined && options.labels.length > 0) {
    await octokit.issues.addLabels({
      owner: config.dataRepo.owner,
      repo: config.dataRepo.repo,
      issue_number: pr.number,
      labels: [...options.labels],
    });
  }
  return {
    number: pr.number,
    htmlUrl: pr.html_url,
    headBranch: options.headBranch,
  };
}

/**
 * Read a PR's metadata + file list. Used by the admin moderation
 * flow to enumerate what's about to be merged (touched paths, head
 * branch, head sha) so the dashboard can compute its own structured
 * diff + image staging set before approval.
 */
export type PullRequestDetail = {
  readonly number: number;
  readonly headBranch: string;
  readonly headSha: string;
  readonly baseBranch: string;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
  readonly merged: boolean;
  readonly authorLogin: string;
  readonly files: readonly { path: string; status: string; }[];
};

export async function getPullRequest(
  octokit: Octokit,
  config: GitHubAppConfig,
  prNumber: number,
): Promise<PullRequestDetail> {
  const { data: pr } = await octokit.pulls.get({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    pull_number: prNumber,
  });
  const { data: files } = await octokit.pulls.listFiles({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    pull_number: prNumber,
    per_page: 300,
  });
  return {
    number: pr.number,
    headBranch: pr.head.ref,
    headSha: pr.head.sha,
    baseBranch: pr.base.ref,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.state === 'closed' ? 'closed' : 'open',
    merged: pr.merged ?? false,
    authorLogin: pr.user?.login ?? '',
    files: files.map((f) => ({ path: f.filename, status: f.status })),
  };
}

/**
 * Squash-merge a PR. Used by the dashboard's admin approve flow
 * AFTER the staged images have been promoted + the URLs rewritten
 * on the PR branch — so the merged commit on `main` never contains
 * a `staging://` URL.
 */
export async function mergePullRequest(
  octokit: Octokit,
  config: GitHubAppConfig,
  prNumber: number,
  options: { title?: string; message?: string; } = {},
): Promise<{ merged: boolean; sha: string; }> {
  const { data } = await octokit.pulls.merge({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    pull_number: prNumber,
    merge_method: 'squash',
    ...(options.title !== undefined ? { commit_title: options.title } : {}),
    ...(options.message !== undefined ? { commit_message: options.message } : {}),
  });
  return { merged: data.merged, sha: data.sha };
}

/**
 * Close a PR without merging. Used by the admin "Reject" flow; the
 * caller is responsible for cleaning up any staged R2 objects the
 * PR introduced (the R2 lifecycle rule on `pending/` is the safety
 * net for missed deletes).
 */
export async function closePullRequest(
  octokit: Octokit,
  config: GitHubAppConfig,
  prNumber: number,
): Promise<void> {
  await octokit.pulls.update({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    pull_number: prNumber,
    state: 'closed',
  });
}

export class OptimisticLockError extends Error {
  override readonly name = 'OptimisticLockError';
  constructor(
    readonly path: string,
    readonly expectedSha: string,
    readonly currentSha: string,
  ) {
    super(
      `Optimistic lock failed on ${path}: expected sha ${expectedSha}, current sha ${currentSha}.`,
    );
  }
}
