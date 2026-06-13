/**
 * Tiny signed-cookie session. Stateless — the cookie value itself IS
 * the session; no DB row is allocated. Format:
 *
 *   base64url(json) + "." + base64url(hmac-sha256(json, SESSION_SECRET))
 *
 * On read we recompute the HMAC and reject mismatches.
 *
 * The session is a discriminated union of two flows (ADR-017):
 *
 *   - `github`    — GitHub OAuth, login + numeric id captured at the
 *                   callback. Eligible for the admin allow-list check.
 *   - `anonymous` — Self-chosen pseudo, no external identity. The pseudo
 *                   travels in the cookie verbatim; the server validates
 *                   it once at sign-in via `normalizeNickname`.
 *
 * If SESSION_SECRET isn't set we generate an ephemeral one at startup.
 * That means restarting the API logs everyone out — fine for dev; the
 * maintainer sets a stable SESSION_SECRET in .env.local for prod (the
 * server REFUSES to start in production without one).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Module dir, compatible with both Bun (which exposes `import.meta.dir`
 * but where `import.meta.dirname` may or may not be present depending
 * on version) and standard Node ESM (where `import.meta.dirname` is
 * canonical Node ≥20.11 and `import.meta.dir` is undefined). Falls
 * back to deriving from `import.meta.url` so this file imports cleanly
 * from a Nitro/Vite SSR bundle where neither convenience field is set.
 */
const HERE = (import.meta as { dirname?: string; dir?: string; }).dirname
  ?? (import.meta as { dirname?: string; dir?: string; }).dir
  ?? dirname(fileURLToPath(import.meta.url));

const COOKIE_NAME = 'opw_session';
// 30-day rolling cookie. Long enough that a sporadic contributor
// finds their open contributions on return; short enough that an
// abandoned browser eventually drops the session.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Resolve the HMAC secret used to sign session cookies. Three paths:
 *
 *  1. `SESSION_SECRET` env var is set → use it. Required in prod;
 *     the server refuses to actually serve traffic without it (no
 *     silent fallback to an in-memory random in production).
 *  2. Dev only, env var unset → read a cached secret from
 *     `apps/dashboard/.dev-session-secret` (gitignored). Generated on
 *     first run, reused on every `bun --hot` / Vite HMR reload so the
 *     maintainer doesn't get logged out every time they save a file.
 *  3. The dev file can't be read or written → fall back to a process-
 *     local random. Cookies survive within the process but die on
 *     restart (best-effort; this branch shouldn't happen in normal
 *     setups).
 *
 * Lazy + memoised: the first `sign()` call triggers resolution, not
 * module load. Without this, evaluating `session.ts` during the
 * Vite/Nitro SSR build (where `NODE_ENV=production` is set even
 * though we're not actually serving traffic) throws and kills the
 * build. Now the build completes, and a misconfigured prod *runtime*
 * still fails loudly on the first request.
 *
 * Why a file rather than an env default in dev: bun --hot / Vite HMR
 * re-evaluates top-level module code on every change, so a process-
 * local `randomBytes(32)` would be re-rolled and the previous cookie
 * would fail HMAC verification. The file gives stable bytes that
 * survive reload + restart, the only downside being one extra read
 * at first sign/verify.
 */
let cachedSecret: string | null = null;
let warnedServerless = false;

function isServerless(): boolean {
  // Heuristic for "this is actually a serverless deploy", as opposed
  // to "Vite/Nitro inlined NODE_ENV=production into the bundle while
  // the user is just running it locally to smoke-test". Both
  // platforms set their own env var on the runtime.
  return process.env['VERCEL'] !== undefined
    || process.env['AWS_LAMBDA_FUNCTION_NAME'] !== undefined
    || process.env['CF_PAGES'] !== undefined;
}

function getSessionSecret(): string {
  if (cachedSecret !== null) return cachedSecret;

  const envSecret = process.env['SESSION_SECRET'];
  if (envSecret !== undefined && envSecret !== '') {
    cachedSecret = envSecret;
    return cachedSecret;
  }

  // Serverless without SESSION_SECRET set is broken-by-design:
  // every cold start gets a fresh random, so cookies break across
  // requests routed to different instances. We loudly warn — once
  // — and fall through to the random so reads still work. Writes
  // / auth flows will visibly fail on the contributor's side.
  if (isServerless() && !warnedServerless) {
    warnedServerless = true;
    process.stderr.write(
      '[session] WARNING: SESSION_SECRET is not set on a serverless '
        + 'platform. Cookies will not survive across cold starts — '
        + 'every contributor effectively gets a new session per request. '
        + 'Set SESSION_SECRET in the platform env to fix.\n',
    );
  }

  // Try the dev cache file first — works for `bun run dev`, the
  // legacy `bun api/server.ts`, AND `node .output/server/index.mjs`
  // (the local prod-bundle smoke test). Survives reload + restart.
  const cachePath = resolve(HERE, '..', '.dev-session-secret');
  try {
    const cached = readFileSync(cachePath, 'utf8').trim();
    if (cached.length >= 32) {
      cachedSecret = cached;
      return cachedSecret;
    }
  } catch {
    // missing / unreadable — fall through to write a new one.
  }
  const fresh = randomBytes(32).toString('hex');
  try {
    writeFileSync(cachePath, fresh, { mode: 0o600 });
    process.stderr.write(
      `[session] generated a dev SESSION_SECRET cached at ${cachePath} — `
        + `set SESSION_SECRET in .env.local to override.\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[session] failed to persist dev secret (${
        err instanceof Error ? err.message : String(err)
      }); cookies will not survive restart.\n`,
    );
  }
  cachedSecret = fresh;
  return cachedSecret;
}

export type Session =
  | {
    readonly kind: 'github';
    readonly login: string;
    readonly userId: number;
    readonly expiresAt: number;
  }
  | {
    readonly kind: 'anonymous';
    readonly nickname: string;
    readonly expiresAt: number;
  };

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  // Pad back to a multiple of 4 so Buffer's lenient base64 parser
  // doesn't truncate the last byte.
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  // timingSafeEqual throws on length mismatch — short-circuit so a
  // crafted cookie can't probe the secret length via timing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function serialize(session: Session): string {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function parse(cookieValue: string | null | undefined): Session | null {
  if (cookieValue === null || cookieValue === undefined || cookieValue === '') return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!constantTimeEquals(sign(payload), sig)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const s = parsed as Partial<Session> & { kind?: unknown; };
  if (typeof s.expiresAt !== 'number' || s.expiresAt < Date.now()) return null;
  if (s.kind === 'github') {
    if (typeof s.login !== 'string' || typeof s.userId !== 'number') return null;
    return { kind: 'github', login: s.login, userId: s.userId, expiresAt: s.expiresAt };
  }
  if (s.kind === 'anonymous') {
    if (typeof s.nickname !== 'string') return null;
    return { kind: 'anonymous', nickname: s.nickname, expiresAt: s.expiresAt };
  }
  return null;
}

export function buildCookie(session: Session): string {
  const value = serialize(session);
  const maxAge = Math.floor((session.expiresAt - Date.now()) / 1000);
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (header === null) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

export function newGithubSession(login: string, userId: number): Session {
  return {
    kind: 'github',
    login,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

export function newAnonymousSession(nickname: string): Session {
  return {
    kind: 'anonymous',
    nickname,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}
