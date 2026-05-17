/**
 * Cheap in-memory token bucket for anonymous-write abuse mitigation.
 *
 * One counter per (bucket, key), windowed by the hour. Resets when
 * the function instance is recycled. Acceptable for Phase 7.2
 * (single-instance dev / early-prod or warm-ish Vercel function);
 * upgrade to a shared store (Vercel KV / Upstash Redis) when the
 * dashboard scales horizontally and per-user enforcement matters.
 *
 * Counts ARE NOT shared across cold-start function instances on
 * Vercel — a determined abuser could in theory cycle through cold
 * starts to dodge the limit. That's the same compromise the legacy
 * Bun server made (only one process anyway); we accept it for now.
 */
import { isAdmin } from '@onepiece-wiki/github-client';
import { clientIp } from './blocklist';
import { tryLoadConfig } from './github';
import type { DashboardSession } from './session';

export const ANON_WRITE_LIMIT = Number(process.env['ANON_WRITE_LIMIT_PER_HOUR'] ?? '10');
export const ANON_UPLOAD_LIMIT = Number(process.env['ANON_UPLOAD_LIMIT_PER_HOUR'] ?? '20');

type RateBucket = { hourStartMs: number; count: number };
const rateState = new Map<string, RateBucket>();

export function rateLimitHit(bucket: string, key: string, limitPerHour: number): boolean {
  const composite = `${bucket}:${key}`;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const current = rateState.get(composite);
  if (current === undefined || now - current.hourStartMs >= hourMs) {
    rateState.set(composite, { hourStartMs: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > limitPerHour;
}

/**
 * Stable rate-limit bucket key. GitHub identity is the login
 * (immutable across sign-outs); anonymous identity is the
 * self-chosen nickname (changeable, but a contributor reusing the
 * same nickname keeps the same bucket — which is the right UX for
 * someone with a stable pseudo). Falls back to IP when no session
 * (read-only traffic that shouldn't hit write paths anyway).
 */
export function rateLimitKey(session: DashboardSession | null, req: Request): string {
  if (session === null) return `ip:${clientIp(req)}`;
  if (session.kind === 'github') return `gh:${session.login.toLowerCase()}`;
  return `anon:${session.nickname.toLowerCase()}`;
}

/** Admin sessions skip rate limits. */
export function isAdminSession(session: DashboardSession | null): boolean {
  if (session === null || session.kind !== 'github') return false;
  const cfg = tryLoadConfig();
  if (cfg === null) return false;
  return isAdmin(cfg, session.login);
}
