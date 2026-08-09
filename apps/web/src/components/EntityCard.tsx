/**
 * The poster card — the image-led unit for people/things in grids
 * (WEB_APP.md § connection modules): 3:4 image (or generated art)
 * with a hairline ring that inks accent on hover, then a caption
 * stack — name, identity line (epithet…), context meta (role ·
 * period…), optional status tag and gold figure (bounty…). No box
 * around the card: image + caption, Letterboxd-style density. Purely
 * presentational: every string arrives spoiler-checked from the
 * server view models. Long values truncate with a `title` tooltip.
 *
 * `dimmed` marks ended states (former members): the image is subdued
 * but the card stays fully present and clickable.
 */
import { Link } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import type { ImageView } from '../api';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/** Left-packed responsive poster grid (2-up on phones, ~132px tracks). */
export const CARD_GRID_CLASS =
  'grid grid-cols-2 gap-x-3 gap-y-4 min-[440px]:grid-cols-[repeat(auto-fill,minmax(116px,132px))]';

export function CardGrid({ children }: { readonly children: ReactNode; }): JSX.Element {
  return <ul className={CARD_GRID_CLASS}>{children}</ul>;
}

export function EntityCard(
  {
    type,
    slug,
    image,
    name,
    secondary = null,
    meta = null,
    tag = null,
    stat = null,
    dimmed = false,
  }: {
    readonly type: string;
    readonly slug: string;
    readonly image: ImageView | null;
    readonly name: string;
    /** Identity line under the name (epithet, descriptor…). */
    readonly secondary?: string | null;
    /** Context meta line (role · rank · period…). */
    readonly meta?: string | null;
    /** Small status tag (former, dead…) — shown before the meta line. */
    readonly tag?: string | null;
    /** Right-aligned gold figure (bounty…). */
    readonly stat?: string | null;
    /** Ended state (former member…): subdued image, present card. */
    readonly dimmed?: boolean;
  },
): JSX.Element {
  const search = useScopeSearch();
  return (
    <li>
      <Link
        to='/$type/$slug'
        params={{ type, slug }}
        search={search}
        className='group block'
      >
        <EntityImage
          image={image}
          type={type}
          slug={slug}
          name={name}
          ratio='portrait'
          className={`w-full rounded-md ring-1 ring-line transition-[box-shadow,opacity] duration-150 group-hover:ring-accent/70 ${
            dimmed ? 'opacity-55 group-hover:opacity-80' : ''
          }`}
        />
        <span className='mt-1.5 block min-w-0'>
          <span
            title={name}
            className='block truncate text-[13px] font-semibold leading-snug text-fg transition-colors duration-150 group-hover:text-accent'
          >
            {name}
          </span>
          {secondary !== null
            ? (
              <span title={secondary} className='block truncate text-[11px] text-muted'>
                {secondary}
              </span>
            )
            : null}
          {tag !== null || stat !== null
            ? (
              <span className='flex items-baseline justify-between gap-2'>
                {tag !== null
                  ? (
                    <span className='truncate text-[10.5px] font-semibold text-muted'>
                      {tag}
                    </span>
                  )
                  : null}
                {stat !== null
                  ? (
                    <span
                      title={stat}
                      className='ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-gold'
                    >
                      {stat}
                    </span>
                  )
                  : null}
              </span>
            )
            : null}
          {meta !== null
            ? (
              <span title={meta} className='block truncate text-[10.5px] text-faint'>
                {meta}
              </span>
            )
            : null}
        </span>
      </Link>
    </li>
  );
}
