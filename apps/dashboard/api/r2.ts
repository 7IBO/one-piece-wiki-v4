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
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

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
 * Build a stable object key. We use a flat namespace `images/<slug>-<rand>.<ext>`
 * so the bucket can host any image without per-entity sub-folders —
 * matches the convention in /docs/IMAGES.md ("flat layout handles
 * reuse cleanly").
 */
export function buildObjectKey(filename: string): string {
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
  return `images/${safeStem || 'image'}-${rand}.${ext}`;
}

export type PresignResult = {
  readonly uploadUrl: string;
  readonly publicUrl: string;
  readonly key: string;
  readonly expiresIn: number;
  readonly maxBytes: number;
};

/**
 * Mint a presigned PUT URL the browser can upload to directly. The
 * URL is valid for 5 minutes — long enough for a slow upload, short
 * enough to limit blast radius if a URL leaks via referrer or logs.
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
    publicUrl: `${cfg.publicBaseUrl}/${key}`,
    key,
    expiresIn,
    maxBytes: cfg.maxUploadBytes,
  };
}
