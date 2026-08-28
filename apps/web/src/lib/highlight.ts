/**
 * Splitting a label around the searched term, for the gold emphasis
 * `design/v2`'s Recherche.dc.html puts on a match: « **Gomu Gomu** no
 * Mi », « **Gomu Gomu** no Pistol ».
 *
 * Why it exists rather than a `<mark>` and a regex at the call site:
 * the query is FREE TEXT typed by a reader, so it cannot be
 * interpolated into a pattern (`gomu (` would throw, `.*` would match
 * everything). Splitting on a case-insensitive `indexOf` has no such
 * hole, and diacritics fold the same way the search index folds them.
 */

/** A label cut into runs, each flagged as matching the query or not. */
export type HighlightRun = {
  readonly text: string;
  readonly match: boolean;
  /**
   * Offset of this run in the ORIGINAL label. It is the run's
   * identity — « the piece starting at character 12 of this name » —
   * so a caller keys on it rather than on the array index, which
   * means nothing once the query changes and the cuts move.
   */
  readonly start: number;
};

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

/**
 * Runs of `label`, marking every occurrence of `query`.
 *
 * An empty or unmatched query yields the label as ONE unmatched run,
 * so a caller can always render the runs and never needs a branch for
 * "no highlight".
 */
export function highlightRuns(label: string, query: string): readonly HighlightRun[] {
  const needle = fold(query.trim());
  if (needle === '') return [{ text: label, match: false, start: 0 }];
  const hay = fold(label);
  // Folding can change length (a combining mark disappears), which
  // would slide every later index. Bail to the plain label rather
  // than highlighting the wrong letters.
  if (hay.length !== label.length) return [{ text: label, match: false, start: 0 }];
  const runs: HighlightRun[] = [];
  let at = 0;
  for (;;) {
    const found = hay.indexOf(needle, at);
    if (found === -1) break;
    if (found > at) runs.push({ text: label.slice(at, found), match: false, start: at });
    runs.push({ text: label.slice(found, found + needle.length), match: true, start: found });
    at = found + needle.length;
  }
  if (runs.length === 0) return [{ text: label, match: false, start: 0 }];
  if (at < label.length) runs.push({ text: label.slice(at), match: false, start: at });
  return runs;
}
