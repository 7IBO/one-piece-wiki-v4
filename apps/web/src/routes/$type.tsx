/**
 * `/<type>` — canonical type listing (the entity TYPE ID is the URL
 * segment: `/character`, `/crew`, …), set like an almanac INDEX:
 * ruled columns of compact entry rows — localized name in the display
 * serif, a type-appropriate identity line in italic serif (character
 * epithet, chapter release date, platform kind…), the
 * first-appearance meta and a small-cap status mark when notable —
 * all spoiler-checked server-side against the reader's cursor. The
 * type is validated server-side against the schema catalogue inside
 * `fetchTypeList` (unknown type → null → notFound). An optional
 * `?scope=` canon-scope param is kept and propagated to entity links.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { type JSX } from 'react';
import { fetchTypeList, type TypeListView } from '../api';
import { ScopeContext, useScopeSearch } from '../components/EntityChip';
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
  return (
    <div>
      <header className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-strong pb-2.5'>
        <h1 className='font-display text-[clamp(1.6rem,3.4vw,2.3rem)] font-semibold leading-tight tracking-[0.005em] text-fg'>
          {view.label}
        </h1>
        <p className='overline-label'>
          <span className='tabular-nums text-fg'>{view.items.length}</span>{' '}
          {t(locale, view.items.length === 1 ? 'entry' : 'entries')}
        </p>
      </header>
      {view.items.length === 0
        ? (
          <p className='mt-6 border-b border-line pb-4 font-serif text-[15px] italic text-muted'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ScopeContext.Provider value={scope ?? null}>
            <ul className='gap-10 pt-4 min-[640px]:columns-2 min-[1000px]:columns-3 [column-rule:1px_solid_var(--color-line)]'>
              {view.items.map((item) => <IndexRow key={item.slug} type={view.type} item={item} />)}
            </ul>
          </ScopeContext.Provider>
        )}
    </div>
  );
}

function IndexRow(
  { type, item }: { readonly type: string; readonly item: TypeListView['items'][number]; },
): JSX.Element {
  const locale = useLocale();
  const search = useScopeSearch();
  return (
    <li className='break-inside-avoid border-b border-line'>
      <Link
        to='/$type/$slug'
        params={{ type, slug: item.slug }}
        search={search}
        className='group block py-[7px]'
      >
        <span className='flex items-baseline gap-2'>
          <span className='min-w-0 truncate'>
            <span className='font-display text-[15px] font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
              {item.name}
            </span>
            {item.secondary !== null
              ? (
                <span className='font-serif text-[13px] italic text-muted'>
                  {' '}— {item.secondary}
                </span>
              )
              : null}
          </span>
          {item.tag !== null
            ? (
              <span className='ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint'>
                {item.tag}
              </span>
            )
            : null}
        </span>
        {item.subtitle !== null
          ? (
            <span className='block text-[10px] font-medium tracking-[0.02em] text-faint'>
              {t(locale, 'since')} {item.subtitle}
            </span>
          )
          : null}
      </Link>
    </li>
  );
}
