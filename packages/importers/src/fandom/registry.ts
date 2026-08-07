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

type TitleIndex = ReadonlyMap<string, FandomPageLink>;

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

/** Insert or update one page link (immutably, keyed by entityId). */
export function upsertPage(
  registry: FandomRegistry,
  link: FandomPageLink,
): FandomRegistry {
  const rest = registry.pages.filter((p) => p.entityId !== link.entityId);
  return { pages: [...rest, link].sort((a, b) => a.entityId.localeCompare(b.entityId)) };
}
