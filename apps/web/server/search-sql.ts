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
 * The display-name statement at the bottom is used by the WHOLE app,
 * not only by `/search`: `resolveEntityName` in `server/views.ts` runs
 * it too, so a page title, a hero, a `<title>` and a search card can
 * never disagree about which name the reader has reached.
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
import { CURSOR_AXES, cursorActive, type ProgressCursor } from './progress.ts';

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
    .map(() => `(? = 1 AND g.source_type = ? AND (? IS NULL OR g.ordinal > ?))`)
    .join('\n           OR ')
}))`;

/**
 * Positional parameters for {@link GATE_PREDICATE}, four per axis.
 *
 * Le premier dit si un filtrage s'applique DU TOUT. C'est ce qui
 * permet à un axe laissé vide d'être bloquant (`? IS NULL` → tout est
 * au-delà) sans que l'absence totale de curseur ne vide le site : la
 * règle de `isSourceVisible`, mot pour mot, exprimée en SQL.
 */
export function gateParams(cursor: ProgressCursor): SearchParam[] {
  const active = cursorActive(cursor) ? 1 : 0;
  return CURSOR_AXES.flatMap(({ axis, sourceType }) => {
    const limit = cursor[axis];
    return [active, sourceType, limit, limit];
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
 * The name to DISPLAY an entity under — everywhere, not only on a
 * search card: page title, `<title>`, hero, link labels, chips
 * (`resolveEntityName`, `server/views.ts`). The name a reader sees is
 * a surfacing exactly like a search hit, so it goes through the very
 * same gate and the very same statement.
 *
 * Ordering mirrors what the BUILDER recorded in `name_rank`
 * (`packages/db-builder/src/search.ts`): 0 = the entity's
 * `canonical_name_key`, then 1 + the position of the property in the
 * entity type's `display_name_properties`. `entry_index DESC` makes
 * the LATEST entry of a property win, and locale is the last tiebreak:
 * it separates two rows describing the SAME name entry, never a
 * canonical name from a lesser one.
 *
 * Because the gate is in the WHERE clause, a canonical name the reader
 * has not reached is not merely deprioritised — it does not exist for
 * this query, and resolution falls to the name that WAS in force at
 * the cursor.
 *
 * Parameters: entity id, …gate, reader locale.
 */
export const DISPLAY_NAME_SQL: string = `
  SELECT d.text, d.locale
    FROM search_docs d
   WHERE d.entity_id = ?
     AND d.name_rank IS NOT NULL
     AND ${GATE_PREDICATE}
   ORDER BY d.name_rank ASC,
            d.entry_index DESC,
            CASE WHEN d.locale = ? THEN 0 WHEN d.locale = 'en' THEN 1 ELSE 2 END
   LIMIT 1`;

/**
 * Does the entity carry ANY candidate display name in the index,
 * cursor or no cursor? This is what separates the two reasons
 * {@link DISPLAY_NAME_SQL} can come back empty:
 *
 * - **no rows at all** — the entity's `canonical_name_key` is not
 *   carried by any localizable property (an `image` entity names
 *   itself through a key no property declares). Such a key has no
 *   `since` and therefore no progression anchor: it cannot be a later
 *   name, and resolving it directly from `translations` is safe;
 * - **rows exist but every one is gated** — the entity HAS names and
 *   the reader has reached none of them. Falling back to the raw key
 *   there is precisely the leak this module exists to prevent, so the
 *   caller must degrade to the slug instead.
 *
 * Parameters: entity id.
 */
export const HAS_DISPLAY_NAME_SQL: string = `
  SELECT 1 FROM search_docs d
   WHERE d.entity_id = ? AND d.name_rank IS NOT NULL
   LIMIT 1`;
