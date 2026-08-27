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
  /**
   * Revision this wikitext came from, when the API reported one.
   * Absent for a response served from a cache written before the
   * importer started asking for `revid` — the ledger then records the
   * page with no `lastRevId`, which reads as "never imported at a
   * known revision" and re-fetches on the next sync. Degrading to a
   * re-fetch is the safe direction.
   */
  readonly revId?: number;
};

/** One category row from `list=allcategories` + `acprop=size`. */
export type CategoryInfo = {
  /** Bare category name (no `Category:` prefix). */
  readonly name: string;
  /** Total members (pages + files + subcats). */
  readonly size: number;
  /** Main-namespace article members. */
  readonly pages: number;
  readonly subcats: number;
};

/** Latest-revision info for one page (`prop=revisions`). */
export type RevisionInfo = {
  readonly pageId: number;
  readonly revId: number;
  readonly timestamp: string;
};

/** Batched `prop=revisions&redirects=1` result (ADR-092 updates). */
export type RevisionsQueryResult = {
  /** Canonical title → latest revision. */
  readonly pages: ReadonlyMap<string, RevisionInfo>;
  /** Redirect source title → target title (`query.redirects`). */
  readonly redirects: ReadonlyMap<string, string>;
  /** Titles the wiki reports as missing (deleted/renamed away). */
  readonly missing: ReadonlySet<string>;
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

  /** Wiki origin this client talks to (report provenance). */
  get origin(): string {
    return this.baseUrl;
  }

  parseUrl(page: string): string {
    const params = new URLSearchParams({
      action: 'parse',
      page,
      prop: 'wikitext|revid',
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
      parse?: { title?: string; pageid?: number; wikitext?: string; revid?: number; };
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
      ...(typeof parse.revid === 'number' ? { revId: parse.revid } : {}),
    };
  }

  /** `action=parse&prop=text` — the page with every template EXPANDED. */
  renderUrl(page: string): string {
    const params = new URLSearchParams({
      action: 'parse',
      page,
      prop: 'text',
      format: 'json',
      formatversion: '2',
    });
    return `${this.baseUrl}/api.php?${params.toString()}`;
  }

  /**
   * Fetch a page's RENDERED HTML (ADR-119).
   *
   * The second extraction substrate, and deliberately narrow. Some
   * infobox values do not exist in the wikitext at all: an arc page
   * writes `chapter = auto` and a Lua module computes "106-114, 9
   * chapters" at expansion time. `prop=wikitext` can never see that
   * number, whatever the mapper does; `prop=text` can.
   *
   * Everything else keeps reading wikitext. This is a fallback for
   * computed values, not a migration of the importer.
   */
  async fetchRendered(page: string): Promise<{ title: string; html: string; }> {
    const cached = await this.readCache(page, 'html');
    const raw = cached ?? (await this.fetchRaw(this.renderUrl(page)));
    if (cached === null || cached === undefined) await this.writeCache(page, raw, 'html');

    const envelope = JSON.parse(raw) as {
      error?: { code?: string; info?: string; };
      parse?: { title?: string; text?: string; };
    };
    if (envelope.error !== undefined) {
      throw new Error(
        `MediaWiki error rendering "${page}": ${envelope.error.code ?? '?'} — ${
          envelope.error.info ?? 'no info'
        }`,
      );
    }
    const parse = envelope.parse;
    if (parse?.text === undefined || parse.title === undefined) {
      throw new Error(`Malformed render response for "${page}".`);
    }
    return { title: parse.title, html: parse.text };
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

  /**
   * All categories of the wiki with their member counts
   * (`list=allcategories&acprop=size`), following API continuation —
   * the category half of the ADR-092 structural sweep.
   */
  async allCategories(
    options: { readonly log?: (line: string) => void; } = {},
  ): Promise<readonly CategoryInfo[]> {
    const log = options.log ?? ((): void => {});
    const out: CategoryInfo[] = [];
    let accontinue: string | undefined;
    do {
      const params = new URLSearchParams({
        action: 'query',
        list: 'allcategories',
        acprop: 'size',
        aclimit: '500',
        format: 'json',
        formatversion: '2',
      });
      if (accontinue !== undefined) params.set('accontinue', accontinue);
      const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
      const envelope = JSON.parse(raw) as {
        error?: { code?: string; info?: string; };
        query?: {
          allcategories?: readonly {
            category?: string;
            size?: number;
            pages?: number;
            subcats?: number;
          }[];
        };
        continue?: { accontinue?: string; };
      };
      if (envelope.error !== undefined) {
        throw new Error(
          `MediaWiki error for allcategories: ${envelope.error.code ?? '?'} — ${
            envelope.error.info ?? 'no info'
          }`,
        );
      }
      for (const c of envelope.query?.allcategories ?? []) {
        if (c.category === undefined) continue;
        out.push({
          name: c.category,
          size: c.size ?? 0,
          pages: c.pages ?? 0,
          subcats: c.subcats ?? 0,
        });
      }
      accontinue = envelope.continue?.accontinue;
      log(`allcategories: ${out.length} so far`);
    } while (accontinue !== undefined);
    return out;
  }

  /**
   * Every page title of the Template namespace
   * (`list=allpages&apnamespace=10`), following continuation. Titles
   * come back WITHOUT the `Template:` prefix; `/doc`-style subpages
   * are skipped. The ADR-092 analyzer filters these down to infoboxes
   * by name — this wiki names them "* Box" (Char Box, Chapter Box…),
   * not "Infobox *", so an `apprefix=Infobox` query would miss them
   * all; enumerating the whole namespace is the shape the API supports
   * that catches both conventions.
   */
  async templateTitles(
    options: { readonly log?: (line: string) => void; } = {},
  ): Promise<readonly string[]> {
    const log = options.log ?? ((): void => {});
    const out: string[] = [];
    let apcontinue: string | undefined;
    do {
      const params = new URLSearchParams({
        action: 'query',
        list: 'allpages',
        apnamespace: '10',
        aplimit: '500',
        format: 'json',
        formatversion: '2',
      });
      if (apcontinue !== undefined) params.set('apcontinue', apcontinue);
      const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
      const envelope = JSON.parse(raw) as {
        error?: { code?: string; info?: string; };
        query?: { allpages?: readonly { title?: string; }[]; };
        continue?: { apcontinue?: string; };
      };
      if (envelope.error !== undefined) {
        throw new Error(
          `MediaWiki error for allpages(ns10): ${envelope.error.code ?? '?'} — ${
            envelope.error.info ?? 'no info'
          }`,
        );
      }
      for (const p of envelope.query?.allpages ?? []) {
        if (p.title === undefined) continue;
        const bare = p.title.replace(/^Template:/i, '');
        if (bare.includes('/')) continue; // /doc, /sandbox subpages
        out.push(bare);
      }
      apcontinue = envelope.continue?.apcontinue;
      log(`templates: ${out.length} so far`);
    } while (apcontinue !== undefined);
    return out;
  }

  /**
   * Main-namespace pages transcluding a template
   * (`list=embeddedin`), ONE batch only (≤500) — the ADR-092 analyzer
   * uses the batch both as a capped popularity signal and as the pool
   * to sample pages from, without walking full continuation on every
   * template.
   */
  async embeddedIn(
    template: string,
    options: { readonly limit?: number; } = {},
  ): Promise<readonly string[]> {
    const limit = Math.min(options.limit ?? 500, 500);
    const bare = template.replace(/^Template:/i, '');
    const params = new URLSearchParams({
      action: 'query',
      list: 'embeddedin',
      eititle: `Template:${bare}`,
      einamespace: '0',
      eilimit: String(limit),
      format: 'json',
      formatversion: '2',
    });
    const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
    const envelope = JSON.parse(raw) as {
      error?: { code?: string; info?: string; };
      query?: { embeddedin?: readonly { title?: string; }[]; };
    };
    if (envelope.error !== undefined) {
      throw new Error(
        `MediaWiki error for embeddedin "${bare}": ${envelope.error.code ?? '?'} — ${
          envelope.error.info ?? 'no info'
        }`,
      );
    }
    return (envelope.query?.embeddedin ?? [])
      .map((p) => p.title ?? '')
      .filter((t) => t !== '');
  }

  /**
   * Latest revision (id + timestamp) and redirect status for up to 50
   * titles in one call (`prop=revisions&rvprop=ids|timestamp&
   * redirects=1`) — the ADR-092 update-detection batch. With multiple
   * titles MediaWiki returns exactly the latest revision per page.
   */
  async queryRevisions(titles: readonly string[]): Promise<RevisionsQueryResult> {
    if (titles.length > 50) {
      throw new Error(`queryRevisions takes at most 50 titles per batch (got ${titles.length}).`);
    }
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.join('|'),
      prop: 'revisions',
      rvprop: 'ids|timestamp',
      redirects: '1',
      format: 'json',
      formatversion: '2',
    });
    const raw = await this.fetchRaw(`${this.baseUrl}/api.php?${params.toString()}`);
    const envelope = JSON.parse(raw) as {
      error?: { code?: string; info?: string; };
      query?: {
        redirects?: readonly { from?: string; to?: string; }[];
        pages?: readonly {
          title?: string;
          pageid?: number;
          missing?: boolean;
          revisions?: readonly { revid?: number; timestamp?: string; }[];
        }[];
      };
    };
    if (envelope.error !== undefined) {
      throw new Error(
        `MediaWiki error for revisions query: ${envelope.error.code ?? '?'} — ${
          envelope.error.info ?? 'no info'
        }`,
      );
    }
    const pages = new Map<string, RevisionInfo>();
    const missing = new Set<string>();
    for (const page of envelope.query?.pages ?? []) {
      if (page.title === undefined) continue;
      if (page.missing === true) {
        missing.add(page.title);
        continue;
      }
      const rev = page.revisions?.[0];
      if (rev?.revid === undefined) continue;
      pages.set(page.title, {
        pageId: page.pageid ?? 0,
        revId: rev.revid,
        timestamp: rev.timestamp ?? '',
      });
    }
    const redirects = new Map<string, string>();
    for (const r of envelope.query?.redirects ?? []) {
      if (r.from !== undefined && r.to !== undefined) redirects.set(r.from, r.to);
    }
    return { pages, redirects, missing };
  }

  /**
   * Wrap a transport-level fetch failure (DNS, refused CONNECT, TLS…)
   * into an actionable message: in cloud sandboxes the proxy denies
   * onepiece.fandom.com with CONNECT 403, and every CLI must fail FAST
   * with a clear "Fandom unreachable" instead of a bare stack trace.
   */
  private unreachableError(err: unknown): Error {
    const detail = err instanceof Error ? err.message : String(err);
    return new Error(
      `Fandom unreachable: ${detail} — ${this.baseUrl} needs direct egress; `
        + 'cloud Claude sandboxes deny it at the proxy (CONNECT 403). '
        + 'Run this from a machine or CI runner with egress (ADR-079 §6).',
    );
  }

  private async fetchRaw(url: string): Promise<string> {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: {
          'user-agent': 'onepiece-wiki-importer/0.1 (+https://one-piece.wiki)',
        },
      });
    } catch (err) {
      throw this.unreachableError(err);
    }
    // A sandbox proxy denial surfaces as a plain 403 response, not a
    // fetch rejection — treat it as unreachable too (and a genuine
    // Fandom-side 403 equally means "you cannot reach it from here").
    if (res.status === 403) {
      throw this.unreachableError(new Error(`API returned 403 ${res.statusText}`));
    }
    if (!res.ok) throw new Error(`Fandom API ${res.status} ${res.statusText}.`);
    return await res.text();
  }

  private async fetchLive(page: string): Promise<string> {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(this.parseUrl(page), {
        headers: {
          // Identify ourselves — polite-bot policy for MediaWiki APIs.
          'user-agent': 'onepiece-wiki-importer/0.1 (+https://one-piece.wiki)',
        },
      });
    } catch (err) {
      throw this.unreachableError(err);
    }
    // See fetchRaw: proxy CONNECT denials surface as plain 403s.
    if (res.status === 403) {
      throw this.unreachableError(new Error(`API returned 403 ${res.statusText} for "${page}"`));
    }
    if (!res.ok) {
      throw new Error(`Fandom API ${res.status} ${res.statusText} for "${page}".`);
    }
    return await res.text();
  }

  private cachePath(page: string, variant = ''): string | null {
    if (this.cacheDir === undefined) return null;
    const safe = page.replace(/[^A-Za-z0-9._-]/g, '_');
    // The rendered HTML of a page is a DIFFERENT document from its
    // wikitext; they must not share a cache entry.
    return `${this.cacheDir}/${safe}${variant === '' ? '' : `.${variant}`}.json`;
  }

  private async readCache(page: string, variant = ''): Promise<string | null> {
    const path = this.cachePath(page, variant);
    if (path === null) return null;
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) return null;
      return await file.text();
    } catch {
      return null;
    }
  }

  private async writeCache(page: string, raw: string, variant = ''): Promise<void> {
    const path = this.cachePath(page, variant);
    if (path === null) return;
    try {
      await Bun.write(path, raw);
    } catch {
      // Cache is best-effort — never fail an import over it.
    }
  }
}
