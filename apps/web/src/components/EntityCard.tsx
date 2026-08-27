/**
 * The art tile — the unit a collection is made of (WEB_APP.md
 * § Identity, ADR-103). The composition fills the whole tile; the name
 * and its identity line sit ON the artwork under a scrim, the way a
 * franchise databank presents its roster. Nothing is a thumbnail
 * beside a label.
 *
 * Motion is the finish: the tile lifts, its artwork scales inside the
 * frame, and the ring takes the entity's colour. Everything is CSS on
 * `:hover`, so there is no state, no JS and no behaviour to test — and
 * `.motion-lift` is cancelled wholesale under `prefers-reduced-motion`.
 * Nothing INFORMATIVE is hidden behind hover: role, period and status
 * are always on screen, because a touch reader never hovers.
 *
 * Purely presentational: every string arrives spoiler-checked from the
 * server view models. `dimmed` marks ended states (former members):
 * subdued, but fully present and clickable.
 */
import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { ImageView } from '../api';
import { entityTint } from '../lib/entity-tint';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/** Left-packed responsive tile grid. Tiles are big — the art must read. */
export const CARD_GRID_CLASS =
  'grid grid-cols-2 gap-3 min-[520px]:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] min-[520px]:gap-4';

export function CardGrid({ children }: { readonly children: ReactNode; }): ReactElement {
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
    /** Small status tag (former, dead…). */
    readonly tag?: string | null;
    /** Headline figure (bounty…), laid over the artwork. */
    readonly stat?: string | null;
    /** Ended state (former member…): subdued, still present. */
    readonly dimmed?: boolean;
  },
): ReactElement {
  const search = useScopeSearch();
  const tint = entityTint(`${type}:${slug}`);
  return (
    <li style={tint.vars as CSSProperties}>
      <Link
        to='/$type/$slug'
        params={{ type, slug }}
        search={search}
        className='motion-lift group block overflow-hidden rounded-lg ring-1 ring-line-strong transition-shadow hover:ring-2 hover:ring-[color:var(--tint-accent)]'
      >
        <span className='relative block'>
          <EntityImage
            image={image}
            type={type}
            slug={slug}
            name={name}
            ratio='portrait'
            className={`w-full transition-transform duration-500 ease-out group-hover:scale-[1.06] ${
              dimmed ? 'opacity-60 group-hover:opacity-90' : ''
            }`}
          />
          {
            /* Scrim: the caption's legibility does not depend on which
              composition the generator produced. */
          }
          <span
            aria-hidden
            className='absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-canvas via-canvas/75 to-transparent'
          />
          {tag !== null
            ? (
              <span className='absolute left-2 top-2 rounded-sm bg-canvas/80 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-fg'>
                {tag}
              </span>
            )
            : null}
          <span className='absolute inset-x-0 bottom-0 block p-2.5'>
            {stat !== null
              ? (
                <span
                  title={stat}
                  className='display mb-0.5 block truncate text-[13px] font-extrabold tabular-nums text-gold'
                >
                  {stat}
                </span>
              )
              : null}
            <span
              title={name}
              className='display block truncate text-[15px] font-extrabold leading-tight text-fg transition-colors duration-150 group-hover:text-[color:var(--tint-accent)]'
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
            {meta !== null
              ? (
                <span
                  title={meta}
                  className='mt-0.5 block truncate text-[10.5px] text-faint'
                >
                  {meta}
                </span>
              )
              : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
