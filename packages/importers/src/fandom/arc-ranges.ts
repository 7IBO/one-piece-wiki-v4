/**
 * Turning an arc's rendered ranges into the edges the corpus stores
 * (ADR-119 + ADR-033).
 *
 * The Arc Box says « Manga Chapters: 155-217 ». The corpus does NOT
 * store that span on the arc: `part-of-arc` lives on each chapter and
 * each episode, and arc ordering is the arc's own `arc_number`. The
 * arc mapper says so in its own `elsewhere` table — it has always
 * known where these belong, it just never had the numbers, because
 * they are computed at template expansion and absent from the
 * wikitext.
 *
 * Everything here is PURE: ranges in, edges and orderings out. The
 * writing is the caller's, so the planning can be tested without a
 * filesystem and without the network.
 */
import type { OrdinalRange } from './rendered-box.ts';

/** One arc's spans, as read off its rendered infobox. */
export type ArcSpans = {
  /** `arc:wano` — the id the arc mapper derived from the same page. */
  readonly arcId: string;
  readonly page: string;
  readonly chapters: OrdinalRange | null;
  readonly episodes: OrdinalRange | null;
};

/** A `part-of-arc` edge to add to one source entity. */
export type ArcEdge = {
  /** `manga-chapter:1044` / `anime-episode:1071`. */
  readonly sourceId: string;
  readonly arcId: string;
};

/** What the corpus already holds, so nothing is invented. */
export type CorpusOrdinals = {
  readonly chapters: ReadonlySet<number>;
  readonly episodes: ReadonlySet<number>;
};

/**
 * Arc ordering, by where each arc STARTS in the manga.
 *
 * Not by `prev`/`next`: those are literal wikilinks, but following
 * them means trusting a chain to be unbroken and acyclic across 51
 * pages, and one bad link silently reorders everything after it. The
 * opening chapter is a number, and numbers sort.
 *
 * An arc with no chapter range gets no `arc_number` at all rather
 * than a position invented for it — an anime-only filler arc genuinely
 * has no place on the manga axis.
 */
export function orderArcs(
  spans: readonly ArcSpans[],
): readonly { readonly arcId: string; readonly arcNumber: number; }[] {
  return spans
    .filter((s) => s.chapters !== null)
    .sort((a, b) => {
      const byStart = (a.chapters?.from ?? 0) - (b.chapters?.from ?? 0);
      // Two arcs opening on the same chapter is a data problem, not an
      // ordering one; keep it deterministic instead of arbitrary.
      return byStart !== 0 ? byStart : a.arcId.localeCompare(b.arcId);
    })
    .map((s, index) => ({ arcId: s.arcId, arcNumber: index + 1 }));
}

/**
 * The edges to add — one per source that ACTUALLY EXISTS.
 *
 * A range of 155-217 does not license writing 63 edges: it licenses
 * writing an edge for each of those chapters the corpus holds. The
 * others are not yet imported, and a relation pointing at a missing
 * entity is exactly what `check:references` refuses — rightly, since
 * it would be a claim about something the wiki cannot show.
 */
export function planArcEdges(
  spans: readonly ArcSpans[],
  corpus: CorpusOrdinals,
): readonly ArcEdge[] {
  const edges: ArcEdge[] = [];
  const claimed = new Set<string>();
  // CLOSED RANGES FIRST, open ones after. An ongoing arc says
  // `1126-` — it claims everything from there on, with no end to stop
  // it. Run it before a closed arc and it swallows that arc's
  // chapters on the "first arc wins" rule below. A bounded claim is
  // more specific than an unbounded one, so it goes first.
  const closedFirst = [...spans].sort((a, b) => openness(a) - openness(b));
  for (const span of closedFirst) {
    push(span.chapters, corpus.chapters, 'manga-chapter', span.arcId);
    push(span.episodes, corpus.episodes, 'anime-episode', span.arcId);
  }
  return edges;

  function push(
    range: OrdinalRange | null,
    have: ReadonlySet<number>,
    type: string,
    arcId: string,
  ): void {
    if (range === null) return;
    for (const n of membersOf(range, have)) {
      const sourceId = `${type}:${n}`;
      // OVERLAPPING RANGES ARE REAL: an arc and the cover-story arc
      // running beside it can both claim a chapter, and Fandom's own
      // ranges are not disjoint. First arc wins, and the run reports
      // the collisions rather than writing two arcs onto one chapter.
      if (claimed.has(sourceId)) continue;
      claimed.add(sourceId);
      edges.push({ sourceId, arcId });
    }
  }
}

/** 1 when either span is open, so open arcs sort after closed ones. */
function openness(span: ArcSpans): number {
  return span.chapters?.to === null || span.episodes?.to === null ? 1 : 0;
}

/**
 * The ordinals of a range that the corpus ACTUALLY HOLDS.
 *
 * A closed range walks its own span. An open one has no end to walk
 * to, so it is driven by the corpus instead: everything at or after
 * `from` that exists. That inversion is the whole reason this is a
 * function — an open range must never be turned into a number by
 * guessing a last chapter.
 */
function membersOf(range: OrdinalRange, have: ReadonlySet<number>): readonly number[] {
  if (range.to === null) {
    return [...have].filter((n) => n >= range.from).sort((a, b) => a - b);
  }
  const out: number[] = [];
  for (let n = range.from; n <= range.to; n += 1) if (have.has(n)) out.push(n);
  return out;
}

/** Sources claimed by more than one arc — reported, never merged. */
export function findOverlaps(
  spans: readonly ArcSpans[],
  corpus: CorpusOrdinals,
): readonly { readonly sourceId: string; readonly arcIds: readonly string[]; }[] {
  const bySource = new Map<string, string[]>();
  for (const span of spans) {
    collect(span.chapters, corpus.chapters, 'manga-chapter', span.arcId);
    collect(span.episodes, corpus.episodes, 'anime-episode', span.arcId);
  }
  return [...bySource.entries()]
    .filter(([, arcIds]) => arcIds.length > 1)
    .map(([sourceId, arcIds]) => ({ sourceId, arcIds }));

  function collect(
    range: OrdinalRange | null,
    have: ReadonlySet<number>,
    type: string,
    arcId: string,
  ): void {
    if (range === null) return;
    for (const n of membersOf(range, have)) {
      const key = `${type}:${n}`;
      bySource.set(key, [...(bySource.get(key) ?? []), arcId]);
    }
  }
}
