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
      <section className='py-8 sm:py-20'>
        <p className='mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted'>
          <span aria-hidden className='size-1.5 rounded-full bg-accent' />
          <span className='font-mono text-fg'>{view.totalEntities}</span>
          {t(locale, 'entitiesIndexed')}
        </p>
        <h1 className='max-w-3xl font-display text-[clamp(2.75rem,7vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.04em] text-fg'>
          {t(locale, 'siteName')}
        </h1>
        <p className='mt-5 max-w-xl text-lg leading-relaxed text-muted'>
          {t(locale, 'tagline')}
        </p>
      </section>
      <section aria-label={t(locale, 'browseByType')} className='space-y-12 pb-12'>
        {view.groups.map((group) => <TypeGroupSection key={group.id} group={group} />)}
      </section>
    </div>
  );
}

function TypeGroupSection({ group }: { readonly group: TypeGroup; }): JSX.Element {
  return (
    <div>
      <h2 className='mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint'>
        {group.id.replace(/-/g, ' ')}
      </h2>
      <ul className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {group.types.map((type) => (
          <li key={type.id}>
            <Link
              to='/$type'
              params={{ type: type.id }}
              className='group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-line-strong hover:bg-surface-2'
            >
              <span className='font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
                {type.label}
              </span>
              <span className='rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-muted'>
                {type.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
