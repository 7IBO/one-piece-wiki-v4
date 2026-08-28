/**
 * Which cells the hero's stat strip shows — the bordered strip of 2 to
 * 3 values at the right of the band in every `design/v2` plate.
 *
 * Lives beside the component rather than inside it: a component file
 * that also exports plain functions defeats Fast Refresh, which
 * reloads the whole route instead of preserving state.
 */
import type { InfoboxRowView } from '../api';

/**
 * Well-known property ids the plates promote into the band, in the
 * order the plates use. Unknown types fall through to the generic
 * rule below rather than getting a bespoke entry.
 */
const PREFERRED: Readonly<Record<string, readonly string[]>> = {
  character: ['bounty', 'status', 'techniques'],
  crew: ['derived:total_bounty', 'status', 'members'],
  'devil-fruit': ['fruit_type', 'users', 'techniques'],
  'manga-chapter': ['number', 'released_at', 'page_count'],
  'anime-episode': ['number', 'aired_at', 'runtime'],
  arc: ['arc_number', 'chapters', 'episodes'],
};

const MAX_CELLS = 3;

/**
 * Ids the fallback must never promote, because the hero ALREADY shows
 * them: a cell reading `NAME / Monkey D. Luffy` under a title reading
 * `Monkey D. Luffy` is the strip filling itself with the page. The
 * preference lists above may still name one deliberately.
 */
const NEVER_FILL: ReadonlySet<string> = new Set(['name', 'title_key', 'slug']);

/**
 * Up to three cells for this entity, preferred ids first and the rest
 * of the infobox filling in behind them. Ids the entity does not
 * carry never appear — the strip is what the data supports, never a
 * placeholder for what it does not.
 */
export function heroStatRows(
  type: string,
  infobox: readonly InfoboxRowView[],
): readonly InfoboxRowView[] {
  const byId = new Map(infobox.map((row) => [row.id, row]));
  const out: InfoboxRowView[] = [];
  // A Set of the ids already taken: `out.includes(row)` re-scanned the
  // whole list on every candidate.
  const taken = new Set<string>();
  for (const id of PREFERRED[type] ?? []) {
    const row = byId.get(id);
    if (row !== undefined && !taken.has(row.id)) {
      taken.add(row.id);
      out.push(row);
    }
  }
  for (const row of infobox) {
    if (out.length >= MAX_CELLS) break;
    if (!taken.has(row.id) && !NEVER_FILL.has(row.id)) {
      taken.add(row.id);
      out.push(row);
    }
  }
  return out.slice(0, MAX_CELLS);
}
