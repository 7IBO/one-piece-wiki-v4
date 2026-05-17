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
import { createPatch } from 'diff';
import type { GitHubAppConfig } from './config.ts';
import {
  commitMultipleFiles,
  createBranch,
  type FileChange,
  getFile,
  type OpenedPR,
  openPullRequest,
  OptimisticLockError,
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
  /**
   * Whether this save is creating a brand-new entity file vs editing
   * an existing one. Defaults to `'edit'`. Drives:
   *  - PR title verb: `Create` vs `Edit`
   *  - Extra label `new-entity` when `'create'`
   *  - Commit-subject verb (same word as the PR title)
   *
   * See ADR-020. The actual save mechanics are identical — the Git
   * Data API path already handles missing files; this flag is purely
   * for human-facing labelling.
   */
  readonly verb?: 'create' | 'edit';
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
): Promise<OpenedPR & { reused: boolean; noOp: boolean; }> {
  // The entity file + every translation file land in ONE commit per
  // save (Git Data API in `commitMultipleFiles`). Two reasons:
  //   - cleaner PR log — one save = one commit, not N
  //   - lets us skip the commit entirely when the resolved content
  //     for every file matches what the branch already has (so a
  //     "save with no actual change" doesn't pollute the PR with
  //     empty commits; GitHub's createOrUpdateFileContents API
  //     creates a commit regardless of dedup).
  const allFiles: { path: string; content: string; }[] = [
    { path: request.path, content: request.newContent },
    ...(request.extraFiles ?? []).map((f) => ({ path: f.path, content: f.content })),
  ];
  // Title verb capitalisation — `Create character:luffy` vs
  // `Edit character:luffy`. Default to `edit` so every caller that
  // doesn't pass `verb` keeps the historical phrasing.
  const verb = request.verb ?? 'edit';
  const verbTitle = verb === 'create' ? 'Create' : 'Edit';

  // Resume-editing branch: skip ALL branch/PR scaffolding, append
  // one commit (or zero, if no-op) to the existing PR's head branch.
  // The optimistic-lock check still runs against the branch's tip
  // so a parallel push from another tab is caught.
  if (request.existingPR !== undefined) {
    const branch = request.existingPR.headBranch;
    const onBranch = await getFile(octokit, config, request.path, branch);
    if (onBranch !== null && request.expectedSha !== null && onBranch.sha !== request.expectedSha) {
      throw new OptimisticLockError(request.path, request.expectedSha, onBranch.sha);
    }
    // Resume always says "Edit" — by the time a contributor's adding
    // commits to an existing PR, the entity exists on that branch
    // even if the PR was originally a Create.
    const result = await commitMultipleFiles(octokit, config, {
      branch,
      message: commitMessage(`Edit ${request.entityId}`),
      files: allFiles,
    });
    return {
      number: request.existingPR.number,
      htmlUrl: request.existingPR.htmlUrl,
      headBranch: branch,
      reused: true,
      noOp: !result.created,
    };
  }

  const current = await getFile(octokit, config, request.path);
  if (current !== null) {
    if (request.expectedSha !== null && current.sha !== request.expectedSha) {
      throw new OptimisticLockError(request.path, request.expectedSha, current.sha);
    }
  }

  // Same no-op short-circuit for the fresh-PR path: if the proposed
  // entity content matches main AND no translations changed, don't
  // bother creating a branch or PR.
  if (current !== null && current.content === request.newContent) {
    const allTranslationsUnchanged = await allMatchBranch(
      octokit,
      config,
      // base branch (main) is the reference here — there's no branch
      // yet because we're about to create one.
      null,
      request.extraFiles ?? [],
    );
    if (allTranslationsUnchanged) {
      // Synthesise a "no PR opened" return without actually opening
      // one. Callers branch on `noOp` to pick the right toast.
      return {
        number: 0,
        htmlUrl: '',
        headBranch: '',
        reused: false,
        noOp: true,
      };
    }
  }

  const ts = new Date().toISOString().replace(/[:.TZ]/g, '').slice(0, 14);
  // Branch prefix matches the verb so `git branch --list` reads
  // naturally (`create/character-luffy/…` vs `edit/character-buggy/…`).
  const branchPrefix = verb === 'create' ? 'create' : 'edit';
  const branch = `${branchPrefix}/${safeBranchSegment(request.entityId)}/${ts}`;
  await createBranch(octokit, config, branch);

  const commit = await commitMultipleFiles(octokit, config, {
    branch,
    message: commitMessage(`${verbTitle} ${request.entityId}`),
    files: allFiles,
  });

  const extraPaths = (request.extraFiles ?? []).map((f) => f.path);
  const fileLines = [request.path, ...extraPaths].map((p) => `- \`${p}\``);
  const anonymous = request.contributorLogin === null;
  const nickname = request.anonymousNickname?.trim() ?? '';
  const diffBlock = renderDiffBlock(commit.changes);

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
    // Always `[DATA]` — the dashboard's save-flow only writes JSON
    // under `/data/` (entity files + translations). Code/infra PRs
    // are opened manually and get tagged by the `pr-area-label`
    // workflow instead. Keeping the prefix hard-coded here makes
    // that contract explicit: if a future feature ever wants this
    // flow to commit code, the prefix must be revisited.
    title: `[DATA] ${verbTitle} ${request.entityId}`,
    body: [
      `**Contributors**`,
      contributorBullet,
      ``,
      `**Entity:** \`${request.entityId}\``,
      ``,
      `**Files changed:**`,
      ...fileLines,
      ``,
      ...(diffBlock !== null ? [diffBlock, ``] : []),
      ...footer,
    ].join('\n'),
    labels: [
      // `edit` is kept as a coarse "this PR came from the editor"
      // marker for both create + edit flows. `new-entity` adds the
      // finer-grained distinction for create.
      'edit',
      'via-dashboard',
      'area:data',
      ...(verb === 'create' ? ['new-entity'] : []),
      ...(anonymous ? ['anonymous'] : []),
    ],
  });
  return { ...opened, reused: false, noOp: false };
}

/**
 * Plural version of `OptimisticLockError` for the bulk cast-edit
 * flow (ADR-021). When N entity files are being updated at once and
 * any of their SHAs have moved on `main` since the snapshot was
 * built, we want the caller to see ALL conflicting paths at once
 * rather than fail-fast on the first mismatch — the UI then prompts
 * "refresh the cast page" instead of "retry-loop one file at a time".
 */
export class MultiFileLockError extends Error {
  override readonly name = 'MultiFileLockError';
  constructor(readonly conflicts: readonly { path: string; expected: string; current: string; }[]) {
    super(
      `Optimistic lock failed on ${conflicts.length} file(s): ${
        conflicts.map((c) => c.path).join(', ')
      }`,
    );
  }
}

export type CastFile = {
  readonly path: string;
  readonly content: string;
  /** SHA the contributor's snapshot was built from. Null when the
   *  contributor's snapshot didn't have this file (rare — would mean
   *  they're adding a relation to an entity that itself was created
   *  after their page load). */
  readonly expectedSha: string | null;
};

export type SourceCastRequest = {
  /** The source entity that owns the cast change (e.g. `manga-chapter:1`).
   *  Drives the PR title, the branch name, and the commit subject. */
  readonly sourceId: string;
  readonly files: readonly CastFile[];
  /** Same contributor attribution as `SaveRequest`. */
  readonly contributorLogin: string | null;
  readonly contributorId: number | null;
  readonly anonymousNickname?: string;
};

/**
 * Bulk cast-of-a-source edit — ADR-021. Touches N entity files in
 * ONE commit and ONE PR titled by the source rather than the file
 * owners. Used by the per-source cast manager at
 * `/sources/$type/$slug`: a contributor adds/removes M characters
 * from a chapter, the server patches each character's `relations[]`
 * to add/remove the `appears-in` to that chapter, and this function
 * lands the whole bundle as one reviewable unit.
 *
 * Optimistic locking is per-file and plural — any SHA mismatch
 * collects into a `MultiFileLockError` listing every conflicting
 * path, so the UI surfaces "5 files conflicted, refresh" instead
 * of looping one-at-a-time.
 *
 * No `existingPR` / resume path in v1 — apparitions edits are
 * typically one-shot. Documented as deferred in ADR-021.
 */
export async function submitSourceCastEdit(
  octokit: Octokit,
  config: GitHubAppConfig,
  request: SourceCastRequest,
): Promise<OpenedPR & { noOp: boolean; }> {
  if (request.files.length === 0) {
    return { number: 0, htmlUrl: '', headBranch: '', noOp: true };
  }

  // Pre-check every file's SHA against main. Collect ALL conflicts
  // before throwing — the UI wants a complete list, not the first
  // hit.
  const conflicts: { path: string; expected: string; current: string; }[] = [];
  for (const file of request.files) {
    if (file.expectedSha === null) continue;
    // eslint-disable-next-line no-await-in-loop
    const onMain = await getFile(octokit, config, file.path);
    if (onMain === null) continue; // file gone — treated as "create" by commitMultipleFiles
    if (onMain.sha !== file.expectedSha) {
      conflicts.push({ path: file.path, expected: file.expectedSha, current: onMain.sha });
    }
  }
  if (conflicts.length > 0) throw new MultiFileLockError(conflicts);

  const ts = new Date().toISOString().replace(/[:.TZ]/g, '').slice(0, 14);
  const branch = `cast/${safeBranchSegment(request.sourceId)}/${ts}`;
  await createBranch(octokit, config, branch);

  const commit = await commitMultipleFiles(octokit, config, {
    branch,
    message: commitMessage(`Update cast of ${request.sourceId}`),
    files: request.files.map((f) => ({ path: f.path, content: f.content })),
  });

  // Every file already matched main? commitMultipleFiles short-circuited
  // and we have a branch pointing at the base. Skip opening a PR.
  if (!commit.created) {
    return { number: 0, htmlUrl: '', headBranch: branch, noOp: true };
  }

  const anonymous = request.contributorLogin === null;
  const nickname = request.anonymousNickname?.trim() ?? '';
  const diffBlock = renderDiffBlock(commit.changes);
  const contributorBullet = anonymous
    ? (nickname !== ''
      ? `- **${nickname}** _(anonymous contributor)_`
      : `- _Anonymous contributor_`)
    : `- @${request.contributorLogin}`;

  const fileLines = request.files.map((f) => `- \`${f.path}\``);

  const opened = await openPullRequest(octokit, config, {
    headBranch: branch,
    title: `[DATA] Update cast of ${request.sourceId}`,
    body: [
      `**Contributors**`,
      contributorBullet,
      ``,
      `**Source:** \`${request.sourceId}\``,
      ``,
      `**Files changed (${request.files.length}):**`,
      ...fileLines,
      ``,
      ...(diffBlock !== null ? [diffBlock, ``] : []),
      `---`,
      `_Cast change opened through the dashboard's per-source apparitions_`,
      `_manager. One commit, one PR, N entity files — see ADR-021._`,
    ].join('\n'),
    labels: [
      'edit',
      'via-dashboard',
      'area:data',
      // `apparitions` is the discriminator that lets review tooling
      // tell a cast bulk-edit from a single-entity edit.
      'apparitions',
      ...(anonymous ? ['anonymous'] : []),
    ],
  });
  return { ...opened, noOp: false };
}

/**
 * Render a per-file unified diff block as Markdown, each file inside
 * its own GitHub-native `<details>` collapse. Goes into the PR body
 * so a reviewer scrolling the PR sees the actual content delta
 * without having to flip to the Files tab.
 *
 * Per-file safeguards:
 *  - Truncate any single patch at MAX_PATCH_CHARS so a giant
 *    translation file doesn't blow the PR body's 65k char limit.
 *  - Skip files whose patch comes out empty (defensive — shouldn't
 *    happen since `commitMultipleFiles` already dropped no-ops).
 *  - Wrap each patch in a ```diff fence so GitHub colours added /
 *    removed lines.
 *
 * Returns `null` when there's nothing to render (no changes / all
 * truncated to empty) so the caller can skip the section entirely.
 */
const MAX_PATCH_CHARS = 12_000;
function renderDiffBlock(changes: readonly FileChange[]): string | null {
  if (changes.length === 0) return null;
  const blocks: string[] = ['**Changes**', ''];
  for (const change of changes) {
    const before = change.before ?? '';
    const patch = createPatch(
      change.path,
      before,
      change.after,
      change.status === 'added' ? '(new file)' : 'before',
      'after',
      { context: 3 },
    );
    if (patch.trim() === '') continue;
    const truncated = patch.length > MAX_PATCH_CHARS;
    const body = truncated
      ? `${patch.slice(0, MAX_PATCH_CHARS)}\n… (truncated — see the Files tab for full diff)`
      : patch;
    // `open` on the first <details> so the reviewer doesn't have
    // to click to see the typical "one entity, one translation"
    // pair; subsequent files start collapsed to keep the PR body
    // scrollable.
    const isFirst = blocks.length === 2;
    const summary = change.status === 'added'
      ? `\`${change.path}\` _(new)_`
      : `\`${change.path}\``;
    blocks.push(
      `<details${isFirst ? ' open' : ''}>`,
      `<summary>${summary}</summary>`,
      ``,
      '```diff',
      body,
      '```',
      `</details>`,
      ``,
    );
  }
  // If every block got skipped (all patches empty after the loop)
  // there's no real content to render — only the heading. Drop it.
  if (blocks.length <= 2) return null;
  return blocks.join('\n').trimEnd();
}

/**
 * True if every (path, content) in `files` matches what's already at
 * `path` on `branch` (or on the default branch when `branch` is null
 * — used for the "should we even open a PR" pre-check).
 */
async function allMatchBranch(
  octokit: Octokit,
  config: GitHubAppConfig,
  branch: string | null,
  files: readonly ExtraFile[],
): Promise<boolean> {
  if (files.length === 0) return true;
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await getFile(octokit, config, file.path, branch ?? undefined);
    if (existing === null) return false;
    if (existing.content !== file.content) return false;
  }
  return true;
}
