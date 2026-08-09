/**
 * The ONE entity unit for people/things in grids, set as a NEWSPAPER
 * PHOTO BLOCK (WEB_APP.md § Identity): rectangular 3:4 photo (or the
 * monogram plate), hairline frame, then a caption stack — name in the
 * display serif, epithet in italic serif, role/meta in the small-cap
 * data voice, an optional status mark and right-aligned figure
 * (bounty…). Blocks sit in a tight lattice whose 1px frames collapse
 * into shared rules — a contact sheet, not floating cards. Purely
 * presentational: every string arrives spoiler-checked from the
 * server view models. Long values truncate with a `title` tooltip.
 */
import { Link } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import type { ImageView } from '../api';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/**
 * The lattice: left-packed wrap of fixed ~150px blocks (2-up on
 * phones); adjacent 1px frames overlap via negative margins so every
 * interior rule reads as a single hairline.
 */
export function CardGrid({ children }: { readonly children: ReactNode; }): JSX.Element {
  return (
    <ul className='flex flex-wrap pl-px pt-px'>
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
    /** Small caps status mark (when not the unremarkable default). */
    readonly tag?: string | null;
    /** Right-aligned figure (bounty…). */
    readonly stat?: string | null;
  },
): JSX.Element {
  const search = useScopeSearch();
  const hasFooter = tag !== null || stat !== null;
  return (
    <li className='-ml-px -mt-px w-[calc(50%+1px)] border border-line min-[480px]:w-[150px]'>
      <Link
        to='/$type/$slug'
        params={{ type, slug }}
        search={search}
        className='group flex h-full flex-col bg-canvas transition-colors duration-150 hover:bg-surface'
      >
        <EntityImage
          image={image}
          name={name}
          ratio='portrait'
          className='w-full border-b border-line'
          monogramClassName='text-4xl'
        />
        <span className='flex min-w-0 flex-1 flex-col px-2 pb-2 pt-1.5'>
          <span
            title={name}
            className='truncate font-display text-[13.5px] font-semibold leading-snug text-fg transition-colors duration-150 group-hover:text-accent'
          >
            {name}
          </span>
          {secondary !== null
            ? (
              <span title={secondary} className='truncate font-serif text-xs italic text-muted'>
                {secondary}
              </span>
            )
            : null}
          {meta !== null
            ? (
              <span
                title={meta}
                className='mt-0.5 truncate text-[10px] font-medium tracking-[0.02em] text-faint'
              >
                {meta}
              </span>
            )
            : null}
          {hasFooter
            ? (
              <span className='mt-auto flex items-baseline justify-between gap-2 pt-1.5'>
                {tag !== null
                  ? (
                    <span className='truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted'>
                      {tag}
                    </span>
                  )
                  : null}
                {stat !== null
                  ? (
                    <span
                      title={stat}
                      className='ml-auto shrink-0 truncate text-[11px] font-semibold tabular-nums text-gold'
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
