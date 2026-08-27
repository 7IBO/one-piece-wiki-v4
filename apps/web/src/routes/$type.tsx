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
 *
 * ## Ordered types read in their order
 *
 * A type that declares an ordinal (`number`, `arc_number`, …) arrives
 * sorted by it, and the listing offers A–Z as the ALTERNATIVE rather
 * than the default. Alphabetical was the only order until the corpus
 * grew: with 400 episodes it put "A Man's Oath Never Dies" first and
 * left no way to reach episode 250.
 *
 * ## Long lists are paged, and say so
 *
 * Four hundred art tiles is not a page, it is a download. The listing
 * renders a window and grows it on demand — and the count above always
 * describes the WHOLE filtered set, never the window, so the number
 * never contradicts what "load more" implies.
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

/** Tiles rendered before the reader asks for more. */
const PAGE = 60;

function TypeListPage(): ReactElement {
  const view = Route.useLoaderData();
  const { scope } = Route.useSearch();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection>({});
  const [alphabetical, setAlphabetical] = useState(false);
  const [shown, setShown] = useState(PAGE);

  // Does this type HAVE an order? Asked of the data, not of a list of
  // type ids — so the control appears for any ordered type and never
  // for a character.
  const ordered = view.items.some((item) => item.ordinal !== null);

  const items = useMemo(() => {
    const filtered = view.items.filter((item) => matches(item, selection));
    if (!alphabetical) return filtered;
    // `filter` already returned a fresh array; copying it again to
    // sort was pure waste (react-doctor, js-tosorted-immutable).
    return filtered.toSorted((a, b) => a.name.localeCompare(b.name));
  }, [view.items, selection, alphabetical]);

  const visible = items.slice(0, shown);

  const toggle = (facetId: string, value: string): void => {
    setSelection((current) => {
      const next = { ...current };
      if (next[facetId] === value) delete next[facetId];
      else next[facetId] = value;
      return next;
    });
    // A new filter is a new list: keep the window at the top rather
    // than stranding the reader deep inside a set they just changed.
    setShown(PAGE);
  };

  return (
    <div className='page-column pt-8 sm:pt-10'>
      <header className='mb-6'>
        <h1 className='display text-[clamp(1.9rem,5vw,3.2rem)] font-extrabold uppercase leading-[0.95] text-fg'>
          {view.label}
        </h1>
        <div className='mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2'>
          <p className='text-sm text-faint'>
            {/* Always the WHOLE filtered set, never the window. */}
            <span className='font-semibold tabular-nums text-fg'>{items.length}</span>{' '}
            {t(locale, items.length === 1 ? 'entry' : 'entries')}
            {items.length !== view.items.length ? ` / ${view.items.length}` : ''}
          </p>
          {ordered && (
            <div className='flex items-center gap-1'>
              <SortButton
                active={!alphabetical}
                label={t(locale, 'listSortOrdinal')}
                onClick={() => setAlphabetical(false)}
              />
              <SortButton
                active={alphabetical}
                label={t(locale, 'listSortName')}
                onClick={() => setAlphabetical(true)}
              />
            </div>
          )}
        </div>
        {
          /* The anti-spoiler rule, stated rather than left to be
            inferred: a reader who counts 96 characters must know the
            number is THEIRS, not the wiki's. */
        }
        <p className='mt-2 text-[12.5px] leading-relaxed text-muted'>
          {t(locale, 'listProgressNote')}
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
              {visible.map((item) => (
                <EntityCard
                  key={item.slug}
                  type={view.type}
                  slug={item.slug}
                  image={item.image}
                  name={item.name}
                  secondary={item.secondary}
                  meta={item.subtitle !== null ? `${t(locale, 'since')} ${item.subtitle}` : null}
                  tag={item.tag}
                  stat={item.ordinal === null ? null : String(item.ordinal)}
                />
              ))}
            </CardGrid>
            {visible.length < items.length && (
              <div className='mt-6 flex justify-center'>
                <button
                  type='button'
                  onClick={() => setShown((n) => n + PAGE)}
                  className='cursor-pointer rounded-md px-4 py-2 text-[13px] font-semibold text-fg ring-1 ring-line-strong transition-colors duration-150 hover:bg-surface hover:ring-gold/45'
                >
                  {t(locale, 'listLoadMore')}
                  <span className='ml-2 tabular-nums text-muted'>
                    {items.length - visible.length}
                  </span>
                </button>
              </div>
            )}
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

function SortButton(
  { active, label, onClick }: {
    readonly active: boolean;
    readonly label: string;
    readonly onClick: () => void;
  },
): ReactElement {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ${
        active
          ? 'bg-gold text-canvas'
          : 'text-muted ring-1 ring-line hover:bg-surface hover:text-fg'
      }`}
    >
      {label}
    </button>
  );
}
