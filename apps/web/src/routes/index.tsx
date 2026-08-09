/**
 * Home — the archive's table of contents, set like the index page of
 * an almanac: entity types grouped by their schema `ui_hint.group`,
 * each group a ruled column section, each type a dot-leader row
 * (label … count) linking to the per-type listing.
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
      <header className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-strong pb-2.5'>
        <h1 className='font-display text-[clamp(1.6rem,3.4vw,2.3rem)] font-semibold leading-tight tracking-[0.005em] text-fg'>
          {t(locale, 'browseByType')}
        </h1>
        <p className='overline-label'>
          <span className='tabular-nums text-fg'>{view.totalEntities}</span>{' '}
          {t(locale, 'entitiesIndexed')}
        </p>
      </header>
      {/* The index: ruled columns, dot-leader rows. */}
      <section
        aria-label={t(locale, 'browseByType')}
        className='gap-10 pt-5 min-[560px]:columns-2 min-[900px]:columns-3 [column-rule:1px_solid_var(--color-line)]'
      >
        {view.groups.map((group) => <GroupIndex key={group.id} group={group} />)}
      </section>
    </div>
  );
}

function GroupIndex({ group }: { readonly group: TypeGroup; }): JSX.Element {
  return (
    <section className='mb-7 break-inside-avoid'>
      <h2 className='overline-label border-b border-line-strong pb-1.5'>
        {group.id.replace(/-/g, ' ')}
      </h2>
      <ul>
        {group.types.map((type) => <TypeRow key={type.id} type={type} />)}
      </ul>
    </section>
  );
}

function TypeRow({ type }: { readonly type: TypeGroup['types'][number]; }): JSX.Element {
  return (
    <li className='border-b border-line'>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='group flex items-baseline py-[7px]'
      >
        <span className='min-w-0 truncate font-display text-[15px] font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
          {type.label}
        </span>
        <span aria-hidden className='leaders' />
        <span className='shrink-0 text-xs tabular-nums text-faint transition-colors duration-150 group-hover:text-muted'>
          {type.count}
        </span>
      </Link>
    </li>
  );
}
