/**
 * The chip row of `design/v2`'s hero: the scopes an entity is attested
 * in (`Manga`, `Anime`, `Films`, `SBS`) followed by ONE gold chip
 * stating how much of it the reader has actually reached —
 * « 342 apparitions lues sur 1044 ».
 *
 * Both come straight from `appearances`, which already carries a
 * per-source-type `count` (within the cursor) and `total` (the
 * population). Nothing is computed here that the view model did not
 * already gate, so the gold chip can never name a number the reader
 * is not allowed to know.
 */
import type { ReactElement } from 'react';
import type { AppearanceGroupView } from '../api';
import { type Locale, t } from '../lib/chrome';

export function HeroChips(
  { appearances, locale }: {
    readonly appearances: readonly AppearanceGroupView[];
    readonly locale: Locale;
  },
): ReactElement | null {
  if (appearances.length === 0) return null;
  // The leading axis is the biggest population — the manga for almost
  // everything, the anime for a filler-only entity. Its ratio is the
  // one worth stating; the others are named, not counted.
  const lead = [...appearances].sort((a, b) => b.total - a.total)[0];
  return (
    <div className='mt-3 flex flex-wrap items-center gap-[7px]'>
      {appearances.map((group) => (
        <span
          key={group.key}
          className='rounded-[3px] px-[9px] py-1 text-[11px] text-muted ring-1 ring-line-strong'
        >
          {group.typeLabel}
        </span>
      ))}
      {lead === undefined || lead.total === 0
        ? null
        : (
          <span className='rounded-[3px] px-[9px] py-1 text-[11px] text-gold ring-1 ring-gold/30'>
            {t(locale, 'appearancesRead')
              .replace('#', String(lead.count))
              .replace('@', String(lead.total))}
          </span>
        )}
    </div>
  );
}
