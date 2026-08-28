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
