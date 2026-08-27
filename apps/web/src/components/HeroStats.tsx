/**
 * The hero's stat block — the bordered strip of 2 to 3 cells sitting
 * at the right of the band in every `design/v2` plate: `PRIME /
 * STATUT / TECHNIQUES` on a character, `TYPE / PORTEURS CONNUS /
 * TECHNIQUES` on a devil fruit, `PRIME / STATUT / APPARITIONS` on a
 * minor one.
 *
 * The cells are CHOSEN, not taken in order: a preference list per
 * type names what the plate puts there, and anything absent is simply
 * skipped (ADR-091 — every binding degrades). With nothing to show,
 * the block does not render, which is what a plate with no stat strip
 * looks like.
 */
import type { ReactElement } from 'react';
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
  for (const id of PREFERRED[type] ?? []) {
    const row = byId.get(id);
    if (row !== undefined) out.push(row);
  }
  for (const row of infobox) {
    if (out.length >= MAX_CELLS) break;
    if (!out.includes(row) && !NEVER_FILL.has(row.id)) out.push(row);
  }
  return out.slice(0, MAX_CELLS);
}

export function HeroStats(
  { rows }: { readonly rows: readonly InfoboxRowView[]; },
): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <div className='flex shrink-0 self-start overflow-hidden rounded-md bg-surface/70 ring-1 ring-line-strong'>
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`px-[17px] py-[11px] ${index > 0 ? 'border-l border-line-strong' : ''}`}
        >
          <p className='label-xs'>{row.label}</p>
          <p
            className={`display mt-0.5 whitespace-nowrap text-xl font-bold leading-tight tabular-nums ${
              index === 0 ? 'text-gold' : 'text-fg'
            }`}
          >
            {row.entry.display}
          </p>
          {row.entry.since === null || row.entry.since === undefined
            ? null
            : <p className='text-[10px] text-faint'>{row.entry.since.name}</p>}
        </div>
      ))}
    </div>
  );
}
