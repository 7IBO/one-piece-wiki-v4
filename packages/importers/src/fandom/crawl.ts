/**
 * Full-auto crawl orchestrator (ADR-079/081): given seed categories
 * and/or page titles, fetch every page, auto-detect the infobox kind,
 * run the matching mapper, and aggregate:
 *
 *  - `results` — mapped entities ready for the emit adapter;
 *  - `frontier` — unknown wikilink targets ranked by frequency (what
 *    to import next);
 *  - `unknownBoxes` — infobox template names we have no mapper for
 *    yet, ranked by frequency (which mapper to build next);
 *  - `failures` — pages that fetched but did not map.
 *
 * Redirects are followed once and recorded so the sync registry can
 * store the alias. The loop is sequential on purpose — the client's
 * rate limiter is the politeness contract with Fandom.
 */
import type { MapperEmit } from '../emit.ts';
import { mapArc } from './arc.ts';
import type { BoxMapContext, VocabularyIndexes } from './box.ts';
import { mapChapter } from './chapter.ts';
import { type CharacterMapContext, mapCharacter } from './character.ts';
import type { FandomClient, ParsedPage } from './client.ts';
import { mapCrew } from './crew.ts';
import { mapDevilFruit } from './devil-fruit.ts';
import { mapEpisode } from './episode.ts';
import { orderCrawlQueue, readOrdinalTitle } from './ordinal-title.ts';
import { mapOrganization } from './organization.ts';
import type { FandomRegistry } from './registry.ts';
import { buildTitleIndex, detectEntityLinks, normalizeTitle } from './registry.ts';
import { mapShip } from './ship.ts';
import { mapVolume } from './volume.ts';
import { mapWeapon } from './weapon.ts';
import { findTemplate, parseRedirect, parseTemplates } from './wikitext.ts';

export type MapperKind =
  | 'chapter'
  | 'episode'
  | 'character'
  | 'volume'
  | 'devil-fruit'
  | 'crew'
  | 'ship'
  | 'organization'
  | 'weapon'
  | 'arc';

type Mapper = (page: ParsedPage) => (MapperEmit & { warnings: readonly string[]; }) | null;

/** Mapper table bound to the run's resolution context — the character
 *  mapper resolves relation links via the registry's title index and
 *  occupations via the vocabulary map. */
function buildMappers(
  ctx: CharacterMapContext,
  boxCtx: BoxMapContext,
): Record<MapperKind, Mapper> {
  return {
    chapter: mapChapter,
    episode: mapEpisode,
    character: (page) => mapCharacter(page, ctx),
    volume: mapVolume,
    'devil-fruit': (page) => mapDevilFruit(page, boxCtx),
    crew: (page) => mapCrew(page, boxCtx),
    ship: (page) => mapShip(page, boxCtx),
    organization: (page) => mapOrganization(page, boxCtx),
    weapon: (page) => mapWeapon(page, boxCtx),
    arc: (page) => mapArc(page, boxCtx),
  };
}

/** Infobox template name → mapper kind (grows with each new mapper). */
const BOX_TO_KIND: readonly (readonly [string, MapperKind])[] = [
  ['chapter box', 'chapter'],
  ['episode box', 'episode'],
  ['char box', 'character'],
  ['volume box', 'volume'],
  ['devil fruit box', 'devil-fruit'],
  ['crew box', 'crew'],
  ['ship box', 'ship'],
  ['organization box', 'organization'],
  ['weapon box', 'weapon'],
  ['arc box', 'arc'],
];

/**
 * Detect which mapper a page belongs to from its infobox. Returns the
 * kind, or the unrecognised box name (`unknown`), or `none` when the
 * page has no `* Box` template at all (disambiguations, lists…).
 */
export function detectKind(
  wikitext: string,
): { kind: MapperKind; } | { kind: 'unknown'; box: string; } | { kind: 'none'; } {
  for (const [box, kind] of BOX_TO_KIND) {
    if (findTemplate(wikitext, box) !== null) return { kind };
  }
  for (const t of parseTemplates(wikitext)) {
    if (/\bbox$/i.test(t.name.trim())) return { kind: 'unknown', box: t.name.trim() };
  }
  return { kind: 'none' };
}

export type CrawlResult = {
  readonly page: ParsedPage;
  readonly kind: MapperKind;
  readonly mapped: MapperEmit & { readonly warnings: readonly string[]; };
  /** Alias followed to reach the page, when the seed was a redirect. */
  readonly redirectedFrom?: string;
};

export type CrawlReport = {
  readonly results: readonly CrawlResult[];
  /** Unknown wikilink targets, most-referenced first. */
  readonly frontier: readonly { readonly title: string; readonly count: number; }[];
  /** Unmapped infobox kinds, most-seen first — next mappers to build. */
  readonly unknownBoxes: readonly { readonly box: string; readonly count: number; }[];
  readonly failures: readonly { readonly page: string; readonly reason: string; }[];
  /** Pages already in the registry, skipped because `skipKnown`. */
  readonly skippedKnown: number;
};

/** Ordinal nouns per mapper kind, for the skip reason below. */
const ORDINAL_NOUN: Partial<Record<MapperKind, string>> = {
  chapter: 'Chapter',
  episode: 'Episode',
  volume: 'Volume',
};

/**
 * Why a mapper declined a page. "mapper returned null" was useless in
 * a 25-page run log; the dominant case is now the deliberate refusal
 * of a parenthesised ordinal variant, and saying so is the difference
 * between "the importer is broken" and "the importer did its job".
 */
function nullReason(kind: MapperKind, title: string): string {
  const noun = ORDINAL_NOUN[kind];
  if (noun !== undefined) {
    const verdict = readOrdinalTitle(noun, title);
    if (verdict.kind === 'variant') {
      return `skipped: variant of ${noun} ${verdict.ordinal} ("${verdict.qualifier}") — `
        + 'only the canonical page may claim the ordinal';
    }
  }
  return `${kind} mapper returned null (infobox present but unmappable)`;
}

export async function crawl(
  client: FandomClient,
  seeds: { readonly categories?: readonly string[]; readonly pages?: readonly string[]; },
  options: {
    /** Hard cap on pages fetched (politeness + bounded runs). */
    readonly limit: number;
    /**
     * Subcategory levels to descend when seeding from categories —
     * Fandom's chapter/episode categories only hold subcategories
     * (e.g. One Piece Chapters → Chapters by Volume → Volume N).
     */
    readonly categoryDepth?: number;
    /** Registry used to resolve known links (frontier excludes them)
     *  AND to resolve relation targets in the character mapper. */
    readonly registry?: FandomRegistry;
    /** Lowercased occupation label/id → occupations vocabulary id —
     *  enables the character mapper's occupation matching. */
    readonly occupations?: ReadonlyMap<string, string>;
    /** Vocabulary id → label/id index — enables the "* Box" mappers'
     *  enum resolution (classification, weapon type/grade, org type). */
    readonly vocabularies?: VocabularyIndexes;
    /**
     * Skip pages the registry already tracks, so successive bounded
     * runs ADVANCE through a category instead of re-fetching the same
     * first `limit` pages. Off by default (a re-import of known pages
     * is exactly what the sync flow wants).
     */
    readonly skipKnown?: boolean;
    readonly log?: (line: string) => void;
  },
): Promise<CrawlReport> {
  const log = options.log ?? ((): void => {});
  const queue: string[] = [...(seeds.pages ?? [])];
  for (const category of seeds.categories ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const members = await client.categoryMembers(category, {
      depth: options.categoryDepth ?? 0,
      log,
    });
    // The API returns members in ITS order and `limit` truncates —
    // without a deterministic sort, "the first 25 episodes" means 25
    // arbitrary pages, and the parenthesised variants outrank the real
    // ones. See orderCrawlQueue in ordinal-title.ts.
    const ordered = orderCrawlQueue(members);
    queue.push(...ordered);
    log(`category "${category}": ${ordered.length} page(s)`);
  }

  const results: CrawlResult[] = [];
  const failures: { page: string; reason: string; }[] = [];
  const frontierCounts = new Map<string, number>();
  const boxCounts = new Map<string, number>();
  const seen = new Set<string>();
  const registry: FandomRegistry = options.registry ?? { pages: [] };
  const titleIndex = buildTitleIndex(registry);
  const occupations = options.occupations ?? options.vocabularies?.get('occupations');
  const mappers = buildMappers(
    {
      titleIndex,
      ...(occupations !== undefined ? { occupations } : {}),
    },
    {
      titleIndex,
      ...(options.vocabularies !== undefined ? { vocabularies: options.vocabularies } : {}),
    },
  );

  const known = options.skipKnown === true
    ? new Set(
      registry.pages.flatMap((p) => [p.page, ...p.redirects].map((t) => normalizeTitle(t))),
    )
    : null;
  let skippedKnown = 0;

  let fetched = 0;
  for (const title of queue) {
    const key = normalizeTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    if (known !== null && known.has(key)) {
      skippedKnown += 1;
      continue;
    }
    if (fetched >= options.limit) break;
    fetched += 1;

    let page: ParsedPage;
    try {
      // eslint-disable-next-line no-await-in-loop
      page = await client.fetchParse(title);
    } catch (err) {
      failures.push({ page: title, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }

    // Follow one redirect hop (and remember the alias).
    let redirectedFrom: string | undefined;
    const target = parseRedirect(page.wikitext);
    if (target !== null) {
      redirectedFrom = page.title;
      try {
        // eslint-disable-next-line no-await-in-loop
        page = await client.fetchParse(target);
      } catch (err) {
        failures.push({ page: target, reason: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }

    // Feed the frontier with this page's unresolved links — even
    // pages we cannot map yet tell us what to import next.
    const { unknown } = detectEntityLinks(page.wikitext, registry);
    for (const t of unknown) {
      if (!seen.has(normalizeTitle(t))) {
        frontierCounts.set(t, (frontierCounts.get(t) ?? 0) + 1);
      }
    }

    const detected = detectKind(page.wikitext);
    if (detected.kind === 'unknown') {
      boxCounts.set(detected.box, (boxCounts.get(detected.box) ?? 0) + 1);
      failures.push({ page: page.title, reason: `no mapper for infobox "${detected.box}"` });
      continue;
    }
    if (detected.kind === 'none') {
      failures.push({ page: page.title, reason: 'no infobox' });
      continue;
    }

    const mapped = mappers[detected.kind](page);
    if (mapped === null) {
      failures.push({ page: page.title, reason: nullReason(detected.kind, page.title) });
      continue;
    }

    results.push({
      page,
      kind: detected.kind,
      mapped,
      ...(redirectedFrom !== undefined ? { redirectedFrom } : {}),
    });
    log(`mapped ${mapped.entity.id} ← "${page.title}" (${detected.kind})`);
  }

  const byCount = <T extends { count: number; }>(a: T, b: T): number => b.count - a.count;
  return {
    results,
    frontier: [...frontierCounts.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort(byCount),
    unknownBoxes: [...boxCounts.entries()]
      .map(([box, count]) => ({ box, count }))
      .sort(byCount),
    failures,
    skippedKnown,
  };
}
