/**
 * « Explorer l'univers » — every entity type as a plate carrying its
 * own generated composition. The label sits INSIDE the tile, the count
 * BELOW it, outside: that is the plate's object, and putting both
 * inside a gradient scrim made a different one.
 */
import { Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactElement } from 'react';
import type { TypeGroup } from '../../api';
import { t } from '../../lib/chrome';
import { entityTint } from '../../lib/entity-tint';
import { useLocale } from '../../routes/__root';
import { EntityImage } from '../EntityImage';
import { SectionTitle } from './SectionTitle';

export function Explore({ groups }: { readonly groups: readonly TypeGroup[]; }): ReactElement {
  const locale = useLocale();
  const types = groups.flatMap((g) => g.types);
  return (
    <section className='mt-3.5 lg:col-span-12'>
      <SectionTitle>{t(locale, 'homeExplore')}</SectionTitle>
      <ul className='mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8'>
        {types.map((type) => <TypeTile key={type.id} type={type} />)}
      </ul>
    </section>
  );
}

/**
 * The label sits INSIDE the tile, bottom-left; the count sits BELOW
 * it, outside, in muted tabular figures. The earlier version put both
 * inside under a gradient scrim, which is a different object.
 */
export function TypeTile({ type }: { readonly type: TypeGroup['types'][number]; }): ReactElement {
  const seed = `${type.id}:index`;
  const tint = entityTint(seed);
  return (
    <li style={tint.vars as CSSProperties}>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='group block no-underline'
      >
        <span className='motion-lift relative block overflow-hidden rounded-md ring-1 ring-line transition-shadow hover:ring-[color:var(--tint-accent)]'>
          <EntityImage
            image={null}
            type={type.id}
            slug='index'
            name={type.label}
            ratio='wide'
            className='w-full transition-transform duration-500 ease-out group-hover:scale-[1.06]'
          />
          <span
            aria-hidden
            className='absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent'
          />
          <span className='absolute bottom-2.5 left-2.75 right-2.5 line-clamp-2 text-[13.5px] font-bold leading-tight text-white'>
            {type.label}
          </span>
        </span>
        <span className='mt-1.25 block text-[11px] tabular-nums text-muted'>{type.count}</span>
      </Link>
    </li>
  );
}
