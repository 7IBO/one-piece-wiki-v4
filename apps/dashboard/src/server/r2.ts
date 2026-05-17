/**
 * Cloudflare R2 client + presigned-upload helpers.
 *
 * R2 speaks the S3 API; we use the official `@aws-sdk/client-s3` with
 * the R2 endpoint and a fixed `auto` region. The dashboard API server
 * NEVER streams image bytes — it only mints short-lived presigned PUT
 * URLs that the browser uploads to directly. This keeps egress at zero
 * for our backend and avoids buffering large files through Bun.
 *
 * Loaded lazily: if any of the R2 env vars is missing or set to
 * REPLACE_ME, `r2Config()` returns null and image-upload endpoints
 * return 503 ServiceUnavailable. Read endpoints and the GitHub-save
 * flow are unaffected.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

/**
 * Two-stage storage (ADR-015 / Phase 7.1).
 *
 *  - Uploads land in `pending/` — a private prefix served only via
 *    short-lived signed URLs. The R2 bucket has a lifecycle rule
 *    that purges objects under this prefix after 14 days, so PRs
 *    that close without merging never leak bytes forever.
 *  - On PR merge, the `promote-images.yml` GitHub Actions workflow
 *    S3-copies referenced `pending/<key>` objects to `images/<key>`
 *    (the public CDN prefix) and opens a follow-up commit rewriting
 *    any `staging://<key>` URLs in entity JSON to the canonical
 *    public URL.
 *
 *  Until Phase 7.2 lands (contributor auth), the dashboard still
 *  gates `/api/uploads/presign` behind admin auth, so the only
 *  callers writing to `pending/` are admins — the staging step is
 *  invisible from their POV apart from the URL scheme change in
 *  the saved JSON.
 */
const PENDING_PREFIX = 'pending';
const PUBLIC_PREFIX = 'images';

export type R2Config = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly publicBaseUrl: string;
  readonly maxUploadBytes: number;
};

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

let cached: R2Config | null | undefined;

export function r2Config(): R2Config | null {
  if (cached !== undefined) return cached;
  const accountId = process.env['R2_ACCOUNT_ID'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucket = process.env['R2_BUCKET'];
  const publicBaseUrl = process.env['R2_PUBLIC_BASE_URL'];

  const required = { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
  for (const [k, v] of Object.entries(required)) {
    if (v === undefined || v === '' || v === 'REPLACE_ME') {
      cached = null;
      process.stderr.write(`[r2] disabled — env var ${k} is not set\n`);
      return null;
    }
  }

  const maxRaw = process.env['R2_MAX_UPLOAD_BYTES'];
  const maxUploadBytes = maxRaw !== undefined && maxRaw !== ''
    ? Number(maxRaw)
    : DEFAULT_MAX_UPLOAD_BYTES;

  cached = {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    publicBaseUrl: publicBaseUrl!.replace(/\/+$/, ''),
    maxUploadBytes,
  };
  return cached;
}

let clientCache: S3Client | null = null;

function r2Client(cfg: R2Config): S3Client {
  if (clientCache !== null) return clientCache;
  clientCache = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return clientCache;
}

/**
 * Acceptable image MIME types. Anything else is rejected by the
 * presign endpoint, so we never mint a URL for executable content.
 */
export const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

/**
 * Build a stable object key under the staging prefix.
 *
 * Layout: `pending/<slug>-<rand>.<ext>`. The flat layout matches
 * the convention in /docs/IMAGES.md ("flat layout handles reuse
 * cleanly"); the `pending/` prefix is what makes the object
 * subject to the lifecycle purge until the merge workflow
 * promotes it to `images/`.
 *
 * The `prefix` argument is exposed so promotion code (and tests)
 * can build keys under `images/` too, but every real upload uses
 * the default (`pending/`).
 */
export function buildObjectKey(filename: string, prefix: string = PENDING_PREFIX): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : 'bin';
  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const rand = randomBytes(6).toString('hex');
  return `${prefix}/${safeStem || 'image'}-${rand}.${ext}`;
}

/**
 * URL scheme stored on the entity `url` property until the merge
 * workflow rewrites it. Frontend code resolves `staging://<key>`
 * by hitting `/api/preview/<key>` (signed read URL, 60s TTL).
 */
export const STAGING_URL_PREFIX = 'staging://';

/** Build a `staging://` URL from a staged object key. */
export function stagingUrl(key: string): string {
  return `${STAGING_URL_PREFIX}${key}`;
}

/** Inverse of `stagingUrl` — returns the key, or `null` if not a
 *  staging URL. Used by the preview route + the promote workflow. */
export function parseStagingUrl(url: string): string | null {
  if (!url.startsWith(STAGING_URL_PREFIX)) return null;
  return url.slice(STAGING_URL_PREFIX.length);
}

/**
 * Promote a staged key to its public-CDN counterpart. Object key
 * shape is preserved (same stem + rand + ext), only the prefix
 * changes. The promotion workflow uses this to compute the
 * destination key + the final public URL.
 */
export function publicKeyFor(stagingKey: string): string {
  if (stagingKey.startsWith(`${PENDING_PREFIX}/`)) {
    return `${PUBLIC_PREFIX}/${stagingKey.slice(PENDING_PREFIX.length + 1)}`;
  }
  // Already a public key (idempotent for the workflow's safety).
  return stagingKey;
}

export type PresignResult = {
  readonly uploadUrl: string;
  /** `staging://<key>` placeholder. The dashboard stores this on
   *  the entity JSON until the promote-images workflow rewrites
   *  it to the canonical public URL after the PR merges. */
  readonly stagingUrl: string;
  readonly key: string;
  readonly expiresIn: number;
  readonly maxBytes: number;
};

/**
 * Mint a presigned PUT URL the browser can upload to directly. The
 * URL is valid for 5 minutes — long enough for a slow upload, short
 * enough to limit blast radius if a URL leaks via referrer or logs.
 *
 * Phase 7.1 change: returns the `staging://` placeholder (not the
 * public URL) so the entity JSON never references a not-yet-vetted
 * R2 object via its CDN URL.
 */
export async function presignUpload(
  cfg: R2Config,
  args: { filename: string; contentType: string; sizeBytes: number; },
): Promise<PresignResult> {
  if (!ALLOWED_IMAGE_TYPES.has(args.contentType)) {
    throw new Error(`Disallowed content type: ${args.contentType}`);
  }
  if (args.sizeBytes <= 0 || args.sizeBytes > cfg.maxUploadBytes) {
    throw new Error(
      `Size out of range: ${args.sizeBytes} (max ${cfg.maxUploadBytes})`,
    );
  }
  const key = buildObjectKey(args.filename);
  const expiresIn = 60 * 5;
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: args.contentType,
    ContentLength: args.sizeBytes,
  });
  const uploadUrl = await getSignedUrl(r2Client(cfg), command, { expiresIn });
  return {
    uploadUrl,
    stagingUrl: stagingUrl(key),
    key,
    expiresIn,
    maxBytes: cfg.maxUploadBytes,
  };
}

/**
 * Mint a short-lived signed GET URL so the dashboard can preview a
 * staged image before it's promoted to the public CDN. The
 * default 60s TTL is long enough for an `<img>` to load and short
 * enough that a leaked URL becomes useless almost immediately.
 *
 * The browser hits `/api/preview/:key` which 302s to this URL —
 * keeping the signed URL out of HTML markup + referrer headers.
 */
export async function presignRead(
  cfg: R2Config,
  key: string,
  ttlSec: number = 60,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
  });
  return await getSignedUrl(r2Client(cfg), command, { expiresIn: ttlSec });
}
