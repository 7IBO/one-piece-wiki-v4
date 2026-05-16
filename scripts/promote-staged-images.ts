#!/usr/bin/env bun
/**
 * Workflow companion for `.github/workflows/promote-images.yml`.
 *
 * Run on push to main. Walks the diff between BASE_SHA and HEAD_SHA
 * looking for `staging://pending/<key>` URLs introduced in entity
 * JSON, then for each one:
 *
 *  1. S3-copies `pending/<key>` → `images/<key>` on R2.
 *  2. Rewrites the URL in the entity file from
 *     `staging://pending/<key>` to
 *     `${R2_PUBLIC_BASE_URL}/images/<key>`.
 *  3. Best-effort deletes the `pending/` source.
 *
 * Idempotent — running twice on the same diff is a no-op (rewritten
 * files no longer contain `staging://` URLs; missing pending/ source
 * objects are tolerated).
 *
 * Outputs the rewrites to the worktree; the workflow opens a commit
 * if anything changed.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_BASE_URL, BASE_SHA, HEAD_SHA
 */
import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredEnv = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
  'BASE_SHA',
  'HEAD_SHA',
] as const;
for (const k of requiredEnv) {
  if (process.env[k] === undefined || process.env[k] === '') {
    process.stderr.write(`Missing required env var: ${k}\n`);
    process.exit(1);
  }
}

const accountId = process.env['R2_ACCOUNT_ID']!;
const bucket = process.env['R2_BUCKET']!;
const publicBaseUrl = process.env['R2_PUBLIC_BASE_URL']!.replace(/\/+$/, '');
const baseSha = process.env['BASE_SHA']!;
const headSha = process.env['HEAD_SHA']!;

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
  },
});

/**
 * Files touched between BASE_SHA and HEAD_SHA in the entity image
 * directory. `git diff --diff-filter=AM` keeps Added + Modified
 * (we don't care about deletions — a removed image file can't
 * carry a staging URL we need to rewrite).
 */
function changedImageFiles(): readonly string[] {
  const r = spawnSync(
    'git',
    [
      'diff',
      '--name-only',
      '--diff-filter=AM',
      baseSha,
      headSha,
      '--',
      'data/universes/**/entities/image/**',
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    process.stderr.write(`git diff failed: ${r.stderr}\n`);
    process.exit(1);
  }
  return r.stdout.split(/\r?\n/).filter((l) => l !== '');
}

const STAGING_RE = /staging:\/\/(pending\/[A-Za-z0-9._\-/]+)/g;

let promoted = 0;
let rewrites = 0;
let copyFailures = 0;

for (const relPath of changedImageFiles()) {
  const path = resolve(process.cwd(), relPath);
  let text: string;
  try {
    // eslint-disable-next-line no-await-in-loop
    text = await readFile(path, 'utf8');
  } catch {
    continue;
  }

  // Collect every distinct staging key referenced in this file.
  const keys = new Set<string>();
  for (const m of text.matchAll(STAGING_RE)) keys.add(m[1]!);
  if (keys.size === 0) continue;

  // Copy + delete each key; collect the URL rewrites.
  const replacements = new Map<string, string>();
  for (const stagingKey of keys) {
    const publicKey = stagingKey.replace(/^pending\//, 'images/');
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${stagingKey}`,
          Key: publicKey,
        }),
      );
      promoted += 1;
      process.stdout.write(`  copied ${stagingKey} → ${publicKey}\n`);
    } catch (err) {
      copyFailures += 1;
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `  copy ${stagingKey} → ${publicKey} FAILED: ${message}\n`,
      );
      // Skip the URL rewrite so the next workflow run can retry.
      continue;
    }
    // Best-effort delete of the source — the lifecycle rule on
    // pending/ is the safety net.
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: stagingKey }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  delete ${stagingKey} non-fatal: ${message}\n`);
    }
    replacements.set(`staging://${stagingKey}`, `${publicBaseUrl}/${publicKey}`);
  }

  if (replacements.size === 0) continue;
  let rewritten = text;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }
  // eslint-disable-next-line no-await-in-loop
  await writeFile(path, rewritten, 'utf8');
  rewrites += replacements.size;
}

process.stdout.write(
  `\nDone: ${promoted} object(s) promoted, ${rewrites} URL(s) rewritten`
    + (copyFailures > 0 ? `, ${copyFailures} copy failure(s)` : '')
    + `.\n`,
);
process.exit(copyFailures > 0 ? 1 : 0);
