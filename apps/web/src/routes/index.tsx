/**
 * Home — the archive at a glance: entity types grouped by their
 * schema `ui_hint.group`, with entry counts, linking to per-type
 * listings.
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
      <section className='pb-8 pt-2 sm:pb-10 sm:pt-4'>
        <h1 className='font-display text-[clamp(2rem,4.5vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-fg'>
          {t(locale, 'siteName')}
        </h1>
        <p className='mt-2 max-w-xl text-base leading-relaxed text-muted'>
          {t(locale, 'tagline')} —{' '}
          <span className='tabular-nums text-fg'>{view.totalEntities}</span>{' '}
          {t(locale, 'entitiesIndexed')}
        </p>
      </section>
      <section aria-label={t(locale, 'browseByType')} className='pb-8'>
        <ul className='grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
          {view.groups.flatMap((group) =>
            group.types.map((type) => <TypeCard key={type.id} groupId={group.id} type={type} />)
          )}
        </ul>
      </section>
    </div>
  );
}

function TypeCard(
  { groupId, type }: { readonly groupId: string; readonly type: TypeGroup['types'][number]; },
): JSX.Element {
  return (
    <li>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='group flex h-full items-center gap-3.5 rounded-lg bg-surface p-3 ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface-2 hover:ring-line-strong'
      >
        <span
          aria-hidden
          className='grid size-12 shrink-0 select-none place-items-center rounded-md bg-surface-2 font-display text-xl font-semibold text-gold/40 ring-1 ring-inset ring-line'
        >
          {type.label.slice(0, 1).toUpperCase()}
        </span>
        <span className='min-w-0 leading-snug'>
          <span className='block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
            {groupId.replace(/-/g, ' ')}
          </span>
          <span className='block truncate text-sm font-semibold text-fg transition-colors duration-150 group-hover:text-accent'>
            {type.label}
          </span>
          <span className='block text-xs tabular-nums text-faint'>{type.count}</span>
        </span>
      </Link>
    </li>
  );
}
