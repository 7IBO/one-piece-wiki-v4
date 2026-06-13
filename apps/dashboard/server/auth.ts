/**
 * Session projection consumed by application code. Re-exports the
 * discriminated `Session` type from `./session.ts` under the name
 * `DashboardSession` (preserved for clarity at call sites) and a
 * thin `readDashboardSession(req)` helper.
 *
 * ADR-017: we deliberately do NOT use a session store / better-auth.
 * The cookie is the entire session — `parse()` round-trips it through
 * HMAC and returns the same shape. This keeps the dashboard stateless
 * (Vercel-serverless-compatible) and removes a dependency tree.
 *
 * Centralising the projection here means a route handler only sees the
 * `DashboardSession` shape, never the raw cookie format. If we ever
 * swap the cookie carrier (e.g. iron-session for AES-encrypted bodies)
 * only this file moves.
 */
import { parse, readCookie, type Session } from './session.ts';

export type DashboardSession = Session;

export function readDashboardSession(req: Request): DashboardSession | null {
  return parse(readCookie(req));
}
