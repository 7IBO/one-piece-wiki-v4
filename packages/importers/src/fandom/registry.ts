/**
 * Fandom sync registry (ADR-081): the committed ledger binding our
 * entities to their Fandom provider pages, plus the redirect aliases
 * that make wikitext links resolvable.
 *
 * Three jobs:
 *  1. **Provenance** — for each imported entity: canonical page title,
 *     pageId, the revision we last imported (`lastRevId`) and when.
 *  2. **Redirect resolution** — Fandom links go through aliases
 *     ("[[Straw Hat Luffy]]" → "Monkey D. Luffy"); storing the alias
 *     set per page lets `resolveTitle` map ANY inbound link to our
 *     entity id without a network round-trip.
 *  3. **Update detection** — comparing the live `lastrevid`
 *     (client.queryInfo / recentChangesSince) against `lastRevId`
 *     yields the stale set to re-import.
 *
 * The ledger lives at `data/import/fandom-pages.json` (committed —
 * like `data/migrations/applied.json`, it is reviewable state, not
 * wiki content; entity JSON never references it).
 */

export type FandomPageLink = {
  /** Our entity id (`type:slug`). */
  readonly entityId: string;
  /** Canonical Fandom page title (spaces, not underscores). */
  readonly page: string;
  readonly pageId: number;
  /** Redirect aliases pointing at `page` (canonical spelling). */
  readonly redirects: readonly string[];
  /** MediaWiki revision id last imported; absent = never imported. */
  readonly lastRevId?: number;
  /** ISO timestamp of the last import run. */
  readonly lastImportedAt?: string;
};

export type FandomRegistry = {
  readonly pages: readonly FandomPageLink[];
};

/** MediaWiki title normalization: underscores → spaces, collapse
 *  whitespace, uppercase the first character, strip `#section`. */
export function normalizeTitle(raw: string): string {
  const noSection = raw.split('#')[0] ?? '';
  const spaced = noSection.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (spaced === '') return '';
  return spaced[0]!.toUpperCase() + spaced.slice(1);
}

export type TitleIndex = ReadonlyMap<string, FandomPageLink>;

/** Canonical titles ∪ redirect aliases → page link, pre-normalized. */
export function buildTitleIndex(registry: FandomRegistry): TitleIndex {
  const index = new Map<string, FandomPageLink>();
  for (const link of registry.pages) {
    index.set(normalizeTitle(link.page), link);
    for (const alias of link.redirects) {
      const key = normalizeTitle(alias);
      // Canonical titles win over a colliding alias.
      if (!index.has(key)) index.set(key, link);
    }
  }
  return index;
}

/** Resolve a raw wikitext link target to a registered page, or null. */
export function resolveTitle(
  index: TitleIndex,
  rawTarget: string,
): FandomPageLink | null {
  return index.get(normalizeTitle(rawTarget)) ?? null;
}

export type LinkDetection = {
  /** Distinct resolved entity ids, in first-appearance order. */
  readonly linked: readonly { readonly entityId: string; readonly page: string; }[];
  /** Distinct unresolved targets — candidate pages to register/import. */
  readonly unknown: readonly string[];
};

/** Every `[[Target]]` / `[[Target|label]]` target in a wikitext. */
export function extractWikiLinks(wikitext: string): readonly string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const target = (m[1] ?? '').trim();
    // Skip files, categories, interlanguage links ("xx:Title").
    if (target === '' || /^[a-z-]+:/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

/**
 * Detect entity linkages in a page's content: which of OUR entities
 * this page references (→ candidate relations / `features` edges for
 * the AI-extraction pass), and which targets we don't know yet.
 */
export function detectEntityLinks(
  wikitext: string,
  registry: FandomRegistry,
): LinkDetection {
  const index = buildTitleIndex(registry);
  const linked = new Map<string, { entityId: string; page: string; }>();
  const unknown = new Set<string>();
  for (const target of extractWikiLinks(wikitext)) {
    const hit = resolveTitle(index, target);
    if (hit === null) unknown.add(normalizeTitle(target));
    else if (!linked.has(hit.entityId)) {
      linked.set(hit.entityId, { entityId: hit.entityId, page: hit.page });
    }
  }
  return { linked: [...linked.values()], unknown: [...unknown] };
}

/** Registry entries whose live revision is newer than the imported one. */
export function staleEntries(
  registry: FandomRegistry,
  liveRevisions: ReadonlyMap<string, number>,
): readonly FandomPageLink[] {
  const out: FandomPageLink[] = [];
  for (const link of registry.pages) {
    const live = liveRevisions.get(normalizeTitle(link.page));
    if (live === undefined) continue;
    if (link.lastRevId === undefined || live > link.lastRevId) out.push(link);
  }
  return out;
}

/** One page an import run actually reached, as the run saw it. */
export type ImportedPage = {
  readonly entityId: string;
  /** Canonical title the mapper ran on (after any redirect hop). */
  readonly page: string;
  readonly pageId: number;
  /** Revision the wikitext came from, when the API reported one. */
  readonly revId?: number;
  /** Alias the run entered through, when the seed was a redirect. */
  readonly alias?: string;
  /** ISO timestamp of the run. */
  readonly importedAt: string;
};

/**
 * Merge one run's observation onto what the ledger already knows.
 *
 * A wholesale replace would be wrong here: a crawl reaches a page
 * through AT MOST ONE alias, so writing the run's view over the entry
 * would discard every redirect learned by earlier runs and by
 * `check-updates` (which reads them in batches of fifty). Aliases
 * therefore accumulate; identity fields are refreshed only when the
 * run actually observed them.
 */
function mergeImport(
  previous: FandomPageLink | undefined,
  imported: ImportedPage,
): FandomPageLink {
  const aliases = new Set(previous?.redirects ?? []);
  // A page renamed on Fandom leaves its old title behind as a working
  // alias — inbound wikilinks still use it.
  if (previous !== undefined && normalizeTitle(previous.page) !== normalizeTitle(imported.page)) {
    aliases.add(previous.page);
  }
  if (
    imported.alias !== undefined
    && normalizeTitle(imported.alias) !== normalizeTitle(imported.page)
  ) {
    aliases.add(imported.alias);
  }
  const revId = imported.revId ?? previous?.lastRevId;
  const pageId = imported.pageId !== 0 ? imported.pageId : (previous?.pageId ?? 0);
  return {
    entityId: imported.entityId,
    page: imported.page,
    pageId,
    redirects: [...aliases].sort((a, b) => a.localeCompare(b)),
    ...(revId !== undefined ? { lastRevId: revId } : {}),
    lastImportedAt: imported.importedAt,
  };
}

/**
 * Fold a run's imports into the ledger, keyed by entity id, sorted so
 * the committed file diffs line-by-line rather than wholesale.
 *
 * This is what makes `--skip-known` mean anything: until the ledger is
 * written back, every bounded run re-crawls the same first `limit`
 * pages of a category and the frontier never advances.
 */
export function recordImports(
  registry: FandomRegistry,
  imports: readonly ImportedPage[],
): FandomRegistry {
  const byId = new Map(registry.pages.map((p) => [p.entityId, p]));
  for (const one of imports) byId.set(one.entityId, mergeImport(byId.get(one.entityId), one));
  return {
    pages: [...byId.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)),
  };
}
