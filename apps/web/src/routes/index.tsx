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
      <section className='py-10 sm:py-16'>
        <h1 className='font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl'>
          {t(locale, 'siteName')}
        </h1>
        <p className='mt-4 max-w-xl text-lg text-muted'>{t(locale, 'tagline')}</p>
        <p className='mt-2 text-sm text-faint'>
          <span className='font-mono text-gold'>{view.totalEntities}</span>{' '}
          {t(locale, 'entitiesIndexed')}
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
    <div>
      <h2 className='mb-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint'>
        {group.id.replace(/-/g, ' ')}
      </h2>
      <ul className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {group.types.map((type) => (
          <li key={type.id}>
            <Link
              to='/$type'
              params={{ type: type.id }}
              className='group flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-gold/50 hover:bg-panel-2'
            >
              <span className='font-medium text-fg transition-colors group-hover:text-gold'>
                {type.label}
              </span>
              <span className='rounded-full bg-canvas px-2 py-0.5 font-mono text-xs text-muted'>
                {type.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
