/**
 * Home — the collection at a glance: entity types grouped by their
 * schema `ui_hint.group`, each type a compact link module (initial
 * tile + label + count) linking to the per-type listing.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX } from 'react';
import { fetchHome, type TypeGroup } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from './__root';

export const Route = createFileRoute('/')({
  loader: ({ context }) => fetchHome({ data: { locale: context.locale } }),
  component: HomePage,
});

function HomePage(): JSX.Element {
  const view = Route.useLoaderData();
  const locale = useLocale();
  return (
    <div>
      <header className='mb-7'>
        <h1 className='display text-[clamp(1.6rem,3.6vw,2.4rem)] font-extrabold leading-[1.05] text-fg'>
          {t(locale, 'browseByType')}
        </h1>
        <p className='mt-1.5 text-sm text-muted'>
          {t(locale, 'tagline')} ·{' '}
          <span className='font-semibold tabular-nums text-gold'>
            {view.totalEntities}
          </span>{' '}
          {t(locale, 'entitiesIndexed')}
        </p>
      </header>
      {
        /* Masonry columns: small groups pack side by side, no sparse
          single-column stack. */
      }
      <div className='gap-6 min-[560px]:columns-2 lg:columns-3'>
        {view.groups.map((group) => <GroupSection key={group.id} group={group} />)}
      </div>
    </div>
  );
}

function GroupSection({ group }: { readonly group: TypeGroup; }): JSX.Element {
  return (
    <section className='mb-6 break-inside-avoid'>
      <h2 className='label-xs mb-2.5'>{group.id.replace(/-/g, ' ')}</h2>
      <ul className='grid grid-cols-1 gap-2'>
        {group.types.map((type) => <TypeModule key={type.id} type={type} />)}
      </ul>
    </section>
  );
}

function TypeModule({ type }: { readonly type: TypeGroup['types'][number]; }): JSX.Element {
  return (
    <li>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='group flex items-center gap-3 rounded-md p-1.5 pr-3 ring-1 ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface hover:ring-line-strong'
      >
        <span
          aria-hidden
          className='display grid size-10 shrink-0 select-none place-items-center rounded-[5px] bg-surface text-lg font-bold text-gold/60 ring-1 ring-line ring-inset'
        >
          {type.label.slice(0, 1).toUpperCase()}
        </span>
        <span className='min-w-0 flex-1 truncate text-sm font-semibold text-fg transition-colors duration-150 group-hover:text-accent'>
          {type.label}
        </span>
        <span className='shrink-0 text-xs font-medium tabular-nums text-faint'>
          {type.count}
        </span>
      </Link>
    </li>
  );
}
