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
 * Restarting the process logs everyone out — fine for dev; the
 * maintainer sets a stable SESSION_SECRET in .env.local for prod (the
 * server REFUSES to start in production without one).
 *
 * Port note: this is a direct lift of apps/dashboard/api/session.ts
 * with `import.meta.dir` (Bun-only) replaced by the Node-portable
 * `fileURLToPath` dance and the cache-file resolution adjusted for
 * the new location under `src/server/`.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COOKIE_NAME = 'opw_session';
// 30-day rolling cookie. Long enough that a sporadic contributor
// finds their open contributions on return; short enough that an
// abandoned browser eventually drops the session.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function loadSessionSecret(): string {
  const envSecret = process.env['SESSION_SECRET'];
  if (envSecret !== undefined && envSecret !== '') return envSecret;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'SESSION_SECRET must be set in production. Generate with `openssl rand -base64 32`.',
    );
  }
  // Dev cache file under apps/dashboard/. The file is gitignored
  // (see .gitignore) and survives `bun --hot` / Vite reload so the
  // maintainer doesn't get logged out on every save.
  const here = fileURLToPath(import.meta.url);
  const cachePath = resolve(here, '..', '..', '..', '.dev-session-secret');
  try {
    const cached = readFileSync(cachePath, 'utf8').trim();
    if (cached.length >= 32) return cached;
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
  return fresh;
}

const SECRET = loadSessionSecret();

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

export type DashboardSession = Session;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
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
  const s = parsed as Partial<Session> & { kind?: unknown };
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

export function readDashboardSession(req: Request): DashboardSession | null {
  return parse(readCookie(req));
}

/**
 * SESSION_SECRET is also the HMAC key used for OAuth state. Exposed
 * narrowly so the oauth-state module can verify state signatures
 * without re-implementing the secret-resolution logic.
 */
export function sessionSecret(): string {
  return SECRET;
}
