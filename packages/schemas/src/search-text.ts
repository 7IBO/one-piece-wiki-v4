/**
 * Text normalization + trigram decomposition for the search index.
 *
 * Pure and dependency-free (no sqlite, no fs) on purpose: the SAME
 * functions must run in `packages/db-builder` when the index is built
 * and in `apps/web/server` when it is queried. A divergence between
 * the two sides would silently stop matching, so they share one
 * module rather than two copies — the pattern `display-name.ts`
 * already established here.
 *
 * The two halves of the artifact's search tables need different
 * treatments and both live here:
 *
 *  - **FTS5** (`search_fts`) does its own folding through the
 *    `unicode61 remove_diacritics 2` tokenizer, so it indexes the RAW
 *    display text. {@link normalizeSearchText} is still applied to the
 *    query before it is turned into MATCH terms, so a query and a
 *    document fold identically (é → e, `’` → space, case-folded).
 *  - **Trigrams** (`search_trigrams`) are computed HERE, from the
 *    normalized form, because the fuzzy pass is our own scoring rather
 *    than an FTS5 feature.
 */

/** Trigram width. Named so the padding arithmetic below reads. */
export const TRIGRAM_SIZE = 3;

/**
 * Weight class of an indexed string, decided by the BUILDER from the
 * schema (a property type flagged `romanizable` carries a name, per
 * ADR-095) and turned into a ranking multiplier by the READER app.
 * Declared here because it is the contract between the two.
 */
export type SearchDocKind = 'name' | 'text' | 'slug';

/** `locale` value of index rows that are the same in every locale. */
export const SEARCH_LOCALE_NEUTRAL = '*';

/** `field` value of the row carrying an entity's slug. */
export const SEARCH_SLUG_FIELD = 'slug';

/**
 * Word-boundary marker padded around every word before slicing
 * trigrams. Padding is what makes a leading/trailing typo cheap:
 * "zoro" and "zorro" still share their boundary grams, so the Dice
 * coefficient stays high. A control code, so it can never occur in
 * normalized text.
 */
const BOUNDARY = '\u0001';

/**
 * Fold a string to its comparison form: decomposed, stripped of
 * combining marks (so `Équipage` → `equipage`, essential for French),
 * lower-cased, and reduced to alphanumeric words separated by single
 * spaces. Apostrophes, dashes and punctuation become boundaries — the
 * same thing the FTS5 `unicode61` tokenizer does with its default
 * separator set, which keeps the two passes in agreement.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

/** The normalized words of a string (empty array for an empty query). */
export function searchTerms(value: string): readonly string[] {
  const normalized = normalizeSearchText(value);
  return normalized === '' ? [] : normalized.split(' ');
}

/**
 * The DISTINCT padded trigrams of ONE normalized word, sorted (so a
 * build is byte-deterministic).
 *
 * Trigrams are scored PER WORD, never over a whole string: comparing
 * "luffi" against the trigram set of the whole document "Monkey D.
 * Luffy" drowns the matching word in the other words' grams and the
 * similarity collapses. The index therefore stores one trigram set per
 * word and the query takes the best-matching word of each document.
 */
export function wordTrigrams(word: string): readonly string[] {
  const grams = new Set<string>();
  if (word !== '') {
    const padded = `${BOUNDARY}${word}${BOUNDARY}`;
    for (let i = 0; i + TRIGRAM_SIZE <= padded.length; i++) {
      grams.add(padded.slice(i, i + TRIGRAM_SIZE));
    }
  }
  return [...grams].sort();
}

/**
 * Sørensen–Dice coefficient over trigram SETS: `2·|A∩B| / (|A|+|B|)`,
 * in [0, 1]. Used to rank the fuzzy pass; the intersection size is
 * counted in SQL, and this function is the readable definition that
 * SQL mirrors (and what the unit tests assert against).
 */
export function diceCoefficient(sizeA: number, sizeB: number, shared: number): number {
  const total = sizeA + sizeB;
  return total === 0 ? 0 : (2 * shared) / total;
}
