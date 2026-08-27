/**
 * Grouping and filtering for the search palette.
 *
 * Pure on purpose: this is where the palette's one real rule lives —
 * **a chip counts results ON SCREEN, never corpus matches**. The
 * spoiler gate runs in SQL, so a result the reader has not reached
 * never reaches this module; counting anything else would turn the
 * chip row into a tally of what is being withheld, which is itself a
 * spoiler ("5 personnages" tells you five exist).
 */
import type { SearchResultView } from '../api';

export type SearchGroup = {
  readonly type: string;
  readonly label: string;
  readonly results: readonly SearchResultView[];
};

/**
 * Group results by entity type while keeping the SERVER's ranking: a
 * type appears where its best result appeared, so the strongest match
 * heads the first group and the reader's first ↓ lands on it.
 */
export function groupByType(results: readonly SearchResultView[]): readonly SearchGroup[] {
  const order: string[] = [];
  const byType = new Map<string, { label: string; results: SearchResultView[]; }>();
  for (const result of results) {
    const existing = byType.get(result.type);
    if (existing === undefined) {
      byType.set(result.type, { label: result.typeLabel, results: [result] });
      order.push(result.type);
    } else existing.results.push(result);
  }
  return order.flatMap((type) => {
    const bucket = byType.get(type);
    return bucket === undefined ? [] : [{ type, label: bucket.label, results: bucket.results }];
  });
}

/**
 * The rows the palette renders: one type when a chip is active, all of
 * them otherwise, capped. The cap is a rendering budget, not a gate —
 * the count beside the query is the full visible set, and the chips
 * count their own full groups, so narrowing by type never invents a
 * result the reader could not otherwise have seen.
 */
export function visibleResults(
  results: readonly SearchResultView[],
  typeFilter: string | null,
  limit: number,
): readonly SearchResultView[] {
  const scoped = typeFilter === null ? results : results.filter((r) => r.type === typeFilter);
  return scoped.slice(0, limit);
}
