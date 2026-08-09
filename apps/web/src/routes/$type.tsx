/**
 * `/<type>` — canonical type listing (the entity TYPE ID is the URL
 * segment: `/character`, `/crew`, …). Every entity of the type as a
 * rich entity card: localized name, a type-appropriate second line
 * (character epithet, chapter release date, platform kind…), the
 * first-appearance meta line and a status micro-tag when notable —
 * all spoiler-checked server-side against the reader's cursor. The
 * type is validated server-side against the schema catalogue inside
 * `fetchTypeList` (unknown type → null → notFound). An optional
 * `?scope=` canon-scope param is kept and propagated to entity links.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { type JSX } from 'react';
import { fetchTypeList } from '../api';
import { CardGrid, EntityCard } from '../components/EntityCard';
import { ScopeContext } from '../components/EntityChip';
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
          <ScopeContext.Provider value={scope ?? null}>
            <CardGrid>
              {view.items.map((item) => (
                <EntityCard
                  key={item.slug}
                  type={view.type}
                  slug={item.slug}
                  image={null}
                  name={item.name}
                  secondary={item.secondary}
                  meta={item.subtitle !== null ? `${t(locale, 'since')} ${item.subtitle}` : null}
                  tag={item.tag}
                />
              ))}
            </CardGrid>
          </ScopeContext.Provider>
        )}
    </div>
  );
}
