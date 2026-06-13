/**
 * Admin "approve & merge" flow for PRs containing staged images.
 *
 * Per ADR-015 (revised) the promotion is dashboard-driven, not
 * workflow-driven: when the admin clicks Approve in the queue UI,
 * this module:
 *
 *  1. Pulls the PR + its changed files.
 *  2. Reads every changed image entity from the head branch and
 *     extracts the `staging://pending/<key>` references.
 *  3. S3-copies each `pending/<key>` to `images/<key>` on R2.
 *  4. Pushes a single commit on the PR head branch that rewrites
 *     `staging://...` URLs in those files to the canonical
 *     `${R2_PUBLIC_BASE_URL}/<key>` URLs.
 *  5. Squash-merges the PR.
 *  6. Best-effort deletes the now-redundant `pending/` source
 *     objects. The R2 lifecycle rule (auto-purge > 14 days) is
 *     the safety net.
 *
 * "Reject" flow (separate function): close the PR + best-effort
 * delete the staged sources.
 *
 * The build guard in `packages/schema-engine/src/cli/validate.ts`
 * catches any leftover `staging://` URL — so even if the admin
 * forgets to use the dashboard and merges manually on GitHub, CI
 * fails before bad data reaches `main`.
 */
// AWS SDK is loaded lazily — see r2.ts for the rationale. Promote
// + reject endpoints are admin-only and rare, so paying the import
// cost on first invocation is the right tradeoff.
import type { S3Client } from '@aws-sdk/client-s3';

type AdminSdk = {
  S3Client: typeof import('@aws-sdk/client-s3').S3Client;
  CopyObjectCommand: typeof import('@aws-sdk/client-s3').CopyObjectCommand;
  DeleteObjectCommand: typeof import('@aws-sdk/client-s3').DeleteObjectCommand;
};
let adminSdkCache: AdminSdk | null = null;
async function loadAdminSdk(): Promise<AdminSdk> {
  if (adminSdkCache !== null) return adminSdkCache;
  const s3 = await import('@aws-sdk/client-s3');
  adminSdkCache = {
    S3Client: s3.S3Client,
    CopyObjectCommand: s3.CopyObjectCommand,
    DeleteObjectCommand: s3.DeleteObjectCommand,
  };
  return adminSdkCache;
}
import {
  closePullRequest,
  getFile,
  getPullRequest,
  type GitHubAppConfig,
  mergePullRequest,
  type Octokit,
  writeFile,
} from '@onepiece-wiki/github-client';
import { parseStagingUrl, publicKeyFor, type R2Config } from './r2.ts';

async function r2Client(cfg: R2Config): Promise<S3Client> {
  const sdk = await loadAdminSdk();
  return new sdk.S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

const STAGING_RE = /staging:\/\/(pending\/[A-Za-z0-9._\-/]+)/g;

export type PromoteOutcome = {
  readonly prNumber: number;
  readonly mergedSha: string;
  readonly promoted: readonly { stagingKey: string; publicKey: string; }[];
  readonly rewrittenPaths: readonly string[];
};

/**
 * End-to-end "approve a PR carrying staged images" operation.
 *
 * Throws on any failure that would leave the PR in a broken state
 * (failed copy, failed rewrite). Best-effort deletes are swallowed
 * with a stderr log.
 */
export async function promoteAndMergePR(args: {
  octokit: Octokit;
  cfg: GitHubAppConfig;
  r2: R2Config;
  prNumber: number;
  /** GitHub login of the admin who approved — used in the rewrite
   *  commit message + Co-authored-by trailer. */
  approverLogin: string;
}): Promise<PromoteOutcome> {
  const pr = await getPullRequest(args.octokit, args.cfg, args.prNumber);
  if (pr.state !== 'open') {
    throw new Error(`PR #${args.prNumber} is not open (state=${pr.state}).`);
  }
  if (pr.merged) {
    throw new Error(`PR #${args.prNumber} is already merged.`);
  }

  // Only image entity files can carry staging URLs by convention;
  // narrow the scan to those so we don't pay for every changed
  // JSON file in a large PR.
  const imageFiles = pr.files.filter((f) =>
    /\/data\/universes\/[^/]+\/entities\/image\//.test(f.path)
    && (f.status === 'added' || f.status === 'modified')
  );

  // Pull the latest content of each image file from the head branch.
  // (PRs in flux: don't trust the snapshot at PR-open time.)
  const fileContents = new Map<string, { content: string; sha: string; }>();
  for (const f of imageFiles) {
    // eslint-disable-next-line no-await-in-loop
    const fetched = await getFile(args.octokit, args.cfg, f.path, pr.headBranch);
    if (fetched === null) continue;
    fileContents.set(f.path, { content: fetched.content, sha: fetched.sha });
  }

  // Collect every distinct staging key referenced across these
  // files. A single key may appear in multiple files (image reused
  // across entities — but image entities each have their own URL,
  // so in practice this is one-key-per-file; the de-duplication is
  // defensive).
  const stagingKeys = new Set<string>();
  for (const { content } of fileContents.values()) {
    for (const m of content.matchAll(STAGING_RE)) stagingKeys.add(m[1]!);
  }

  // Copy pending/* → images/* on R2 BEFORE rewriting the JSON. If
  // any copy fails we throw and the rewrites + merge don't happen.
  const sdk = await loadAdminSdk();
  const s3 = await r2Client(args.r2);
  const promoted: { stagingKey: string; publicKey: string; }[] = [];
  for (const stagingKey of stagingKeys) {
    const publicKey = publicKeyFor(stagingKey);
    if (publicKey === stagingKey) continue; // not under pending/
    // eslint-disable-next-line no-await-in-loop
    await s3.send(
      new sdk.CopyObjectCommand({
        Bucket: args.r2.bucket,
        CopySource: `${args.r2.bucket}/${stagingKey}`,
        Key: publicKey,
      }),
    );
    promoted.push({ stagingKey, publicKey });
  }

  // Compute + push the URL rewrites. One commit on the PR head
  // branch per touched file (createOrUpdateFileContents constraints).
  const rewrittenPaths: string[] = [];
  for (const [path, file] of fileContents) {
    let rewritten = file.content;
    for (const { stagingKey, publicKey } of promoted) {
      const from = `staging://${stagingKey}`;
      const to = `${args.r2.publicBaseUrl}/${publicKey}`;
      if (rewritten.includes(from)) {
        rewritten = rewritten.split(from).join(to);
      }
    }
    if (rewritten === file.content) continue;
    // eslint-disable-next-line no-await-in-loop
    await writeFile(
      args.octokit,
      args.cfg,
      pr.headBranch,
      path,
      rewritten,
      file.sha,
      `chore(images): promote staged uploads for PR #${args.prNumber}\n\n`
        + `Co-authored-by: ${args.approverLogin} ${args.approverLogin}@users.noreply.github.com`,
    );
    rewrittenPaths.push(path);
  }

  // All cleaned up — merge.
  const merge = await mergePullRequest(args.octokit, args.cfg, args.prNumber, {
    title: pr.title,
    message: `Approved by @${args.approverLogin} via dashboard admin queue.`,
  });
  if (!merge.merged) {
    throw new Error(`Merge call returned merged=false for PR #${args.prNumber}.`);
  }

  // Best-effort cleanup of the now-redundant pending/ source objects.
  // R2 lifecycle (14d) is the safety net if any delete fails.
  for (const { stagingKey } of promoted) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await s3.send(new sdk.DeleteObjectCommand({ Bucket: args.r2.bucket, Key: stagingKey }));
    } catch (err) {
      process.stderr.write(
        `[admin-promote] non-fatal: failed to delete ${stagingKey}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }

  return {
    prNumber: args.prNumber,
    mergedSha: merge.sha,
    promoted,
    rewrittenPaths,
  };
}

/**
 * "Reject" flow: close the PR + delete any staged R2 objects it
 * introduced. The lifecycle rule on `pending/` is the safety net
 * for any source we miss (e.g. concurrent edits, races).
 */
export async function rejectAndCleanupPR(args: {
  octokit: Octokit;
  cfg: GitHubAppConfig;
  r2: R2Config;
  prNumber: number;
}): Promise<{ closed: true; deletedKeys: readonly string[]; }> {
  const pr = await getPullRequest(args.octokit, args.cfg, args.prNumber);
  if (pr.state !== 'open') {
    throw new Error(`PR #${args.prNumber} is not open (state=${pr.state}).`);
  }
  const imageFiles = pr.files.filter((f) =>
    /\/data\/universes\/[^/]+\/entities\/image\//.test(f.path)
  );
  const stagingKeys = new Set<string>();
  for (const f of imageFiles) {
    // eslint-disable-next-line no-await-in-loop
    const fetched = await getFile(args.octokit, args.cfg, f.path, pr.headBranch);
    if (fetched === null) continue;
    for (const m of fetched.content.matchAll(STAGING_RE)) {
      const key = parseStagingUrl(`staging://${m[1]!}`);
      if (key !== null) stagingKeys.add(key);
    }
  }

  await closePullRequest(args.octokit, args.cfg, args.prNumber);

  const sdk = await loadAdminSdk();
  const s3 = await r2Client(args.r2);
  const deletedKeys: string[] = [];
  for (const key of stagingKeys) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await s3.send(new sdk.DeleteObjectCommand({ Bucket: args.r2.bucket, Key: key }));
      deletedKeys.push(key);
    } catch (err) {
      process.stderr.write(
        `[admin-reject] non-fatal: failed to delete ${key}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }
  return { closed: true, deletedKeys };
}
