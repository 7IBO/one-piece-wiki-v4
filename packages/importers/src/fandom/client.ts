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

/**
 * Hard cap on categories visited by one `categoryMembers` walk — the
 * wiki has ~112 volume subcategories; 300 leaves headroom without
 * letting a miswired seed (e.g. a root category) walk the whole wiki.
 */
const MAX_CATEGORY_WALK = 300;

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

  /**
   * Live revision + redirect info for up to 50 titles in one call
   * (`action=query&prop=info|redirects&redirects=1`). Returns, per
   * canonical title: pageId, lastRevId, and the redirect aliases
   * pointing at it — everything the sync registry (ADR-081) needs to
   * detect updates and register aliases.
   */
  async queryInfo(titles: readonly string[]): Promise<
    ReadonlyMap<
      string,
      { pageId: number; lastRevId: number; redirects: readonly string[]; }
    >
  > {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.join('|'),
      prop: 'info|redirects',
      rdlimit: 'max',
      redirects: '1',
      format: 'json',
      formatversion: '2',
    });
    const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
    const envelope = JSON.parse(raw) as {
      query?: {
        pages?: readonly {
          title?: string;
          pageid?: number;
          lastrevid?: number;
          missing?: boolean;
          redirects?: readonly { title?: string; }[];
        }[];
      };
    };
    const out = new Map<
      string,
      { pageId: number; lastRevId: number; redirects: readonly string[]; }
    >();
    for (const page of envelope.query?.pages ?? []) {
      if (page.missing === true || page.title === undefined) continue;
      out.set(page.title, {
        pageId: page.pageid ?? 0,
        lastRevId: page.lastrevid ?? 0,
        redirects: (page.redirects ?? [])
          .map((r) => r.title ?? '')
          .filter((t) => t !== ''),
      });
    }
    return out;
  }

  /**
   * Main-namespace pages changed since `sinceIso`
   * (`action=query&list=recentchanges`) — the polling feed for "Fandom
   * updated a page we imported". Newest first, capped at 500/call.
   */
  async recentChangesSince(
    sinceIso: string,
  ): Promise<readonly { title: string; revId: number; timestamp: string; }[]> {
    const params = new URLSearchParams({
      action: 'query',
      list: 'recentchanges',
      rcnamespace: '0',
      rcprop: 'title|ids|timestamp',
      rclimit: '500',
      // MediaWiki lists newest→oldest; rcend bounds the OLD side.
      rcend: sinceIso,
      format: 'json',
      formatversion: '2',
    });
    const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
    const envelope = JSON.parse(raw) as {
      query?: {
        recentchanges?: readonly {
          title?: string;
          revid?: number;
          timestamp?: string;
        }[];
      };
    };
    return (envelope.query?.recentchanges ?? [])
      .filter((c) => c.title !== undefined)
      .map((c) => ({
        title: c.title ?? '',
        revId: c.revid ?? 0,
        timestamp: c.timestamp ?? '',
      }));
  }

  /**
   * Every main-namespace page of a category
   * (`list=categorymembers`), following API continuation — the crawl
   * seed for "import EVERYTHING of a kind" (Chapters, Episodes,
   * Humans, …). Pass the bare name ("Chapters"), not "Category:…".
   *
   * Fandom's chapter/episode categories hold no articles directly —
   * only subcategories (One Piece Chapters → Chapters by Volume →
   * Volume N → the chapter pages). `depth` descends that many
   * subcategory levels (default 0 = direct members only), deduplicated
   * and capped at {@link MAX_CATEGORY_WALK} categories per call.
   */
  async categoryMembers(
    category: string,
    options: { readonly depth?: number; readonly log?: (line: string) => void; } = {},
  ): Promise<readonly string[]> {
    const log = options.log ?? ((): void => {});
    const titles: string[] = [];
    const seenPages = new Set<string>();
    const visited = new Set<string>();

    const walk = async (cat: string, remaining: number): Promise<void> => {
      const bare = cat.replace(/^Category:/i, '').trim();
      const key = bare.toLowerCase();
      if (visited.has(key) || visited.size >= MAX_CATEGORY_WALK) return;
      visited.add(key);

      const subcategories: string[] = [];
      let cmcontinue: string | undefined;
      do {
        const params = new URLSearchParams({
          action: 'query',
          list: 'categorymembers',
          cmtitle: `Category:${bare}`,
          // 14 = the Category namespace — only asked for when we may descend.
          cmnamespace: remaining > 0 ? '0|14' : '0',
          cmlimit: '500',
          format: 'json',
          formatversion: '2',
        });
        if (cmcontinue !== undefined) params.set('cmcontinue', cmcontinue);
        // eslint-disable-next-line no-await-in-loop
        const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
        const envelope = JSON.parse(raw) as {
          error?: { code?: string; info?: string; };
          query?: { categorymembers?: readonly { title?: string; ns?: number; }[]; };
          continue?: { cmcontinue?: string; };
        };
        if (envelope.error !== undefined) {
          throw new Error(
            `MediaWiki error for category "${bare}": ${envelope.error.code ?? '?'} — ${
              envelope.error.info ?? 'no info'
            }`,
          );
        }
        for (const m of envelope.query?.categorymembers ?? []) {
          if (m.title === undefined) continue;
          if (m.ns === 14 || m.title.startsWith('Category:')) {
            subcategories.push(m.title);
          } else if (!seenPages.has(m.title)) {
            seenPages.add(m.title);
            titles.push(m.title);
          }
        }
        cmcontinue = envelope.continue?.cmcontinue;
      } while (cmcontinue !== undefined);

      if (remaining > 0 && subcategories.length > 0) {
        log(`category "${bare}": ${subcategories.length} subcategorie(s), descending`);
        for (const sub of subcategories) {
          // eslint-disable-next-line no-await-in-loop
          await walk(sub, remaining - 1);
        }
      }
    };

    await walk(category, options.depth ?? 0);
    return titles;
  }

  private async fetchRaw(url: string): Promise<string> {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    const res = await this.fetchImpl(url, {
      headers: {
        'user-agent': 'onepiece-wiki-importer/0.1 (+https://one-piece.wiki)',
      },
    });
    if (!res.ok) throw new Error(`Fandom API ${res.status} ${res.statusText}.`);
    return await res.text();
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
