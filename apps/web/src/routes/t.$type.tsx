/**
 * `/t/<type>` — every entity of one type, localized names, linking
 * to the entity pages.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { type JSX } from 'react';
import { fetchTypeList } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from './__root';

export const Route = createFileRoute('/t/$type')({
  loader: async ({ context, params }) => {
    const view = await fetchTypeList({
      data: { locale: context.locale, type: params.type },
    });
    if (view === null) throw notFound();
    return view;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.label ?? 'Archive'} — Grand Line Archives` }],
  }),
  component: TypeListPage,
});

function TypeListPage(): JSX.Element {
  const view = Route.useLoaderData();
  const locale = useLocale();
  return (
    <div className='mx-auto max-w-3xl'>
      <header className='mb-8'>
        <h1 className='font-display text-3xl font-semibold tracking-tight text-fg'>
          {view.label}
        </h1>
        <p className='mt-1.5 text-sm text-faint'>
          <span className='font-mono text-gold'>{view.items.length}</span>{' '}
          {t(locale, view.items.length === 1 ? 'entry' : 'entries')}
        </p>
      </header>
      {view.items.length === 0
        ? (
          <p className='rounded-xl border border-line bg-panel p-6 text-muted'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ul className='divide-y divide-line/60 overflow-hidden rounded-xl border border-line bg-panel'>
            {view.items.map((item) => (
              <li key={item.slug}>
                <Link
                  to='/e/$type/$slug'
                  params={{ type: view.type, slug: item.slug }}
                  className='group flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-panel-2'
                >
                  <span className='font-medium text-fg transition-colors group-hover:text-gold'>
                    {item.name}
                  </span>
                  {item.subtitle !== null
                    ? (
                      <span className='hidden shrink-0 text-xs text-faint sm:block'>
                        {t(locale, 'since')} {item.subtitle}
                      </span>
                    )
                    : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
