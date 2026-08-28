/**
 * « Dernières sorties ». A release DATE is public — a magazine
 * schedule is not a spoiler — but the TITLE is withheld beyond the
 * cursor, because a chapter title tells you what happens in it.
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { ReleaseView } from '../../api';
import { t } from '../../lib/chrome';
import { useLocale } from '../../routes/__root';
import { SectionTitle } from './SectionTitle';

export function Releases(
  { items, alone }: {
    readonly items: readonly ReleaseView[];
    /**
     * True when « ce que tu viens de croiser » is not on the page —
     * a reader who has declared no position has crossed nothing.
     *
     * The releases then take the WHOLE row instead of keeping the
     * narrow column meant to sit beside it. Third time this pattern
     * bites (the entity grid, the appearances slot, here): a panel
     * that drops out must WIDEN its neighbour, never leave a hole.
     * A first-time visitor was seeing one narrow card and eight empty
     * columns.
     */
    readonly alone: boolean;
  },
): ReactElement | null {
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <section className={alone ? 'lg:col-span-12' : 'lg:col-span-4'}>
      <div className='flex items-baseline justify-between gap-4'>
        <SectionTitle>{t(locale, 'homeReleases')}</SectionTitle>
      </div>
      <div className='mt-3.5 rounded-md border border-line bg-surface px-4 py-3.5'>
        {items.map((item, i) => (
          <div
            key={`${item.sourceType}/${item.slug}`}
            // A narrow column cannot hold « Manga chapter 1044 ·
            // March 7, 2022 » AND its title on one line, and clipping
            // the title is the worst of the three outcomes: the number
            // is already on the left. So the row WRAPS and the title
            // takes the second line rather than losing its end.
            className={`flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-[13px] ${
              i === items.length - 1 ? '' : 'border-b border-[color:#191c23]'
            }`}
          >
            <Link
              to='/$type/$slug'
              params={{ type: item.sourceType, slug: item.slug }}
              className='min-w-0 truncate no-underline'
            >
              <span className='font-semibold tabular-nums text-fg'>
                {item.typeLabel} {item.number}
              </span>
              {item.releasedAt !== null && (
                <span className='text-[color:var(--color-muted)]'>{' · '}{item.releasedAt}</span>
              )}
            </Link>
            {item.title === null
              ? (
                <span className='shrink-0 rounded-[3px] border border-line-strong px-2.5 py-1 text-[11px] text-[color:var(--color-muted)]'>
                  {t(locale, 'homeTitleHidden')}
                </span>
              )
              : <span className='min-w-0 shrink text-fg sm:text-right'>{item.title}</span>}
          </div>
        ))}
        <p className='mt-3 border-t border-[color:#191c23] pt-2.75 text-[11.5px] leading-relaxed text-muted'>
          {t(locale, 'homeReleasesNote')}
        </p>
      </div>
    </section>
  );
}
