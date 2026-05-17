/**
 * Comma-separated env var → Set<string>. Used by both
 * BLOCKED_GITHUB_USERNAMES and BLOCKED_IPS. Trims + lowercases entries
 * so casing / whitespace mistakes in the env don't silently weaken
 * the blocklist.
 *
 * Resolved lazily so a serverless function that doesn't hit a
 * write/auth path never reads these envs.
 */
let cache: { logins: ReadonlySet<string>; ips: ReadonlySet<string> } | undefined;

function parseEnv(name: string): ReadonlySet<string> {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return new Set();
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== ''),
  );
}

function load() {
  if (cache === undefined) {
    cache = {
      logins: parseEnv('BLOCKED_GITHUB_USERNAMES'),
      ips: parseEnv('BLOCKED_IPS'),
    };
  }
  return cache;
}

export function isBlockedLogin(login: string): boolean {
  return load().logins.has(login.trim().toLowerCase());
}

export function isBlockedIp(ip: string): boolean {
  return load().ips.has(ip.trim().toLowerCase());
}

/**
 * Best-effort client IP. Prefer the first hop of X-Forwarded-For
 * (set by reverse proxies / Vercel) since the connecting socket is
 * the proxy itself in deployed environments. Fall back to a constant
 * when no header is present — Start handlers don't expose the raw
 * socket easily, so dev-local IP blocklist precision suffers (no
 * realistic use case for blocking a dev IP anyway).
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff !== null) {
    const first = xff.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return '0.0.0.0';
}
