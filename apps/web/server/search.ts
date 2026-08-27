/**
 * Search view model (ADR-108). Takes a raw query, the reader's locale
 * and the reader's progression cursor; returns ranked, display-ready
 * results. All the heavy lifting is in the artifact
 * (`packages/db-builder/src/search.ts` builds the index at
 * `bun run build:db` time — the database is NEVER written here) and in
 * `search-sql.ts` (the two passes and the spoiler gate). This module
 * is the policy layer: how the two passes combine, and how a hit
 * becomes a rank.
 *
 * ## The two passes
 *
 * 1. **Lexical** — FTS5 prefix matching over `search_fts`, ranked with
 *    `bm25`. Handles exact words, prefixes ("lu" → Luffy), multi-word
 *    queries and — through the `unicode61 remove_diacritics 2`
 *    tokenizer — accents ("equipage" → "Équipage du Chapeau de
 *    Paille"). This is the pass that answers almost every query.
 * 2. **Fuzzy** — trigram overlap (Sørensen–Dice) against each
 *    document's best-matching WORD, run once per query term and
 *    intersected across terms. A strict FALLBACK: it fires only when
 *    the lexical pass found NOTHING, so a query that already works
 *    never pays for it and never has near-miss noise mixed into good
 *    results. This is the typo tolerance: "zorro" → Roronoa Zoro,
 *    "nammi" → Nami, "marinford" → Marineford.
 *
 * ## Multilingual
 *
 * The index carries one row per UI locale that has a value (`en`,
 * `fr` — `ja`/`ja-latn` are data-only locales, ADR-095, and are not
 * indexed). A query matches rows in ANY indexed locale, so a French
 * reader finds an entity by its English name and vice versa; the
 * reader's own locale only gets a ranking bonus
 * ({@link LOCALE_BONUS}), and the RESULT is always labelled in the
 * reader's locale.
 *
 * ## Spoilers
 *
 * Nothing is filtered here. Visibility is enforced in SQL by the gate
 * predicate, in both passes and in the display-name lookup, so a
 * result that the reader must not see never enters this module — and
 * is never counted, teased or placeheld either.
 */
import {
  normalizeSearchText,
  SEARCH_SLUG_FIELD,
  type SearchDocKind,
  searchTerms,
  wordTrigrams,
} from '@onepiece-wiki/schemas';
import { getCatalogue } from './catalogue.ts';
// Namespace import: see the note in `views.ts` — the dev SSR
// transform drops value specifiers from mixed imports of this
// bun:sqlite-backed module.
import * as db from './db.ts';
import type { SearchHitRow } from './db.ts';
import { EMPTY_CURSOR, type ProgressCursor } from './progress.ts';
import { ftsMatchExpression } from './search-sql.ts';
import { buildEntityCardView, type ImageView, type Locale, propertyLabel } from './views.ts';

export type SearchResultView = {
  readonly id: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  /** Cursor-checked display name (never a name from beyond the cursor). */
  readonly name: string;
  /** The matched string, when the match was NOT on the displayed name. */
  readonly matched: string | null;
  /** Localized label of the field that matched ("Epithet", "Title"…). */
  readonly matchedLabel: string | null;
  readonly secondary: string | null;
  readonly tag: string | null;
  readonly image: ImageView | null;
};

export type SearchView = {
  /** The query as typed, echoed back for the input and the heading. */
  readonly query: string;
  readonly results: readonly SearchResultView[];
  /** True when the fuzzy pass contributed — the UI says "approximate". */
  readonly approximate: boolean;
};

// ---------------------------------------------------------------------------
// Ranking — every constant here is a deliberate, readable weight.

/**
 * How much a hit is worth by the KIND of string it matched. The kind
 * is decided by the BUILDER from the schema (a property type flagged
 * `romanizable` carries a name, ADR-095), never from a list of
 * property ids: matching a name beats matching a description, and
 * matching the URL slug sits between the two.
 */
const KIND_WEIGHT: Readonly<Record<SearchDocKind, number>> = {
  name: 1,
  slug: 0.7,
  text: 0.5,
};

/**
 * How much a hit is worth by the TYPE of entity it belongs to, so that
 * "Nami" returns the character before the chapter titled "Nami".
 *
 * A presentation binding (ADR-091): every id here is a WELL-KNOWN one
 * and every id NOT here degrades to {@link DEFAULT_TYPE_WEIGHT}, which
 * is deliberately high — an unlisted type is unranked, not demoted, so
 * a new entity type is instantly searchable at a sane rank with no
 * code change. The ordering reads as "how likely is this the thing the
 * reader typed a name for": people and the things they carry first,
 * story containers next, individual sources after them, and
 * production/metadata records (a platform, a citation, an image entity)
 * last, since they are looked up FROM a page far more often than
 * searched for.
 */
const DEFAULT_TYPE_WEIGHT = 0.85;
const TYPE_WEIGHT: Readonly<Record<string, number>> = {
  character: 1,
  crew: 0.96,
  'devil-fruit': 0.96,
  organization: 0.94,
  location: 0.92,
  ship: 0.9,
  technique: 0.9,
  weapon: 0.9,
  event: 0.88,
  saga: 0.86,
  arc: 0.86,
  volume: 0.8,
  'manga-chapter': 0.74,
  'anime-episode': 0.74,
  film: 0.74,
  document: 0.66,
  'streaming-platform': 0.5,
  reference: 0.45,
  image: 0.4,
};

/** Multiplier when the matched row is in the reader's own locale. */
const LOCALE_BONUS = 1.06;

/**
 * Match quality in [0, 1], before the kind and type weights. The four
 * tiers are ordered so a fuzzy hit can never outrank a real one:
 * an exact string equality, then a prefix of the whole string, then a
 * lexical hit graded by its bm25 rank, then a fuzzy hit graded by its
 * Dice similarity.
 */
const QUALITY_EXACT = 1;
const QUALITY_PREFIX = 0.85;
const QUALITY_LEXICAL_BASE = 0.6;
const QUALITY_LEXICAL_SPAN = 0.2;
const QUALITY_FUZZY_BASE = 0.15;
const QUALITY_FUZZY_SPAN = 0.35;

/** Lexical hits fetched before ranking. Generous: ranking is cheap. */
const LEXICAL_FETCH = 200;
/** Fuzzy hits fetched per query term. */
const FUZZY_FETCH = 120;
/** Minimum Dice similarity for a fuzzy hit to be considered at all. */
const FUZZY_THRESHOLD = 0.5;
/**
 * Run the fuzzy pass only when the lexical pass found fewer entities
 * than this. At 1 the fuzzy pass is a pure fallback for "no results":
 * a query that already matched something is not a misspelling, and
 * mixing near-misses into a working result list is worse than not
 * offering them (three-to-five-letter words are close to everything —
 * "hat" is a 0.57 Dice match for "chat").
 */
const FUZZY_TRIGGER = 1;
/**
 * Terms shorter than this are not fuzzy-matched. Below four letters
 * the Dice coefficient stops discriminating: every short word is a
 * near-neighbour of every other, and a typo in a three-letter word is
 * a different word.
 */
const FUZZY_MIN_TERM_LENGTH = 4;
/** Results returned to the page. */
export const SEARCH_RESULT_LIMIT = 40;

type Scored = {
  readonly hit: SearchHitRow;
  readonly quality: number;
  readonly fuzzy: boolean;
};

function qualityOf(
  hit: SearchHitRow,
  normalizedQuery: string,
  bm25Rank01: number,
): { quality: number; fuzzy: boolean; } {
  const normalizedText = normalizeSearchText(hit.text);
  if (normalizedText === normalizedQuery) return { quality: QUALITY_EXACT, fuzzy: false };
  if (normalizedText.startsWith(normalizedQuery)) {
    return { quality: QUALITY_PREFIX, fuzzy: false };
  }
  if (hit.bm25_score !== null) {
    return {
      quality: QUALITY_LEXICAL_BASE + QUALITY_LEXICAL_SPAN * bm25Rank01,
      fuzzy: false,
    };
  }
  return {
    quality: QUALITY_FUZZY_BASE + QUALITY_FUZZY_SPAN * (hit.dice ?? 0),
    fuzzy: true,
  };
}

/** The final score of one hit: quality × string weight × type weight. */
function scoreHit(scored: Scored, locale: Locale): number {
  const kind = KIND_WEIGHT[scored.hit.kind] ?? KIND_WEIGHT.text;
  const type = TYPE_WEIGHT[scored.hit.entity_type] ?? DEFAULT_TYPE_WEIGHT;
  const localeFactor = scored.hit.locale === locale ? LOCALE_BONUS : 1;
  return scored.quality * kind * type * localeFactor;
}

/**
 * The typo-tolerant pass, run once per query term and INTERSECTED, so
 * it keeps the same all-terms-must-match promise as the lexical pass:
 * "romance zoro" finds nothing because no string is close to both
 * words, while "straw haat" still finds "Straw Hat". A union would
 * turn every unmatched multi-word query into a dump of everything
 * vaguely resembling any one of its words.
 *
 * A document's fuzzy score is its WEAKEST term match — the query is
 * only as well answered as the term it answers worst.
 */
function fuzzyPass(query: string, cursor: ProgressCursor): readonly SearchHitRow[] {
  const terms = searchTerms(query).filter((term) => term.length >= FUZZY_MIN_TERM_LENGTH);
  if (terms.length === 0) return [];

  // (doc → hit, worst dice seen so far). Rebuilt on each term rather
  // than mutated in place, so the intersection is a plain fold.
  let surviving = new Map<number, { hit: SearchHitRow; dice: number; }>();

  for (const [index, term] of terms.entries()) {
    const hits = db.searchFuzzy(wordTrigrams(term), FUZZY_THRESHOLD, cursor, FUZZY_FETCH);
    if (index === 0) {
      surviving = new Map(hits.map((hit) => [hit.doc_id, { hit, dice: hit.dice ?? 0 }]));
      continue;
    }
    const next = new Map<number, { hit: SearchHitRow; dice: number; }>();
    for (const hit of hits) {
      const previous = surviving.get(hit.doc_id);
      if (previous === undefined) continue;
      next.set(hit.doc_id, { hit: previous.hit, dice: Math.min(previous.dice, hit.dice ?? 0) });
    }
    surviving = next;
  }

  return [...surviving.values()].map(({ hit, dice }) => ({ ...hit, dice }));
}

// ---------------------------------------------------------------------------

/**
 * Run both passes and rank the result. `cursor` is threaded straight
 * into the SQL gate, so an empty cursor means "no filtering" (the wiki
 * default) and a set one means the reader can only ever match strings
 * they have already reached.
 */
export async function buildSearchView(
  query: string,
  locale: Locale,
  cursor: ProgressCursor = EMPTY_CURSOR,
): Promise<SearchView> {
  const cat = await getCatalogue();
  const normalizedQuery = normalizeSearchText(query);
  const match = ftsMatchExpression(query);
  if (match === null) return { query, results: [], approximate: false };

  const lexical = db.searchLexical(match, cursor, LEXICAL_FETCH);
  const distinctLexicalEntities = new Set(lexical.map((hit) => hit.entity_id)).size;

  // bm25 is negative and unbounded; grade a hit by its RANK inside this
  // result set rather than by the raw figure, which keeps the tier
  // boundaries meaningful whatever the corpus size.
  const scored: Scored[] = lexical.map((hit, index) => {
    const rank01 = lexical.length <= 1 ? 1 : 1 - index / (lexical.length - 1);
    return { hit, ...qualityOf(hit, normalizedQuery, rank01) };
  });

  if (distinctLexicalEntities < FUZZY_TRIGGER) {
    for (const hit of fuzzyPass(query, cursor)) {
      scored.push({ hit, ...qualityOf(hit, normalizedQuery, 0) });
    }
  }

  // Best hit per ENTITY: a page is one result, whichever of its strings
  // matched. Ties break on the doc id so the order is deterministic.
  const best = new Map<string, { scored: Scored; score: number; }>();
  for (const candidate of scored) {
    const score = scoreHit(candidate, locale);
    const current = best.get(candidate.hit.entity_id);
    if (
      current === undefined
      || score > current.score
      || (score === current.score && candidate.hit.doc_id < current.scored.hit.doc_id)
    ) {
      best.set(candidate.hit.entity_id, { scored: candidate, score });
    }
  }

  const ranked = [...best.values()]
    .sort((a, b) =>
      b.score - a.score || a.scored.hit.entity_id.localeCompare(b.scored.hit.entity_id)
    )
    .slice(0, SEARCH_RESULT_LIMIT);

  const results: SearchResultView[] = [];
  let approximate = false;
  for (const { scored: candidate } of ranked) {
    const hit = candidate.hit;
    const card = buildEntityCardView(hit.entity_id, cat, locale, cursor);
    if (card === null) continue;
    // The label is resolved through the SAME gate as the match, so it
    // can never be a later name (a renamed character is listed under
    // the name they had at the reader's cursor).
    const name = db.searchDisplayName(hit.entity_id, cursor, locale) ?? card.chip.name;
    // A slug hit is never shown as "what matched": it is a URL
    // fragment, not something the reader wrote or would recognise.
    const matchedIsName = hit.field === SEARCH_SLUG_FIELD
      || normalizeSearchText(hit.text) === normalizeSearchText(name);
    if (candidate.fuzzy) approximate = true;
    results.push({
      id: hit.entity_id,
      type: hit.entity_type,
      typeLabel: card.chip.typeLabel,
      slug: hit.slug,
      name,
      matched: matchedIsName ? null : hit.text,
      matchedLabel: matchedIsName ? null : propertyLabel(cat, hit.field, locale),
      secondary: card.secondary,
      tag: card.tag,
      image: card.image,
    });
  }

  return { query, results, approximate };
}
