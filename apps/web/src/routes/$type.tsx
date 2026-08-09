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
      <header className='mb-8'>
        <h1 className='font-display text-[clamp(2rem,4vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.02em] text-fg'>
          {view.label}
        </h1>
        <p className='mt-1.5 text-sm text-faint'>
          <span className='tabular-nums'>{view.items.length}</span>{' '}
          {t(locale, view.items.length === 1 ? 'entry' : 'entries')}
        </p>
      </header>
      {view.items.length === 0
        ? (
          <p className='border-t border-line-strong pt-4 text-muted'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ul className='divide-y divide-line border-t border-line-strong'>
            {view.items.map((item) => (
              <li key={item.slug}>
                <Link
                  to='/$type/$slug'
                  params={{ type: view.type, slug: item.slug }}
                  search={search}
                  className='group flex items-baseline justify-between gap-4 py-2.5'
                >
                  <span className='font-medium text-accent transition-colors duration-150 group-hover:text-accent-hover group-hover:underline group-hover:underline-offset-2'>
                    {item.name}
                  </span>
                  {item.subtitle !== null
                    ? (
                      <span className='hidden shrink-0 text-xs tabular-nums text-faint sm:block'>
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
