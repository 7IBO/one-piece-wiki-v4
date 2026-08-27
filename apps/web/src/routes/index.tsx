/**
 * Home — the entry to the databank: every entity type as an art plate
 * carrying its own generated composition (the type id seeds both the
 * grammar and the colour chord, so the "Characters" plate is figure
 * art and the "Chapters" plate is comic panels), the schema group as
 * its overline, and its population count.
 *
 * ONE dense wall rather than a section per group: the groups come from
 * the schema (`ui_hint.group`) and most hold a single type, so a grid
 * per group would leave three quarters of every row empty. The group
 * still orders the wall and labels each plate, so the structure reads
 * without the holes. Nothing here knows a type id.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, type JSX } from 'react';
import { fetchHome, type TypeGroup } from '../api';
import { EntityArt } from '../components/EntityArt';
import { t } from '../lib/chrome';
import { entityTint } from '../lib/entity-tint';
import { useLocale } from './__root';

export const Route = createFileRoute('/')({
  loader: ({ context }) => fetchHome({ data: { locale: context.locale } }),
  component: HomePage,
});

function HomePage(): JSX.Element {
  const view = Route.useLoaderData();
  const locale = useLocale();
  // Flattened in group order: the grouping is information (it labels
  // each plate and orders the wall) but must not fragment the grid.
  const plates = view.groups.flatMap((group) =>
    group.types.map((type) => ({ group: group.id, type }))
  );
  return (
    <div className='page-column pt-8 sm:pt-10'>
      <header className='mb-7'>
        <p className='label-xs text-gold'>{t(locale, 'tagline')}</p>
        <h1 className='display mt-2 text-[clamp(2rem,5.6vw,3.6rem)] font-extrabold uppercase leading-[0.95] text-fg'>
          {t(locale, 'browseByType')}
        </h1>
        <p className='mt-2 text-sm text-muted'>
          <span className='font-semibold tabular-nums text-gold'>{view.totalEntities}</span>{' '}
          {t(locale, 'entitiesIndexed')}
        </p>
      </header>
      <ul className='grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {plates.map(({ group, type }) => <TypePlate key={type.id} group={group} type={type} />)}
      </ul>
    </div>
  );
}

function TypePlate(
  { group, type }: {
    readonly group: string;
    readonly type: TypeGroup['types'][number];
  },
): JSX.Element {
  // The type's OWN id seeds its plate, so every plate on the page is a
  // different colour and a different visual family.
  const seed = `${type.id}:index`;
  const tint = entityTint(seed);
  return (
    <li style={tint.vars as CSSProperties}>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='motion-lift group relative block aspect-4/3 overflow-hidden rounded-lg ring-1 ring-line-strong transition-shadow hover:ring-2 hover:ring-[color:var(--tint-accent)]'
      >
        <EntityArt
          entityId={seed}
          entityType={type.id}
          ratio='wide'
          initial={type.label.slice(0, 1).toUpperCase()}
          className='absolute inset-0 size-full transition-transform duration-500 ease-out group-hover:scale-[1.07]'
        />
        <span
          aria-hidden
          className='absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-canvas via-canvas/70 to-transparent'
        />
        <span className='absolute inset-x-0 bottom-0 block p-3'>
          <span className='label-xs block truncate text-fg/55'>{group.replace(/-/g, ' ')}</span>
          <span className='flex items-end justify-between gap-2'>
            <span className='display min-w-0 truncate text-[15px] font-extrabold uppercase leading-tight text-fg transition-colors duration-150 group-hover:text-[color:var(--tint-accent)]'>
              {type.label}
            </span>
            <span className='display shrink-0 text-[13px] font-extrabold tabular-nums text-gold'>
              {type.count}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
