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

/**
 * One open contribution surfaced on the dashboard's "Vos contributions
 * en cours" section. We deliberately keep the shape tiny — the dashboard
 * fetches the per-entity payload on click rather than up-front.
 */
export type OpenContribution = {
  readonly prNumber: number;
  readonly htmlUrl: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly headBranch: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly entitySlug: string;
};

/**
 * Find open PRs opened by a specific dashboard contributor. The match
 * is body-substring based because the PR body is the only canonical
 * place we record the contributor (no Co-authored-by trailer per
 * ADR-016). Two flavours:
 *
 *   - GitHub login → searches for `\n- @login` (the Contributors
 *     bullet authored by `save-flow.ts`)
 *   - Anonymous nickname → searches for `\n- **Nickname**` (the
 *     bolded plain-text bullet, NO `@`)
 *
 * Returns at most `limit` PRs ordered by `updated_at` descending. The
 * GitHub search index can lag a few seconds behind a fresh PR open —
 * that's acceptable for a "your recent contributions" panel.
 */
export async function listOpenContributions(
  octokit: Octokit,
  config: GitHubAppConfig,
  identity:
    | { kind: 'github'; login: string; }
    | { kind: 'anonymous'; nickname: string; },
  limit = 20,
): Promise<readonly OpenContribution[]> {
  const repoQ = `repo:${config.dataRepo.owner}/${config.dataRepo.repo}`;
  // The bullet is unique enough on its own; the `label:` qualifier
  // narrows the result set so we don't pay for matches on bodies
  // that happen to contain the login by coincidence (e.g. someone
  // mentioned by a reviewer in a comment-style PR body).
  const query = identity.kind === 'github'
    ? `${repoQ} is:pr is:open label:via-dashboard "- @${identity.login}"`
    : `${repoQ} is:pr is:open label:anonymous "**${identity.nickname}**"`;

  const { data } = await octokit.search.issuesAndPullRequests({
    q: query,
    per_page: Math.min(limit, 50),
    sort: 'updated',
    order: 'desc',
  });

  // Each PR title is `Edit <entityId>` (see save-flow.ts); we parse
  // it to recover the entity coordinates without an extra round-trip
  // per PR. Items that don't match the title pattern are skipped —
  // they were opened outside the dashboard's normal flow.
  const out: OpenContribution[] = [];
  for (const item of data.items) {
    const title = item.title ?? '';
    const match = /^Edit ([a-z0-9-]+):([a-z0-9-]+)$/.exec(title);
    if (match === null) continue;
    const [, entityType = '', entitySlug = ''] = match;
    if (entityType === '' || entitySlug === '') continue;

    // The search API returns Issues, not PRs — `pull_request.html_url`
    // is the only canonical PR URL on that payload shape, and the
    // head branch isn't included. Skip the second round-trip for now;
    // callers that need the head branch can call `getPullRequest()`
    // on click (the resume-editing flow does exactly that).
    out.push({
      prNumber: item.number,
      htmlUrl: item.pull_request?.html_url ?? item.html_url,
      title: title,
      updatedAt: item.updated_at,
      headBranch: '',
      entityId: `${entityType}:${entitySlug}`,
      entityType,
      entitySlug,
    });
  }
  return out;
}

/**
 * Find a single open PR opened by `identity` that targets `entityId`,
 * if any. Powers the "resume editing" flow: when a contributor revisits
 * an entity they already have a PR open for, reads load from the PR
 * branch and writes append commits to the same branch (rather than
 * opening a parallel PR — see ADR-016 deferred, ADR-017).
 *
 * Returns `null` when no such PR exists. Returns the most recently
 * updated PR if more than one matches (shouldn't normally happen, but
 * resilient to legacy PRs from before resume-editing landed).
 */
export async function findOpenPRForEntity(
  octokit: Octokit,
  config: GitHubAppConfig,
  identity:
    | { kind: 'github'; login: string; }
    | { kind: 'anonymous'; nickname: string; },
  entityId: string,
): Promise<PullRequestDetail | null> {
  const repoQ = `repo:${config.dataRepo.owner}/${config.dataRepo.repo}`;
  // Title carries the entity id verbatim (`Edit type:slug` per
  // save-flow). Title search is more selective than body substring
  // and avoids the bullet-format coupling we use in
  // `listOpenContributions` — a contributor with several open PRs
  // can be probed entity-by-entity without filtering client-side.
  const contribTerm = identity.kind === 'github'
    ? `"- @${identity.login}"`
    : `"**${identity.nickname}**"`;
  const labelTerm = identity.kind === 'github' ? 'label:via-dashboard' : 'label:anonymous';
  const titleTerm = `"Edit ${entityId}" in:title`;
  const query = `${repoQ} is:pr is:open ${labelTerm} ${contribTerm} ${titleTerm}`;

  const { data } = await octokit.search.issuesAndPullRequests({
    q: query,
    per_page: 5,
    sort: 'updated',
    order: 'desc',
  });
  // Title-exact filter on the client side (GitHub's search is fuzzy
  // around punctuation; we want a strict match on the canonical form).
  const expectedTitle = `Edit ${entityId}`;
  for (const item of data.items) {
    if ((item.title ?? '') !== expectedTitle) continue;
    // Fetch the full PR to get head branch + SHA — search API only
    // returns the Issue shape.
    // eslint-disable-next-line no-await-in-loop
    const pr = await getPullRequest(octokit, config, item.number);
    if (pr.state !== 'open' || pr.merged) continue;
    return pr;
  }
  return null;
}

/**
 * Atomically commit multiple file changes in a single commit.
 *
 * Uses the Git Data API (blob → tree → commit → ref) rather than
 * `repos.createOrUpdateFileContents`, which only handles one file at
 * a time and produces one commit per call. The Data API lets us:
 *
 *  - bundle the entity JSON + N translation files in one commit per
 *    save, instead of one per file (much cleaner PR log);
 *  - skip the commit entirely when every file's content matches what
 *    the branch already has, so a "save with no actual changes"
 *    doesn't pollute the PR with empty commits.
 *
 * Steps:
 *  1. Resolve the branch tip → commit SHA → tree SHA.
 *  2. For each (path, content), check the existing blob at that path
 *     on the tree. If the content matches, skip — don't queue a
 *     change.
 *  3. If nothing changed, return `{ created: false }` and DON'T
 *     touch the branch.
 *  4. Otherwise: create one new blob per changed file, build a new
 *     tree with those blobs replacing the originals (base_tree
 *     keeps everything else), create a commit pointing at the new
 *     tree with the previous commit as parent, fast-forward the
 *     branch ref.
 *
 * GitHub's `repos.createOrUpdateFileContents` always creates a
 * commit even when the bytes are identical (it doesn't dedup). The
 * Git Data API gives us the necessary control.
 */
export type FileChange = {
  readonly path: string;
  readonly status: 'added' | 'modified';
  readonly before: string | null;
  readonly after: string;
};

export async function commitMultipleFiles(
  octokit: Octokit,
  config: GitHubAppConfig,
  options: {
    readonly branch: string;
    readonly message: string;
    readonly files: readonly { readonly path: string; readonly content: string; }[];
  },
): Promise<{
  readonly created: boolean;
  readonly commitSha?: string;
  /** Per-file before/after for every file that actually changed in
   *  this commit (excludes no-ops). Used by `submitEntityEdit` to
   *  build the PR body diff block. */
  readonly changes: readonly FileChange[];
}> {
  // 1. Branch tip.
  const { data: ref } = await octokit.git.getRef({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    ref: `heads/${options.branch}`,
  });
  const parentCommitSha = ref.object.sha;
  const { data: parentCommit } = await octokit.git.getCommit({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    commit_sha: parentCommitSha,
  });
  const baseTreeSha = parentCommit.tree.sha;

  // 2. Filter out unchanged files, capturing before/after for the
  // ones that do change.
  const changed: { path: string; content: string; }[] = [];
  const changes: FileChange[] = [];
  for (const file of options.files) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await getFile(octokit, config, file.path, options.branch);
    if (existing !== null && existing.content === file.content) continue;
    changed.push({ path: file.path, content: file.content });
    changes.push({
      path: file.path,
      status: existing === null ? 'added' : 'modified',
      before: existing?.content ?? null,
      after: file.content,
    });
  }
  if (changed.length === 0) {
    return { created: false, changes: [] };
  }

  // 3. Create one blob per changed file. Sequential so a transient
  // 5xx fails fast instead of pummeling GitHub with parallel writes.
  const blobs: { path: string; sha: string; }[] = [];
  for (const file of changed) {
    // eslint-disable-next-line no-await-in-loop
    const { data: blob } = await octokit.git.createBlob({
      owner: config.dataRepo.owner,
      repo: config.dataRepo.repo,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      encoding: 'base64',
    });
    blobs.push({ path: file.path, sha: blob.sha });
  }

  // 4. New tree on top of base_tree — only the changed blobs are
  // overridden, everything else is inherited from baseTreeSha.
  const { data: tree } = await octokit.git.createTree({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    base_tree: baseTreeSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: '100644',
      type: 'blob',
      sha: b.sha,
    })),
  });

  // 5. Commit + fast-forward ref.
  const { data: commit } = await octokit.git.createCommit({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    message: options.message,
    tree: tree.sha,
    parents: [parentCommitSha],
  });
  await octokit.git.updateRef({
    owner: config.dataRepo.owner,
    repo: config.dataRepo.repo,
    ref: `heads/${options.branch}`,
    sha: commit.sha,
  });

  return { created: true, commitSha: commit.sha, changes };
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
