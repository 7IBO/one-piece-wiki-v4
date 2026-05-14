/**
 * Tiny signed-cookie session. The cookie value is
 *   base64(json) + "." + hex(hmac-sha256(json, SESSION_SECRET))
 * On read we recompute the HMAC and reject mismatches. The session
 * holds the GitHub login + access token + an absolute expiry.
 *
 * If SESSION_SECRET isn't set we generate an ephemeral one at startup.
 * That means restarting the API logs everyone out — fine for Phase
 * 4.2; the maintainer can set a stable SESSION_SECRET in .env.local
 * once they want sessions to survive restarts.
 */
import { createHmac, randomBytes } from 'node:crypto';

const COOKIE_NAME = 'opw_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const SECRET = process.env['SESSION_SECRET'] ?? randomBytes(32).toString('hex');

export type Session = {
  readonly login: string;
  readonly userId: number;
  readonly accessToken: string;
  readonly expiresAt: number;
};

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

export function serialize(session: Session): string {
  const json = JSON.stringify(session);
  const payload = Buffer.from(json, 'utf8').toString('base64');
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function parse(cookieValue: string | null | undefined): Session | null {
  if (cookieValue === null || cookieValue === undefined || cookieValue === '') return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (sign(payload) !== sig) return null;
  let session: Session;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Session;
  } catch {
    return null;
  }
  if (typeof session.expiresAt !== 'number' || session.expiresAt < Date.now()) return null;
  return session;
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

export function newSession(login: string, userId: number, accessToken: string): Session {
  return {
    login,
    userId,
    accessToken,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}
