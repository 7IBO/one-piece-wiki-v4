/**
 * `POST /api/uploads/presign` — mint a presigned R2 PUT URL the
 * browser uploads to directly. The API server never sees the image
 * bytes; this keeps egress at zero on our side and avoids buffering
 * large files through the function.
 *
 * Auth: any session (anonymous + contributor + admin). Admins skip
 * the per-IP/login rate limit; everyone else is bucketed at
 * ANON_UPLOAD_LIMIT_PER_HOUR.
 */
import { createFileRoute } from '@tanstack/react-router';
import { isBlockedIp } from '../server/blocklist';
import { badRequest, json } from '../server/catalogue';
import {
  ALLOWED_IMAGE_TYPES,
  presignUpload,
  r2Config,
} from '../server/r2';
import {
  ANON_UPLOAD_LIMIT,
  isAdminSession,
  rateLimitHit,
  rateLimitKey,
} from '../server/rate-limit';
import { readDashboardSession } from '../server/session';

export const Route = createFileRoute('/api/uploads/presign')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (isBlockedIp(
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
        )) {
          return new Response(JSON.stringify({ error: 'Forbidden.' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }

        const session = readDashboardSession(request);
        if (!isAdminSession(session)) {
          if (rateLimitHit('upload', rateLimitKey(session, request), ANON_UPLOAD_LIMIT)) {
            return new Response(
              JSON.stringify({
                error: `Rate limit reached (${ANON_UPLOAD_LIMIT}/hour). Try again later.`,
              }),
              { status: 429, headers: { 'content-type': 'application/json' } },
            );
          }
        }

        const cfg = r2Config();
        if (cfg === null) {
          return json(
            { error: 'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.' },
            503,
          );
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (body === null || typeof body !== 'object') {
          return badRequest('Body must be { filename, contentType, sizeBytes }.');
        }
        const { filename, contentType, sizeBytes } = body as {
          filename?: unknown;
          contentType?: unknown;
          sizeBytes?: unknown;
        };
        if (typeof filename !== 'string' || filename === '') {
          return badRequest('filename must be a non-empty string.');
        }
        if (typeof contentType !== 'string' || !ALLOWED_IMAGE_TYPES.has(contentType)) {
          return badRequest(
            `contentType must be one of: ${[...ALLOWED_IMAGE_TYPES].join(', ')}.`,
          );
        }
        if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
          return badRequest('sizeBytes must be a positive integer.');
        }
        try {
          const result = await presignUpload(cfg, { filename, contentType, sizeBytes });
          return json(result);
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : String(err));
        }
      },
    },
  },
});
