#!/usr/bin/env bun
/**
 * Apply the dashboard's expected CORS policy to the R2 bucket.
 *
 * Why this exists: R2 buckets ship with NO CORS configuration, so any
 * browser-side PUT (the dashboard's image upload via presigned URLs)
 * is blocked by the SOP. The fix is one S3 `PutBucketCors` call. This
 * script does it idempotently using the same R2 credentials the
 * dashboard already loads — no clicking through the Cloudflare UI.
 *
 * Allowed origins default to:
 *  - http://localhost:4100         (dashboard dev)
 *  - http://127.0.0.1:4100         (same, IPv4 literal)
 *  - $DASHBOARD_PUBLIC_URL         (deployed origin)
 *
 * Override by passing additional origins as CLI args:
 *   bun scripts/setup-r2-cors.ts https://staging.example.com
 *
 * Required env vars (already needed by the dashboard server):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bun auto-loads .env from CWD but NOT from arbitrary workspace
// folders, and the R2 creds live in apps/dashboard/.env.local
// (alongside the rest of the dashboard's secrets). Find and merge
// that file manually so the script "just works" from the repo root.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
for (
  const candidate of [
    join(ROOT, '.env'),
    join(ROOT, '.env.local'),
    join(ROOT, 'apps/dashboard/.env'),
    join(ROOT, 'apps/dashboard/.env.local'),
  ]
) {
  if (!existsSync(candidate)) continue;
  for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m === null) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue; // existing wins
    // Strip surrounding quotes if present (matches Bun's parser).
    const raw = m[2]!;
    const value = /^"(.*)"$/.exec(raw)?.[1] ?? /^'(.*)'$/.exec(raw)?.[1] ?? raw;
    process.env[key] = value;
  }
}

const accountId = process.env['R2_ACCOUNT_ID'];
const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
const bucket = process.env['R2_BUCKET'];

const missing = Object.entries({ accountId, accessKeyId, secretAccessKey, bucket })
  .filter(([, v]) => v === undefined || v === '' || v === 'REPLACE_ME')
  .map(([k]) => k);
if (missing.length > 0) {
  process.stderr.write(`Missing required env vars: ${missing.join(', ')}\n`);
  process.exit(1);
}

const baseOrigins = [
  'http://localhost:4100',
  'http://127.0.0.1:4100',
  process.env['DASHBOARD_PUBLIC_URL'] ?? '',
].filter((o) => o !== '');

const extraOrigins = process.argv.slice(2);
const origins = [...new Set([...baseOrigins, ...extraOrigins])];

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId!}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  },
});

process.stdout.write(
  `Applying CORS to bucket "${bucket!}" for origins:\n  - ${origins.join('\n  - ')}\n\n`,
);

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket!,
      CORSConfiguration: {
        CORSRules: [
          {
            // Browser presigned-PUT uploads + later <img src=...> reads.
            AllowedOrigins: [...origins],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            // Presigned URLs add a `content-type` header, the upload
            // XHR adds checksum headers, and reads may surface `range`.
            AllowedHeaders: ['*'],
            // Lets the browser read the upload's ETag if we ever
            // inspect it after a PUT (handy for cache busting on
            // re-upload).
            ExposeHeaders: ['ETag', 'Content-Type', 'Content-Length'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  process.stdout.write('CORS applied. Upload flow should work now.\n');
} catch (err) {
  const name = (err as { name?: string; }).name ?? '';
  const status = (err as { $metadata?: { httpStatusCode?: number; }; }).$metadata?.httpStatusCode
    ?? 0;
  if (name === 'AccessDenied' || status === 403) {
    process.stderr.write(
      '\nR2 AccessDenied on PutBucketCors. Your R2 API token can sign\n'
        + 'object uploads but is NOT permitted to modify bucket settings.\n\n'
        + 'Two fixes — pick one:\n\n'
        + '  A. Create a one-shot Admin token:\n'
        + '     Cloudflare dashboard → R2 → Manage R2 API Tokens → Create.\n'
        + '     Permissions: "Admin Read & Write". Apply ONLY to this\n'
        + '     bucket. Use the new keys to re-run this script:\n'
        + '       R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \\\n'
        + '         bun run setup:r2-cors\n'
        + '     Then delete the admin token from the dashboard.\n\n'
        + '  B. Apply the CORS by hand in the UI (no extra token):\n'
        + '     Cloudflare dashboard → R2 → your bucket → Settings →\n'
        + '     CORS Policy → Add → paste the JSON from\n'
        + '     scripts/setup-r2-cors.ts (the CORSRules block above).\n\n',
    );
    process.exit(2);
  }
  throw err;
}
