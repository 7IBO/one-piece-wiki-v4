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
import { EntityImage } from '../components/EntityImage';
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
    <div>
      <header className='mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <h1 className='font-display text-[clamp(1.75rem,3.5vw,2.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-fg'>
          {view.label}
        </h1>
        <p className='text-sm text-faint'>
          <span className='tabular-nums'>{view.items.length}</span>{' '}
          {t(locale, view.items.length === 1 ? 'entry' : 'entries')}
        </p>
      </header>
      {view.items.length === 0
        ? (
          <p className='rounded-lg bg-surface px-5 py-4 text-muted ring-1 ring-inset ring-line'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ul className='grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]'>
            {view.items.map((item) => (
              <li key={item.slug}>
                <Link
                  to='/$type/$slug'
                  params={{ type: view.type, slug: item.slug }}
                  search={search}
                  className='group block h-full rounded-lg bg-surface p-2 ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface-2 hover:ring-line-strong'
                >
                  <EntityImage
                    image={null}
                    name={item.name}
                    ratio='portrait'
                    className='w-full rounded-md'
                    monogramClassName='text-4xl'
                  />
                  <span className='mt-2 block truncate px-1 text-sm font-semibold text-fg transition-colors duration-150 group-hover:text-accent'>
                    {item.name}
                  </span>
                  <span className='mb-1 block truncate px-1 text-xs tabular-nums text-faint'>
                    {item.subtitle !== null ? `${t(locale, 'since')} ${item.subtitle}` : ' '}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
