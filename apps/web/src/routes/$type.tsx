/**
 * `/<type>` — the collection view (the entity TYPE ID is the URL
 * segment: `/character`, `/crew`, …). A wall of artwork in the manner
 * of a franchise databank roster: every entity is a full art tile with
 * its name over the composition, each tile in its own colour (ADR-103),
 * filtered by facets DERIVED FROM THE SCHEMA.
 *
 * The facets come from the view model (`buildFacets`, `server/views.ts`)
 * — any declared enum property that actually splits the population — so
 * nothing here knows a property id and a type with no enum property
 * simply renders no filter bar. Filtering is client-side over an
 * already spoiler-checked list: no refetch, no flash, and the counts
 * stay honest because they were computed server-side against the same
 * cursor.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { type EntityListItem, type FacetView, fetchTypeList } from '../api';
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

/** Selected value per facet id; a missing key means "all". */
type Selection = Readonly<Record<string, string>>;

function matches(item: EntityListItem, selection: Selection): boolean {
  return Object.entries(selection).every(([facetId, value]) => item.facets[facetId] === value);
}

function TypeListPage(): ReactElement {
  const view = Route.useLoaderData();
  const { scope } = Route.useSearch();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection>({});

  const items = useMemo(
    () => view.items.filter((item) => matches(item, selection)),
    [view.items, selection],
  );

  const toggle = (facetId: string, value: string): void => {
    setSelection((current) => {
      const next = { ...current };
      if (next[facetId] === value) delete next[facetId];
      else next[facetId] = value;
      return next;
    });
  };

  return (
    <div className='page-column pt-8 sm:pt-10'>
      <header className='mb-6'>
        <h1 className='display text-[clamp(1.9rem,5vw,3.2rem)] font-extrabold uppercase leading-[0.95] text-fg'>
          {view.label}
        </h1>
        <p className='mt-1.5 text-sm text-faint'>
          <span className='font-semibold tabular-nums text-fg'>{items.length}</span>{' '}
          {t(locale, items.length === 1 ? 'entry' : 'entries')}
          {items.length !== view.items.length ? ` / ${view.items.length}` : ''}
        </p>
      </header>

      {view.facets.length > 0
        ? (
          <div className='mb-7 space-y-2.5 border-y border-line py-3.5'>
            {view.facets.map((facet) => (
              <FacetRow
                key={facet.id}
                facet={facet}
                selected={selection[facet.id] ?? null}
                onToggle={(value) => toggle(facet.id, value)}
              />
            ))}
          </div>
        )
        : null}

      {items.length === 0
        ? (
          <p className='rounded-md px-4 py-3 text-muted ring-1 ring-line'>
            {t(locale, 'emptyType')}
          </p>
        )
        : (
          <ScopeContext.Provider value={scope ?? null}>
            <CardGrid>
              {items.map((item) => (
                <EntityCard
                  key={item.slug}
                  type={view.type}
                  slug={item.slug}
                  image={item.image}
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

function FacetRow(
  { facet, selected, onToggle }: {
    readonly facet: FacetView;
    readonly selected: string | null;
    readonly onToggle: (value: string) => void;
  },
): ReactElement {
  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1.5'>
      <span className='label-xs w-full min-[560px]:w-24 min-[560px]:shrink-0'>{facet.label}</span>
      {facet.options.map((option) => {
        const active = selected === option.value;
        return (
          <button
            key={option.value}
            type='button'
            aria-pressed={active}
            onClick={() => onToggle(option.value)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ${
              active
                ? 'bg-gold text-canvas'
                : 'text-muted ring-1 ring-line hover:bg-surface hover:text-fg'
            }`}
          >
            {option.label}
            <span className='ml-1.5 tabular-nums opacity-60'>{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}
