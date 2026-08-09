/**
 * REST client for api.api-onepiece.com (ADR-101).
 *
 * The API serves flat JSON arrays per resource+locale:
 * `https://api.api-onepiece.com/v2/<resource>/<locale>` with locales
 * `en` / `fr` (characters, fruits, crews, boats, episodes, chapters,
 * tomes, sagas, arcs, locates, dials, hakis, swords…). Data quality
 * varies — this client only transports; mappers stay defensive.
 *
 * Mirrors the FandomClient rails (ADR-079):
 *  - injectable `fetchImpl` so tests run on fixtures with zero network,
 *  - optional raw-response cache directory (one file per
 *    resource+locale) so repeated sweeps are polite and reproducible,
 *  - minimum delay between live requests (~1 req/s politeness),
 *  - UA identification.
 *
 * NOTE (environment): cloud Claude sessions deny api.api-onepiece.com
 * at the proxy (CONNECT 403, like Fandom) — live sweeps must run
 * locally or on a CI runner with egress. See ADR-101 §4 and
 * /docs/ONEPIECE_API_SYNC.md.
 */

import type { RawRecord } from './common.ts';

export type OnePieceApiClientOptions = {
  /** API origin + version prefix, default the public v2 endpoint. */
  readonly baseUrl?: string;
  /** Injectable fetch (tests pass a fixture-backed stub). */
  readonly fetchImpl?: typeof fetch;
  /** Directory for raw-response caching; omit to disable. */
  readonly cacheDir?: string;
  /** Minimum ms between live requests. Default 1000 (~1 req/s). */
  readonly minDelayMs?: number;
};

const DEFAULT_BASE = 'https://api.api-onepiece.com/v2';

export class OnePieceApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheDir: string | undefined;
  private readonly minDelayMs: number;
  private lastRequestAt = 0;

  constructor(options: OnePieceApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheDir = options.cacheDir;
    this.minDelayMs = options.minDelayMs ?? 1000;
  }

  /** API origin this client talks to (report provenance). */
  get origin(): string {
    return this.baseUrl;
  }

  resourceUrl(resource: string, locale: string): string {
    return `${this.baseUrl}/${encodeURIComponent(resource)}/${encodeURIComponent(locale)}`;
  }

  /**
   * Fetch one resource sweep (`/<resource>/<locale>`) as an array of
   * raw records. The API answers a bare JSON array; a `{ data: [...] }`
   * envelope is tolerated defensively. Anything else is malformed.
   */
  async fetchResource(resource: string, locale: string): Promise<readonly RawRecord[]> {
    const key = `${resource}-${locale}`;
    const cached = await this.readCache(key);
    const raw = cached ?? (await this.fetchLive(resource, locale));
    if (cached === null) await this.writeCache(key, raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Malformed JSON for ${resource}/${locale} — not parseable.`);
    }
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown; }).data)
      ? (parsed as { data: unknown[]; }).data
      : null;
    if (records === null) {
      throw new Error(`Malformed envelope for ${resource}/${locale} — expected a JSON array.`);
    }
    return records.filter((r): r is RawRecord => typeof r === 'object' && r !== null);
  }

  /**
   * Wrap a transport-level fetch failure (DNS, refused CONNECT, TLS…)
   * into an actionable message: in cloud sandboxes the proxy denies
   * api.api-onepiece.com with CONNECT 403, and the CLI must fail FAST
   * with a clear "api-onepiece unreachable" instead of a stack trace.
   */
  private unreachableError(err: unknown): Error {
    const detail = err instanceof Error ? err.message : String(err);
    return new Error(
      `api-onepiece unreachable: ${detail} — ${this.baseUrl} needs direct egress; `
        + 'cloud Claude sandboxes deny it at the proxy (CONNECT 403). '
        + 'Run this from a machine or CI runner with egress (ADR-101 §4).',
    );
  }

  private async fetchLive(resource: string, locale: string): Promise<string> {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(this.resourceUrl(resource, locale), {
        headers: {
          // Identify ourselves — polite-bot policy.
          'user-agent': 'onepiece-wiki-importer/0.1 (+https://one-piece.wiki)',
          accept: 'application/json',
        },
      });
    } catch (err) {
      throw this.unreachableError(err);
    }
    // A sandbox proxy denial surfaces as a plain 403 response, not a
    // fetch rejection — treat it as unreachable too.
    if (res.status === 403) {
      throw this.unreachableError(
        new Error(`API returned 403 ${res.statusText} for ${resource}/${locale}`),
      );
    }
    if (!res.ok) {
      throw new Error(`api-onepiece ${res.status} ${res.statusText} for ${resource}/${locale}.`);
    }
    return await res.text();
  }

  private cachePath(key: string): string | null {
    if (this.cacheDir === undefined) return null;
    const safe = key.replace(/[^A-Za-z0-9._-]/g, '_');
    return `${this.cacheDir}/${safe}.json`;
  }

  private async readCache(key: string): Promise<string | null> {
    const path = this.cachePath(key);
    if (path === null) return null;
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) return null;
      return await file.text();
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, raw: string): Promise<void> {
    const path = this.cachePath(key);
    if (path === null) return;
    try {
      await Bun.write(path, raw);
    } catch {
      // Cache is best-effort — never fail an import over it.
    }
  }
}
