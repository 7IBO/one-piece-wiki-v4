/**
 * The ONE entity-card unit for people/things in grids (WEB_APP.md
 * § entity cards): 3:4 portrait/monogram tile, semibold name, then —
 * only when the data exists, no empty lines — a muted identity line
 * (epithet, release date, kind…), a faint meta line (role · rank ·
 * since…) and a footer holding an optional status tag plus a
 * right-aligned micro-stat (bounty…). Purely presentational: every
 * string arrives spoiler-checked from the server view models. Long
 * values truncate with a `title` tooltip so mobile 2-col grids stay
 * clean.
 */
import { Link } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import type { ImageView } from '../api';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/**
 * Cards are sized to their CONTENT, never to the container: tracks
 * cap at 164px and left-pack, so a 4-member crew never stretches its
 * cards across a wide tile.
 */
export function CardGrid({ children }: { readonly children: ReactNode; }): JSX.Element {
  return (
    <ul className='grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(124px,164px))]'>
      {children}
    </ul>
  );
}

export function EntityCard(
  { type, slug, image, name, secondary = null, meta = null, tag = null, stat = null }: {
    readonly type: string;
    readonly slug: string;
    readonly image: ImageView | null;
    readonly name: string;
    /** Identity line under the name (epithet, descriptor…). */
    readonly secondary?: string | null;
    /** Context meta line (role · rank · since…). */
    readonly meta?: string | null;
    /** Small uppercase badge (status when not alive…). */
    readonly tag?: string | null;
    /** Right-aligned micro-stat (bounty…). */
    readonly stat?: string | null;
  },
): JSX.Element {
  const search = useScopeSearch();
  const hasFooter = tag !== null || stat !== null;
  return (
    <li>
      <Link
        to='/$type/$slug'
        params={{ type, slug }}
        search={search}
        className='group flex h-full flex-col rounded-lg bg-surface p-2 ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface-2 hover:ring-line-strong'
      >
        <EntityImage
          image={image}
          name={name}
          ratio='portrait'
          className='w-full rounded-md'
          monogramClassName='text-4xl'
        />
        <span className='mt-2 flex min-w-0 flex-1 flex-col px-1 pb-1'>
          <span
            title={name}
            className='truncate text-sm font-semibold text-fg transition-colors duration-150 group-hover:text-accent'
          >
            {name}
          </span>
          {secondary !== null
            ? (
              <span title={secondary} className='truncate text-xs text-muted'>
                {secondary}
              </span>
            )
            : null}
          {meta !== null
            ? (
              <span title={meta} className='mt-0.5 truncate text-xs text-faint'>
                {meta}
              </span>
            )
            : null}
          {hasFooter
            ? (
              <span className='mt-auto flex items-baseline justify-between gap-2 pt-1.5'>
                {tag !== null
                  ? (
                    <span className='rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'>
                      {tag}
                    </span>
                  )
                  : null}
                {stat !== null
                  ? (
                    <span
                      title={stat}
                      className='ml-auto truncate text-xs font-semibold tabular-nums text-gold'
                    >
                      {stat}
                    </span>
                  )
                  : null}
              </span>
            )
            : null}
        </span>
      </Link>
    </li>
  );
}
