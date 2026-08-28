/**
 * `/<type>` — the collection view, rebuilt to `design/v2/Liste.dc.html`.
 *
 * The plate's chassis: a tinted header band (overline, 34px title, a
 * count line that says whose count it is, sort chips, view tabs), a
 * 224px filter rail on the left, and the results beside it under the
 * chips of whatever is filtered.
 *
 * ## The filters come from the schema
 *
 * The plate carries that as a comment on itself — « une facette par
 * propriété énumérée du type, jamais une liste écrite à la main » —
 * and it is already true of the data: `buildFacets` derives them from
 * any declared enum property that actually splits the population. So
 * nothing here knows a property id, and a type with no enum property
 * renders no rail.
 *
 * ## The counts are the reader's
 *
 * Filtering is client-side over an already spoiler-checked list — no
 * refetch, no flash — and every count was computed server-side against
 * the same cursor. An entity appearing later is neither listed nor
 * counted, and the rail's footnote says so: a reader who sees "96"
 * must know whose 96 it is.
 *
 * ## Ordered types read in their order
 *
 * A type that declares an ordinal arrives sorted by it, and A–Z is the
 * ALTERNATIVE. Alphabetical was the only order until the corpus grew:
 * with 400 episodes it put "A Man's Oath Never Dies" first and left no
 * way to reach episode 250.
 *
 * ## Two views, not three
 *
 * The plate offers Grille, Tableau and Chronologie. The first two are
 * honest with the data the corpus has. Chronologie needs an ordinal
 * AND dates, and dates exist on ten chapters out of twelve hundred —
 * a tab rendering an empty axis is worse than a tab that is not there.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { type EntityListItem, fetchTypeList } from '../api';
import { CardGrid, EntityCard } from '../components/EntityCard';
import { ScopeContext } from '../components/EntityChip';
import { FacetSidebar } from '../components/list/FacetSidebar';
import { Chip, ListBand, type SortOption } from '../components/list/ListBand';
import { ListTable } from '../components/list/ListTable';
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
  const [sort, setSort] = useState('ordinal');
  const [tab, setTab] = useState('grid');
  const [shown, setShown] = useState(PAGE);

  // Does this type HAVE an order? Asked of the data, not of a list of
  // type ids — so the control appears for any ordered type and never
  // for a character.
  const ordered = view.items.some((item) => item.ordinal !== null);
  const alphabetical = sort === 'name' || !ordered;

  const items = useMemo(() => {
    const filtered = view.items.filter((item) => matches(item, selection));
    if (!alphabetical) return filtered;
    return filtered.toSorted((a, b) => a.name.localeCompare(b.name));
  }, [view.items, selection, alphabetical]);

  const visible = items.slice(0, shown);
  // The chip row exists to say what is filtered and how much it left.
  // With nothing filtered it would only repeat the band's own count.
  const filtered = Object.keys(selection).length > 0;

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

  const sorts: readonly SortOption[] = ordered
    ? [
      { id: 'ordinal', label: t(locale, 'listSortOrdinal') },
      { id: 'name', label: t(locale, 'listSortName') },
    ]
    : [];
  const tabs: readonly SortOption[] = [
    { id: 'grid', label: t(locale, 'listViewGrid') },
    { id: 'table', label: t(locale, 'listViewTable') },
  ];

  return (
    <>
      {
        /* The plate's lead reads « 412 personnages » — the type name,
          pluralised. A schema label carries no plural form to derive
          (« 10 character » is what lowercasing it gives), and
          inventing one per locale is a grammar engine nobody asked
          for. The countable noun stays generic; the type name is the
          title right above it. */
      }
      <ListBand
        type={view.type}
        overline={t(locale, 'listEntityType')}
        title={view.label}
        lead={`${items.length} ${t(locale, items.length === 1 ? 'entry' : 'entries')}${
          items.length === view.items.length ? '' : ` / ${view.items.length}`
        }`}
        sorts={sorts}
        sort={sort}
        onSort={setSort}
        tabs={tabs}
        tab={tab}
        onTab={setTab}
      />
      <div className='mx-auto flex w-full max-w-[1440px] flex-col gap-5.5 px-5 pb-11 pt-5 lg:flex-row lg:px-10'>
        <FacetSidebar
          facets={view.facets}
          selection={selection}
          onToggle={toggle}
          onReset={() => {
            setSelection({});
            setShown(PAGE);
          }}
        />
        <div className='min-w-0 flex-1'>
          {
            /* What is filtered, said as removable chips — the plate's
            own affordance, and the only way to lift a filter chosen
            in a rail that has scrolled away. */
          }
          <div
            className={`flex-wrap items-center gap-2 ${filtered ? 'flex' : 'hidden'}`}
          >
            {view.facets.flatMap((facet) => {
              const value = selection[facet.id];
              if (value === undefined) return [];
              const option = facet.options.find((o) => o.value === value);
              return [
                <Chip
                  key={facet.id}
                  label={`${option?.label ?? value} ×`}
                  on
                  onClick={() => toggle(facet.id, value)}
                />,
              ];
            })}
            <span className='text-xs text-muted'>
              {items.length} {t(locale, items.length === 1 ? 'listResult' : 'listResults')}
            </span>
          </div>

          {items.length === 0
            ? (
              <p className='mt-4 rounded-md px-4 py-3 text-muted ring-1 ring-line'>
                {t(locale, 'emptyType')}
              </p>
            )
            : (
              <ScopeContext.Provider value={scope ?? null}>
                <div className='mt-4'>
                  {tab === 'table'
                    ? <ListTable type={view.type} items={visible} facets={view.facets} />
                    : (
                      <CardGrid>
                        {visible.map((item) => (
                          <EntityCard
                            key={item.slug}
                            type={view.type}
                            slug={item.slug}
                            image={item.image}
                            name={item.name}
                            secondary={item.secondary}
                            meta={item.subtitle === null
                              ? null
                              : `${t(locale, 'since')} ${item.subtitle}`}
                            tag={item.tag}
                            stat={item.ordinal === null ? null : String(item.ordinal)}
                          />
                        ))}
                      </CardGrid>
                    )}
                </div>
                {visible.length < items.length && (
                  <div className='mt-7 flex justify-center'>
                    <button
                      type='button'
                      onClick={() => setShown((n) => n + PAGE)}
                      className='cursor-pointer rounded-md border border-line-strong px-6 py-2.5 text-[13px] font-semibold text-fg transition-colors duration-150'
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
      </div>
    </>
  );
}
