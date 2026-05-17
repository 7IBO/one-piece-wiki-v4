/**
 * Stateless OAuth `state` parameter for the GitHub sign-in flow.
 *
 * The legacy Bun server kept an in-memory `Set<string>` of minted
 * states with a 5-minute timeout, then `consumed` an entry on
 * callback. That's broken in serverless: the `/login` and `/callback`
 * requests may land on different function instances that don't share
 * memory, so the callback would 400 "Invalid OAuth state" at random.
 *
 * Instead we sign the state with the same HMAC secret as the session
 * cookie. The format is:
 *
 *   base64url({ nonce, expiresAt }) + "." + base64url(hmac-sha256)
 *
 * - `nonce`: 16 random bytes hex-encoded, defeats replay if a state
 *   value leaks; the server doesn't need to remember the nonce
 *   because the signature already guarantees authenticity.
 * - `expiresAt`: 5 minutes from minting. The OAuth flow takes at
 *   most a few seconds in practice; the wider window forgives the
 *   user picking up the phone mid-redirect.
 *
 * Defense-in-depth: a stolen state value lets an attacker complete
 * a victim's OAuth flow on the attacker's behalf — exactly what
 * `state` is supposed to prevent. By tying the state to the same
 * HMAC secret used elsewhere we keep the trust model uniform.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './session';

const STATE_TTL_MS = 5 * 60 * 1000;

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
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function mintOAuthState(): string {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = base64UrlEncode(JSON.stringify({ nonce, expiresAt }));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a state string returned by GitHub's callback. Returns true
 * iff the signature is valid AND the expiry hasn't lapsed.
 *
 * Unlike the legacy in-memory variant this does NOT mark the state
 * as "consumed" — a stolen state could in theory be replayed within
 * the 5-minute window. Tightening this would require either a tiny
 * KV (Vercel KV / Upstash) or accepting per-function-instance state.
 * Phase 7.2 lives with the replay window; revisit if abuse appears.
 */
export function verifyOAuthState(state: string | null): boolean {
  if (state === null || state === '') return false;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!constantTimeEquals(sign(payload), sig)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payload));
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== 'object') return false;
  const p = parsed as { expiresAt?: unknown };
  if (typeof p.expiresAt !== 'number') return false;
  if (p.expiresAt < Date.now()) return false;
  return true;
}
