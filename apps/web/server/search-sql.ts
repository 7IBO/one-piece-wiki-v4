/**
 * The SQL the reader app runs against the artifact's search tables
 * (built by `packages/db-builder/src/search.ts`, ADR-108), plus the
 * query-string translation that feeds it.
 *
 * Kept as a pure module — strings and parameter arrays, no database —
 * so the two things that are easy to get silently wrong can be
 * unit-tested without an artifact: the FTS5 MATCH expression, and the
 * SPOILER GATE.
 *
 * ## The gate
 *
 * A doc is visible iff the reader's cursor has passed EVERY anchor
 * recorded for it in `search_gates`. That is expressed as a
 * `NOT EXISTS` correlated subquery inside the WHERE clause of each
 * pass, so SQLite applies it BEFORE any `LIMIT`. Filtering in JS after
 * a limited fetch would silently drop results — and there is nothing
 * to render in a dropped result's place either: a "hidden result" row
 * would itself announce that something exists later.
 *
 * The axis → source-type binding is a presentation concern (ADR-091)
 * and comes from `CURSOR_AXES` in `progress.ts`; the predicate below
 * is GENERATED from it, so adding an axis never means hand-editing
 * SQL. An axis the reader has not set contributes `? IS NOT NULL` =
 * false and filters nothing — the wiki default of showing everything.
 * A gate on a source type that is not an axis at all (`volume:1`, say)
 * is likewise inert, matching `isSourceVisible`'s rule that an
 * unfilterable anchor is a visible one.
 */
import { searchTerms } from '@onepiece-wiki/schemas';
import { CURSOR_AXES, type ProgressCursor } from './progress.ts';

/** Bindable SQL scalar. Mirrors what bun:sqlite accepts positionally. */
export type SearchParam = string | number | null;

/**
 * `NOT EXISTS (…)` predicate correlating `search_gates` with the doc
 * alias `d`. One disjunct per cursor axis, each consuming three
 * positional parameters: the cursor value, the source type, the cursor
 * value again (bound twice rather than named — the codebase binds
 * positionally throughout, see `writer.ts`).
 */
export const GATE_PREDICATE: string = `NOT EXISTS (
      SELECT 1 FROM search_gates g
       WHERE g.doc_id = d.doc_id
         AND (${
  CURSOR_AXES
    .map(() => `(? IS NOT NULL AND g.source_type = ? AND g.ordinal > ?)`)
    .join('\n           OR ')
}))`;

/** Positional parameters for {@link GATE_PREDICATE}, in axis order. */
export function gateParams(cursor: ProgressCursor): SearchParam[] {
  return CURSOR_AXES.flatMap(({ axis, sourceType }) => {
    const limit = cursor[axis];
    return [limit, sourceType, limit];
  });
}

/**
 * Turn a raw query into an FTS5 MATCH expression: every normalized
 * term becomes a quoted PREFIX term, and the terms are AND-ed (FTS5's
 * default, made explicit for readability). Quoting is what makes the
 * expression injection-proof — a term is `"…"` and normalization has
 * already reduced it to letters and digits, so no FTS5 operator can
 * survive into it.
 *
 * Prefix matching is why "lu" finds "Luffy" as you type, and why a
 * trailing-truncation typo costs nothing.
 *
 * Returns null when the query has no terms — the caller must then
 * return no results rather than running a MATCH that would throw.
 */
export function ftsMatchExpression(query: string): string | null {
  const terms = searchTerms(query);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(' AND ');
}

const DOC_COLUMNS =
  `d.doc_id, d.entity_id, d.entity_type, d.slug, d.locale, d.field, d.kind, d.text`;

/**
 * Pass A — lexical. Whole-term (and prefix) matching over the FTS5
 * index, ranked by `bm25`, which returns a NEGATIVE score where more
 * negative is a better match. Accents are folded by the tokenizer on
 * both sides (`unicode61 remove_diacritics 2`).
 *
 * Parameters: match expression, …gate, limit.
 */
export const SEARCH_LEXICAL_SQL: string = `
  SELECT ${DOC_COLUMNS}, bm25(search_fts) AS bm25_score
    FROM search_fts
    JOIN search_docs d ON d.doc_id = search_fts.rowid
   WHERE search_fts MATCH ?
     AND ${GATE_PREDICATE}
   ORDER BY bm25_score
   LIMIT ?`;

/**
 * Pass B — fuzzy. Sørensen–Dice overlap between ONE query term's
 * trigrams and each indexed WORD's trigrams, keeping each document's
 * best-matching word. This is the typo tolerance: "zorro" shares
 * enough padded trigrams with "zoro" to clear the threshold, while
 * FTS5's own `trigram` tokenizer could not have matched it at all (its
 * MATCH is a contiguous-substring query).
 *
 * The gate is applied in the OUTER query, on the same `d` alias, so
 * the `NOT EXISTS` predicate is shared verbatim with pass A.
 *
 * Parameters: query-term trigram count, trigram JSON array, threshold,
 * …gate, limit.
 */
export const SEARCH_FUZZY_SQL: string = `
  SELECT ${DOC_COLUMNS}, MAX(x.dice) AS dice
    FROM (
      SELECT tg.doc_id AS doc_id,
             (2.0 * COUNT(*)) / (? + tg.word_size) AS dice
        FROM json_each(?) j
        JOIN search_trigrams tg ON tg.trigram = j.value
       GROUP BY tg.doc_id, tg.word_index
    ) x
    JOIN search_docs d ON d.doc_id = x.doc_id
   WHERE x.dice >= ?
     AND ${GATE_PREDICATE}
   GROUP BY d.doc_id
   ORDER BY dice DESC
   LIMIT ?`;

/**
 * The name to LABEL a result with — resolved through the same gate, so
 * the label can never be a name the reader has not reached. Mirrors
 * `resolveEntityName` (canonical key first, then the entity type's
 * `display_name_properties` in order, latest entry winning) and adds
 * the cursor it lacks. Locale is the last tiebreak: it separates two
 * rows describing the SAME name entry, never a canonical name from a
 * lesser one.
 *
 * Parameters: entity id, …gate, reader locale.
 */
export const SEARCH_DISPLAY_NAME_SQL: string = `
  SELECT d.text, d.locale
    FROM search_docs d
   WHERE d.entity_id = ?
     AND d.name_rank IS NOT NULL
     AND ${GATE_PREDICATE}
   ORDER BY d.name_rank ASC,
            d.entry_index DESC,
            CASE WHEN d.locale = ? THEN 0 WHEN d.locale = 'en' THEN 1 ELSE 2 END
   LIMIT 1`;
