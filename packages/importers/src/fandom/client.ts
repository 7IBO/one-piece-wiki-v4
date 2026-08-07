/**
 * MediaWiki content-API client for onepiece.fandom.com (ADR-079).
 *
 * Plain page scraping is blocked by Fandom; the supported access path
 * is `api.php` (`action=parse` for wikitext, `action=query` for
 * metadata). This client:
 *
 *  - builds the request URLs and parses the response envelopes,
 *  - takes an injectable `fetchImpl` so tests run on fixtures with
 *    zero network,
 *  - optionally caches raw responses in a directory (content-hash by
 *    page title) so repeated runs are polite to Fandom and parser
 *    work is reproducible offline,
 *  - enforces a minimum delay between live requests (rate limiting).
 *
 * NOTE (environment): cloud Claude sessions currently deny
 * `onepiece.fandom.com` at the network policy — live fetches must run
 * locally/CI or after the domain is allowlisted. See ADR-079 §6.
 */

export type FandomClientOptions = {
  /** Wiki origin, default the One Piece wiki. */
  readonly baseUrl?: string;
  /** Injectable fetch (tests pass a fixture-backed stub). */
  readonly fetchImpl?: typeof fetch;
  /** Directory for raw-response caching; omit to disable. */
  readonly cacheDir?: string;
  /** Minimum ms between live requests. Default 1000. */
  readonly minDelayMs?: number;
};

export type ParsedPage = {
  readonly title: string;
  readonly pageId: number;
  readonly wikitext: string;
  /** Canonical page URL — stored as import provenance (`sourceUrl`). */
  readonly url: string;
};

const DEFAULT_BASE = 'https://onepiece.fandom.com';

export class FandomClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheDir: string | undefined;
  private readonly minDelayMs: number;
  private lastRequestAt = 0;

  constructor(options: FandomClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheDir = options.cacheDir;
    this.minDelayMs = options.minDelayMs ?? 1000;
  }

  parseUrl(page: string): string {
    const params = new URLSearchParams({
      action: 'parse',
      page,
      prop: 'wikitext',
      format: 'json',
      formatversion: '2',
    });
    return `${this.baseUrl}/api.php?${params.toString()}`;
  }

  pageUrl(page: string): string {
    return `${this.baseUrl}/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`;
  }

  /**
   * Fetch a page's raw wikitext via `action=parse`. Throws with the
   * MediaWiki error message on API-level failures (missing page,
   * throttled, …).
   */
  async fetchParse(page: string): Promise<ParsedPage> {
    const cached = await this.readCache(page);
    const raw = cached ?? (await this.fetchLive(page));
    if (cached === null || cached === undefined) await this.writeCache(page, raw);

    const envelope = JSON.parse(raw) as {
      error?: { code?: string; info?: string; };
      parse?: { title?: string; pageid?: number; wikitext?: string; };
    };
    if (envelope.error !== undefined) {
      throw new Error(
        `MediaWiki error for "${page}": ${envelope.error.code ?? '?'} — ${
          envelope.error.info ?? 'no info'
        }`,
      );
    }
    const parse = envelope.parse;
    if (parse?.wikitext === undefined || parse.title === undefined) {
      throw new Error(`Malformed parse response for "${page}".`);
    }
    return {
      title: parse.title,
      pageId: parse.pageid ?? 0,
      wikitext: parse.wikitext,
      url: this.pageUrl(parse.title),
    };
  }

  private async fetchLive(page: string): Promise<string> {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    const res = await this.fetchImpl(this.parseUrl(page), {
      headers: {
        // Identify ourselves — polite-bot policy for MediaWiki APIs.
        'user-agent': 'onepiece-wiki-importer/0.1 (+https://one-piece.wiki)',
      },
    });
    if (!res.ok) {
      throw new Error(`Fandom API ${res.status} ${res.statusText} for "${page}".`);
    }
    return await res.text();
  }

  private cachePath(page: string): string | null {
    if (this.cacheDir === undefined) return null;
    const safe = page.replace(/[^A-Za-z0-9._-]/g, '_');
    return `${this.cacheDir}/${safe}.json`;
  }

  private async readCache(page: string): Promise<string | null> {
    const path = this.cachePath(page);
    if (path === null) return null;
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) return null;
      return await file.text();
    } catch {
      return null;
    }
  }

  private async writeCache(page: string, raw: string): Promise<void> {
    const path = this.cachePath(page);
    if (path === null) return;
    try {
      await Bun.write(path, raw);
    } catch {
      // Cache is best-effort — never fail an import over it.
    }
  }
}
