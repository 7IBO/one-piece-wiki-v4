/**
 * `/<type>` — canonical type listing (the entity TYPE ID is the URL
 * segment: `/character`, `/crew`, …). Every entity of the type, with
 * localized names, linking to the canonical entity pages. The type is
 * validated server-side against the schema catalogue inside
 * `fetchTypeList` (unknown type → null → notFound). An optional
 * `?scope=` canon-scope param is kept and propagated to entity links.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { type JSX } from 'react';
import { fetchTypeList } from '../api';
import { t } from '../lib/chrome';
import { validateScopeSearch } from '../lib/scope';
import { useLocale } from './__root';

export const Route = createFileRoute('/$type')({
  validateSearch: validateScopeSearch,
  loader: async ({ context, params }) => {
    const view = await fetchTypeList({
      data: { locale: context.locale, type: params.type },
    });
    if (view === null) throw notFound();
    return view;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.label ?? 'Wiki'} — One Piece Wiki` }],
  }),
  component: TypeListPage,
});

function TypeListPage(): JSX.Element {
  const view = Route.useLoaderData();
  const { scope } = Route.useSearch();
  const locale = useLocale();
  const search = scope === undefined ? {} : { scope };
  return (
    <div className='mx-auto max-w-3xl'>
      <header className='mb-10'>
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-2'>
          <h1 className='font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-fg'>
            {view.label}
          </h1>
          <span className='rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs text-muted'>
            {view.items.length} {t(locale, view.items.length === 1 ? 'entry' : 'entries')}
          </span>
        </div>
      </header>
      {view.items.length === 0
        ? (
          <p className='rounded-xl border border-line bg-surface p-6 text-muted'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ul className='divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface'>
            {view.items.map((item) => (
              <li key={item.slug}>
                <Link
                  to='/$type/$slug'
                  params={{ type: view.type, slug: item.slug }}
                  search={search}
                  className='group flex items-baseline justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-surface-2'
                >
                  <span className='font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
                    {item.name}
                  </span>
                  {item.subtitle !== null
                    ? (
                      <span className='hidden shrink-0 font-mono text-xs text-faint sm:block'>
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
