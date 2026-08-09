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
      <section className='py-6 sm:py-12'>
        <h1 className='max-w-3xl font-display text-[clamp(2.5rem,6vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.02em] text-fg'>
          {t(locale, 'siteName')}
        </h1>
        <p className='mt-4 max-w-xl text-lg leading-relaxed text-muted'>
          {t(locale, 'tagline')}
        </p>
        <p className='mt-2 text-sm text-faint'>
          <span className='tabular-nums'>{view.totalEntities}</span> {t(locale, 'entitiesIndexed')}
        </p>
      </section>
      <section aria-label={t(locale, 'browseByType')} className='space-y-10 pb-10'>
        {view.groups.map((group) => <TypeGroupSection key={group.id} group={group} />)}
      </section>
    </div>
  );
}

function TypeGroupSection({ group }: { readonly group: TypeGroup; }): JSX.Element {
  return (
    <div className='border-t border-line-strong pt-3'>
      <h2 className='text-[11px] font-semibold uppercase tracking-[0.14em] text-faint'>
        {group.id.replace(/-/g, ' ')}
      </h2>
      <ul className='mt-1 sm:columns-2 sm:gap-x-16'>
        {group.types.map((type) => (
          <li key={type.id} className='break-inside-avoid border-b border-line'>
            <Link
              to='/$type'
              params={{ type: type.id }}
              className='group flex items-baseline justify-between gap-4 py-2.5'
            >
              <span className='font-medium text-accent transition-colors duration-150 group-hover:text-accent-hover group-hover:underline group-hover:underline-offset-2'>
                {type.label}
              </span>
              <span className='text-sm tabular-nums text-faint'>
                {type.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
