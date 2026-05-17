/**
 * Lazy, fail-soft GitHub App config loader for the Start API routes.
 *
 * The legacy Bun server (apps/dashboard/api/server.ts) called
 * `loadConfig()` at module init and stored the result in a module
 * variable, then surfaced 503s from individual endpoints if the
 * config failed to load. Under Start we do the same but lazily so a
 * cold function that only serves read endpoints never tries to read
 * env vars at all.
 */
import {
  type GitHubAppConfig,
  loadConfig,
} from '@onepiece-wiki/github-client';

let cached: { config: GitHubAppConfig } | { error: string } | undefined;

export function tryLoadConfig(): GitHubAppConfig | null {
  if (cached === undefined) {
    try {
      cached = { config: loadConfig() };
    } catch (err) {
      cached = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return 'config' in cached ? cached.config : null;
}

export function configError(): string | null {
  if (cached === undefined) tryLoadConfig();
  return cached !== undefined && 'error' in cached ? cached.error : null;
}

/**
 * Set once when we detect the GitHub App is not installed on the data
 * repo (a normal early-stage state). After that, getFile/openPR
 * callers should short-circuit so we don't spam the console with 404s
 * on every entity load.
 */
let installMissing = false;

export function markInstallMissing(): void {
  installMissing = true;
}

export function isInstallMissing(): boolean {
  return installMissing;
}

export function looksLikeMissingInstallation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  if (!m.includes('Not Found') && !m.includes('404')) return false;
  return m.includes('installation');
}
