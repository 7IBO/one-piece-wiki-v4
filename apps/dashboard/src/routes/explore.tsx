/**
 * Cross-type data explorer (`/explore`). One flat list of EVERY entity
 * in the catalogue with its values pre-rendered server-side by
 * `GET /api/audit` — the maintainer's audit surface: filter by entity
 * type, spot missing translations / missing recommended values at a
 * glance, and (v2, 2026-08 feedback) pick property COLUMNS to compare
 * and fix values inline without opening a form.
 *
 * Two display modes, driven by the "Displayed properties" picker:
 *  - No property chosen (default): every row is always-expanded
 *    compact — display name, type chip, audit badges, completeness
 *    meter and the full values summary. No click-to-open, no per-row
 *    edit button (the row title links to the entity page).
 *  - Properties chosen: one cell per chosen property per row; the
 *    meter and x/y count are hidden; missing values render as a muted
 *    "—". An info line per chosen property sits above the list
 *    (declaring entity types + filled-entity count, all resolved from
 *    the schema catalogue), and a "relevant types only" toggle
 *    (default ON) restricts the list to entities whose type declares
 *    at least one chosen property.
 *
 * The page is READ-ONLY (2026-08 feedback — no inline editing): every
 * value line links to the entity page with `?edit=<propertyId>.<i>`,
 * which opens that entry's editor there — the detail surface — and
 * browser Back closes it.
 *
 * The client stays dumb by design: displays (vocabulary labels,
 *  translated keys, number+unit, ✓/×, compact `since` provenance)
 * arrive resolved from the server; labels for chrome (type chips,
 * property names) and editor metadata (value_type, enum vocabularies)
 * resolve from the schema catalogue — no property name or entity type
 * is hardcoded, and no raw id is ever displayed. Rows virtualize via
 * @tanstack/react-virtual past 100 entries.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsUpDown, Columns3, ListFilter, Search } from 'lucide-react';
import { type JSX, type ReactNode, useDeferredValue, useMemo, useRef, useState } from 'react';
import { api, type AuditRow, type Completeness, type SchemaCatalogue } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { type Locale, useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/explore')({
  component: ExploreComponent,
});

/** Rows above this count switch from a plain list to virtualization. */
const VIRTUALIZE_THRESHOLD = 100;

type Filters = {
  readonly types: readonly string[];
  readonly query: string;
  readonly missingTranslations: boolean;
  readonly missingValues: boolean;
  readonly hideComplete: boolean;
};

const EMPTY_FILTERS: Filters = {
  types: [],
  query: '',
  missingTranslations: false,
  missingValues: false,
  hideComplete: false,
};

/** A row is "complete" when the audit found nothing to fix. */
function isComplete(row: AuditRow): boolean {
  return row.missingRecommended.length === 0 && row.missingTranslations.length === 0;
}

function typeLabelOf(schemas: SchemaCatalogue | null, type: string, locale: Locale): string {
  const et = schemas?.entityTypes[type];
  return et?.labels[locale] ?? et?.labels.en ?? type;
}

function propertyLabelOf(
  schemas: SchemaCatalogue | null,
  propertyId: string,
  locale: Locale,
): string {
  const pt = schemas?.propertyTypes[propertyId];
  return pt?.labels[locale] ?? pt?.labels.en ?? propertyId;
}

/** Label for a missingRecommended id — a property OR a relation type
 *  (the expectation mixes both); resolved through the catalogue. */
function expectedLabelOf(
  schemas: SchemaCatalogue | null,
  id: string,
  locale: Locale,
): string {
  const pt = schemas?.propertyTypes[id];
  if (pt !== undefined) return pt.labels[locale] ?? pt.labels.en ?? id;
  // Relation labels are `{ active, inverse }` per locale — the
  // missing-relation chip reads in the entity→target direction.
  const rt = schemas?.relationTypes[id];
  if (rt !== undefined) return rt.labels[locale]?.active ?? rt.labels.en.active ?? id;
  return id;
}

/** The entity-type's declaration of a property, when declared. The
 *  decl's `historical` / `localizable` overrides drive how the JSON
 *  is shaped on disk, so they win over the property-type defaults —
 *  same resolution as the table view. */
function declOf(
  schemas: SchemaCatalogue,
  entityType: string,
  propertyId: string,
): { historical: boolean; localizable: boolean; } | undefined {
  const decl = schemas.entityTypes[entityType]?.properties.find((d) => d.id === propertyId);
  if (decl === undefined) return undefined;
  const pt = schemas.propertyTypes[propertyId];
  return {
    historical: decl.historical ?? pt?.historical ?? false,
    localizable: decl.localizable ?? pt?.localizable ?? false,
  };
}

function RowMeter({ value }: { value: Completeness; }): JSX.Element | null {
  const t = useT();
  if (value.expected <= 0) return null;
  const full = value.filled >= value.expected;
  const pct = Math.min(100, Math.round((value.filled / value.expected) * 100));
  const label = t('completenessOf')
    .replace('{filled}', String(value.filled))
    .replace('{expected}', String(value.expected));
  return (
    <div
      className='flex shrink-0 flex-col items-end gap-1'
      title={full ? `${label} — ${t('completeWord')}` : label}
    >
      <span
        className={`flex items-center gap-1 text-xs tabular-nums ${
          full ? 'text-muted-foreground' : 'text-amber-500'
        }`}
      >
        {full ? <Check aria-hidden='true' className='size-3' /> : null}
        {value.filled}/{value.expected}
      </span>
      <div aria-hidden='true' className='bg-muted h-0.5 w-14 overflow-hidden rounded-full sm:w-16'>
        <div className='bg-primary h-full rounded-full' style={{ width: `${pct}%` }} />
      </div>
      <span className='sr-only'>{label}</span>
    </div>
  );
}

type PickOption = { readonly id: string; readonly label: string; };

/**
 * Stay-open multi-select — the same Popover + Command pattern as the
 * form's multi-enum picker (localized label rows, right-side check
 * when selected, popup stays open across picks, NO raw ids shown).
 * Replicated locally: the explorer may not import from form/inputs.
 * Trigger height matches the search input next to it (h-10 → sm:h-8).
 */
function MultiPick(p: {
  icon: ReactNode;
  triggerLabel: string;
  options: readonly PickOption[];
  selected: readonly string[];
  onChange: (next: readonly string[]) => void;
  clearLabel?: string | undefined;
}): JSX.Element {
  const t = useT();
  const [open, setOpenState] = useState(false);
  // Same defensive scroll-restore as the form pickers — Base UI's
  // focus of the popup on open otherwise scrolls the page.
  function setOpen(next: boolean): void {
    if (next) {
      const x = window.scrollX;
      const y = window.scrollY;
      setOpenState(true);
      requestAnimationFrame(() => window.scrollTo(x, y));
    } else {
      setOpenState(false);
    }
  }
  const selected = new Set(p.selected);
  function toggle(id: string): void {
    if (selected.has(id)) p.onChange(p.selected.filter((s) => s !== id));
    else p.onChange([...p.selected, id]);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className='h-10 gap-1.5 px-2.5 text-base font-normal sm:h-8 sm:text-xs'
          />
        }
      >
        {p.icon}
        <span className='max-w-40 truncate'>{p.triggerLabel}</span>
        <ChevronsUpDown className='text-muted-foreground size-3.5 shrink-0' />
      </PopoverTrigger>
      {
        /* Fixed width on every breakpoint — a toolbar picker, not a
          form control, so the W-F2 page-full-width mobile popup is
          deliberately overridden here. */
      }
      <PopoverContent
        align='start'
        side='bottom'
        className='w-64 p-0 max-sm:w-64 max-sm:max-w-64'
      >
        <Command>
          {p.options.length > 8 ? <CommandInput placeholder={t('search')} /> : null}
          <CommandList>
            <CommandEmpty>{t('noMatch')}</CommandEmpty>
            <CommandGroup>
              {p.options.map((o) => {
                const on = selected.has(o.id);
                return (
                  <CommandItem
                    key={o.id}
                    value={`${o.label} ${o.id}`}
                    // Toggling keeps the popup open on purpose — the
                    // whole point is picking several values per visit.
                    onSelect={() => toggle(o.id)}
                  >
                    <span className='flex-1 truncate'>{o.label}</span>
                    {on ? <Check className='text-primary ml-2 size-4' /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {p.clearLabel !== undefined && p.selected.length > 0
          ? (
            <div className='border-border border-t p-1'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 w-full text-xs'
                onClick={() => p.onChange([])}
              >
                {p.clearLabel}
              </Button>
            </div>
          )
          : null}
      </PopoverContent>
    </Popover>
  );
}

/** Outline button acting as an on/off filter chip. */
function FilterToggle(p: {
  active: boolean;
  label: string;
  onToggle: () => void;
}): JSX.Element {
  return (
    <Button
      type='button'
      variant='outline'
      aria-pressed={p.active}
      onClick={p.onToggle}
      className={`h-10 text-xs sm:h-8 ${
        p.active
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 hover:text-amber-500'
          : 'text-muted-foreground'
      }`}
    >
      {p.label}
    </Button>
  );
}

/** One READ-ONLY property cell in columns mode. Missing values are a
 *  plain muted dash (title carries the hint) — no amber chips, no
 *  inline editor (2026-08 feedback). Each value line links to the
 *  entity page with `?edit=<propertyId>.<i>` — the entry's detail
 *  opens there, in the same editor as the entity form. */
function ValueCell(p: {
  row: AuditRow;
  propertyId: string;
  schemas: SchemaCatalogue;
  locale: Locale;
}): JSX.Element {
  const t = useT();
  const declared = declOf(p.schemas, p.row.type, p.propertyId) !== undefined;
  const pv = p.row.values.find((v) => v.property === p.propertyId);
  const entries = pv?.entries ?? [];
  const label = propertyLabelOf(p.schemas, p.propertyId, p.locale);

  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground truncate text-xs'>{label}</p>
      {!declared
        ? (
          <span className='text-muted-foreground/50 text-xs' title={t('exploreNotApplicable')}>
            —
          </span>
        )
        : entries.length === 0
        ? (
          <span className='text-muted-foreground text-xs italic' title={t('missingValue')}>
            —
          </span>
        )
        : (
          <span className='block space-y-0.5'>
            {entries.map((entry, i) => (
              <Link
                key={i}
                to='/types/$type/$slug'
                params={{ type: p.row.type, slug: p.row.slug }}
                search={{ edit: `${p.propertyId}.${i}` }}
                title={t('exploreOpenEntry')}
                className='hover:bg-muted/60 -mx-1 block break-words rounded px-1 text-xs'
              >
                {entry.display}
                {entry.since !== undefined
                  ? <span className='text-muted-foreground ml-1.5'>{entry.since}</span>
                  : null}
              </Link>
            ))}
          </span>
        )}
    </div>
  );
}

/**
 * One explorer row — a pure READ surface (2026-08 feedback: inline
 * editing removed, warning walls toned down). The completeness meter
 * is THE gap signal; missing fields collapse to one muted line, and
 * edits happen on the entity page (row title links there).
 */
function ExploreRow(p: {
  row: AuditRow;
  schemas: SchemaCatalogue | null;
  locale: Locale;
  chosenProps: readonly string[];
}): JSX.Element {
  const t = useT();
  const { row } = p;
  const name = row.displayName[p.locale] ?? row.displayName.en ?? row.slug;
  const nTranslations = row.missingTranslations.length;
  const nValues = row.missingRecommended.length;
  const columnsMode = p.chosenProps.length > 0 && p.schemas !== null;

  const header = (
    <p className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium'>
      <Link
        to='/types/$type/$slug'
        params={{ type: row.type, slug: row.slug }}
        className='min-w-0 truncate hover:underline'
      >
        {name}
      </Link>
      <Badge variant='outline' className='shrink-0 font-normal'>
        {typeLabelOf(p.schemas, row.type, p.locale)}
      </Badge>
    </p>
  );

  // Quiet gap summary — ONE muted line instead of a wall of amber
  // chips ("trop de warning"): expected-but-missing field labels,
  // then the missing-translations count.
  const gapSummary = nValues > 0 || nTranslations > 0
    ? (
      <p className='text-muted-foreground/80 text-xs'>
        {nValues > 0
          ? `${t('exploreMissingValuesBadge').replace('{n}', String(nValues))} : ${
            row.missingRecommended.map((id) => expectedLabelOf(p.schemas, id, p.locale))
              .join(' · ')
          }`
          : null}
        {nValues > 0 && nTranslations > 0 ? ' — ' : null}
        {nTranslations > 0
          ? t('exploreMissingTranslationsBadge').replace('{n}', String(nTranslations))
          : null}
      </p>
    )
    : null;

  const schemas = p.schemas;
  if (columnsMode && schemas !== null) {
    // Columns mode: one read-only cell per chosen property; the meter
    // / x/y count is deliberately hidden ("on n'affiche pas le 1/1").
    return (
      <div className='space-y-2 px-[var(--page-px)] py-2.5 sm:px-4'>
        {header}
        <div className='grid gap-x-4 gap-y-1.5 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]'>
          {p.chosenProps.map((pid) => (
            <ValueCell
              key={pid}
              row={row}
              propertyId={pid}
              schemas={schemas}
              locale={p.locale}
            />
          ))}
        </div>
      </div>
    );
  }

  // Default mode: always-expanded compact read row — the values
  // summary sits directly under the entity line.
  return (
    <div className='space-y-2 px-[var(--page-px)] py-2.5 sm:px-4'>
      <div className='flex items-start gap-3'>
        {header}
        <RowMeter value={row.completeness} />
      </div>
      {row.values.length === 0
        ? <p className='text-muted-foreground text-xs italic'>{t('exploreNoValues')}</p>
        : (
          <dl className='space-y-1'>
            {row.values.map((pv) => (
              <div key={pv.property} className='flex flex-wrap gap-x-3 gap-y-0.5 text-xs'>
                <dt className='text-muted-foreground w-32 shrink-0 truncate pt-0.5'>
                  {propertyLabelOf(p.schemas, pv.property, p.locale)}
                </dt>
                <dd className='min-w-0 flex-1 space-y-0.5'>
                  {pv.entries.length === 0
                    ? <span className='text-muted-foreground italic'>—</span>
                    : pv.entries.map((entry, i) => (
                      /* Each value line links to the entity page with
                        `?edit=<propertyId>.<i>` — the entry's detail
                        opens there (same editor as the entity form),
                        browser Back closes it. Discreet hover bg. */
                      <Link
                        key={i}
                        to='/types/$type/$slug'
                        params={{ type: row.type, slug: row.slug }}
                        search={{ edit: `${pv.property}.${i}` }}
                        title={t('exploreOpenEntry')}
                        className='hover:bg-muted/60 -mx-1 flex flex-wrap items-baseline gap-x-2 rounded px-1'
                      >
                        <span className='min-w-0 break-words'>{entry.display}</span>
                        {entry.since !== undefined
                          ? (
                            <span className='text-muted-foreground shrink-0 text-xs'>
                              {entry.since}
                            </span>
                          )
                          : null}
                      </Link>
                    ))}
                </dd>
              </div>
            ))}
          </dl>
        )}
      {gapSummary}
    </div>
  );
}

/** Skeleton shaped like the real rows. */
function ExploreSkeleton(): JSX.Element {
  return (
    <Card bleed className='gap-0 py-0'>
      <ul className='divide-border divide-y'>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className='space-y-2 px-[var(--page-px)] py-2.5 sm:px-4'>
            <div className='flex items-center gap-3'>
              <Skeleton className='h-4 w-52 max-w-full flex-1' />
              <div className='flex shrink-0 flex-col items-end gap-1'>
                <Skeleton className='h-3 w-8' />
                <Skeleton className='h-0.5 w-14 sm:w-16' />
              </div>
            </div>
            <Skeleton className='h-3 w-72 max-w-full' />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExploreComponent(): JSX.Element {
  const locale = useLocale();
  const t = useT();
  // Locale is a fetch dependency: value displays (translations,
  // vocabulary labels, ref names) are resolved server-side in the
  // requested locale, so switching FR/EN refetches the rows.
  const { data, error, reload } = useApiResource(
    () => Promise.all([api.audit(locale), api.schemas()]),
    [locale],
  );
  const rows = data?.[0].rows ?? null;
  const schemas = data?.[1] ?? null;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [chosenProps, setChosenProps] = useState<readonly string[]>([]);
  const deferredQuery = useDeferredValue(filters.query);

  const typeOptions = useMemo(
    () =>
      Object.values(schemas?.entityTypes ?? {})
        .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en ?? et.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [schemas, locale],
  );

  // Property columns on offer: every property DECLARED by the selected
  // entity types (all types when no filter) — schema catalogue only,
  // localized labels, no ids.
  const propertyOptions = useMemo(() => {
    if (schemas === null) return [] as PickOption[];
    const selectedTypes = filters.types.length > 0
      ? filters.types
      : Object.keys(schemas.entityTypes);
    const ids = new Set<string>();
    for (const typeId of selectedTypes) {
      const et = schemas.entityTypes[typeId];
      if (et === undefined) continue;
      for (const decl of et.properties) ids.add(decl.id);
    }
    return [...ids]
      .map((id) => ({ id, label: propertyLabelOf(schemas, id, locale) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [schemas, filters.types, locale]);

  // Chosen columns surviving the current type selection (narrowing the
  // type filter can orphan a chosen column; keep the choice stored but
  // don't render orphan cells).
  const activeProps = useMemo(
    () => chosenProps.filter((id) => propertyOptions.some((o) => o.id === id)),
    [chosenProps, propertyOptions],
  );

  // "Relevant types only" (default ON): with ≥1 chosen property, keep
  // only entities whose TYPE declares at least one of them — the
  // point of picking "Age" is seeing the types that carry it.
  const [relevantOnly, setRelevantOnly] = useState(true);
  const relevantTypes = useMemo(() => {
    if (schemas === null || activeProps.length === 0) return null;
    const declaring = new Set<string>();
    for (const et of Object.values(schemas.entityTypes)) {
      if (et.properties.some((d) => activeProps.includes(d.id))) declaring.add(et.id);
    }
    return declaring;
  }, [schemas, activeProps]);

  // Per-chosen-property info line data: which entity types declare the
  // property (schema catalogue, localized labels) + how many entities
  // have a value for it on their audit row. No data hardcoded.
  const propertyInfos = useMemo(() => {
    if (schemas === null || rows === null || activeProps.length === 0) return null;
    return activeProps.map((pid) => ({
      id: pid,
      label: propertyLabelOf(schemas, pid, locale),
      declaredBy: Object.values(schemas.entityTypes)
        .filter((et) => et.properties.some((d) => d.id === pid))
        .map((et) => et.labels[locale] ?? et.labels.en ?? et.id)
        .sort((a, b) => a.localeCompare(b)),
      filledCount: rows.filter((row) =>
        row.values.some((pv) => pv.property === pid && pv.entries.length > 0)
      ).length,
    }));
  }, [schemas, rows, activeProps, locale]);

  const filtered = useMemo(() => {
    if (rows === null) return null;
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.types.length > 0 && !filters.types.includes(row.type)) return false;
      if (relevantOnly && relevantTypes !== null && !relevantTypes.has(row.type)) return false;
      if (filters.missingTranslations && row.missingTranslations.length === 0) return false;
      if (filters.missingValues && row.missingRecommended.length === 0) return false;
      if (filters.hideComplete && isComplete(row)) return false;
      if (q !== '') {
        const name = row.displayName[locale] ?? row.displayName.en ?? '';
        if (
          !name.toLowerCase().includes(q)
          && !row.slug.toLowerCase().includes(q)
          && !row.id.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, filters, deferredQuery, locale, relevantOnly, relevantTypes]);

  const hasActiveFilters = filters.types.length > 0
    || filters.query !== ''
    || filters.missingTranslations
    || filters.missingValues
    || filters.hideComplete;

  // Virtualize only past the threshold — rows re-measure via
  // measureElement (ResizeObserver), so variable heights stay correct.
  const listRef = useRef<HTMLDivElement>(null);
  const virtualize = filtered !== null && filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useWindowVirtualizer({
    count: virtualize ? filtered.length : 0,
    estimateSize: () => 96,
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const countOf = (n: number): string => `${n} ${n === 1 ? t('entityWord') : t('entitiesWord')}`;

  if (error !== null) {
    return <LoadFailed message={error} onRetry={reload} />;
  }

  const renderRow = (row: AuditRow): JSX.Element => (
    <ExploreRow
      row={row}
      schemas={schemas}
      locale={locale}
      chosenProps={activeProps}
    />
  );

  return (
    <div className='space-y-4 sm:space-y-5'>
      <div>
        <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>{t('exploreTitle')}</h1>
        <p className='text-muted-foreground text-sm'>
          {rows === null
            ? t('loading')
            : filtered === null || filtered.length === rows.length
            ? `${countOf(rows.length)} — ${t('exploreSubtitle')}`
            : `${filtered.length} ${t('ofWord')} ${countOf(rows.length)}`}
        </p>
      </div>

      {
        /* Sticky toolbar — same offset/bleed recipe as the type lists.
          Every control shares the search input's height (h-10 → sm:h-8). */
      }
      {
        /* Filters scroll away with the page (maintainer call 2026-08:
        "je veux pas que les filtres soient sticky"). */
      }
      <div className='bleed bg-background flex flex-wrap items-center gap-2 border-b px-[var(--page-px)] py-2 sm:px-0'>
        <div className='relative min-w-48 flex-1'>
          <Search className='text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2' />
          <Input
            type='search'
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder={t('searchEntitiesPlaceholder')}
            className='pl-8'
          />
        </div>
        <MultiPick
          icon={<ListFilter className='size-3.5' aria-hidden='true' />}
          triggerLabel={filters.types.length === 0
            ? t('exploreAllTypes')
            : `${t('exploreTypesFilter')} · ${filters.types.length}`}
          options={typeOptions}
          selected={filters.types}
          onChange={(types) => setFilters((f) => ({ ...f, types }))}
          clearLabel={t('exploreAllTypes')}
        />
        <MultiPick
          icon={<Columns3 className='size-3.5' aria-hidden='true' />}
          triggerLabel={activeProps.length === 0
            ? t('explorePropsFilter')
            : `${t('explorePropsFilter')} · ${activeProps.length}`}
          options={propertyOptions}
          selected={chosenProps}
          onChange={setChosenProps}
          clearLabel={t('exploreClearFilters')}
        />
        {activeProps.length > 0
          ? (
            <FilterToggle
              active={relevantOnly}
              label={t('exploreRelevantTypesOnly')}
              onToggle={() => setRelevantOnly((v) => !v)}
            />
          )
          : null}
        <FilterToggle
          active={filters.missingTranslations}
          label={t('exploreMissingTranslationsToggle')}
          onToggle={() =>
            setFilters((f) => ({ ...f, missingTranslations: !f.missingTranslations }))}
        />
        <FilterToggle
          active={filters.missingValues}
          label={t('exploreMissingValuesToggle')}
          onToggle={() => setFilters((f) => ({ ...f, missingValues: !f.missingValues }))}
        />
        <FilterToggle
          active={filters.hideComplete}
          label={t('exploreHideCompleteToggle')}
          onToggle={() => setFilters((f) => ({ ...f, hideComplete: !f.hideComplete }))}
        />
      </div>

      {
        /* One discreet info line per chosen property: which entity
          types declare it (schema catalogue, localized labels) and how
          many entities carry a value for it. */
      }
      {propertyInfos !== null
        ? (
          <div className='space-y-0.5'>
            {propertyInfos.map((info) => (
              <p key={info.id} className='text-muted-foreground text-xs'>
                <span className='text-foreground font-medium'>{info.label}</span>
                {' — '}
                {t('exploreDeclaredBy').replace('{types}', info.declaredBy.join(', '))}
                {' · '}
                {t('exploreFilledCount').replace('{n}', String(info.filledCount))}
              </p>
            ))}
          </div>
        )
        : null}

      {rows === null || filtered === null
        ? <ExploreSkeleton />
        : filtered.length === 0
        ? (
          <div className='rounded-md border border-dashed p-8 text-center'>
            <p className='text-muted-foreground text-sm'>
              {hasActiveFilters ? t('exploreEmptyFiltered') : t('noEntitiesYet')}
            </p>
            {hasActiveFilters
              ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='mt-4'
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  {t('exploreClearFilters')}
                </Button>
              )
              : null}
          </div>
        )
        : virtualize
        ? (
          <Card bleed className='gap-0 py-0'>
            <div ref={listRef}>
              <div
                className='relative w-full'
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = filtered[item.index];
                  if (row === undefined) return null;
                  return (
                    <div
                      key={row.id}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      className='border-border absolute left-0 top-0 w-full border-b'
                      style={{
                        transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      {renderRow(row)}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )
        : (
          <Card bleed className='gap-0 py-0'>
            <ul className='divide-border divide-y'>
              {filtered.map((row) => <li key={row.id}>{renderRow(row)}</li>)}
            </ul>
          </Card>
        )}
    </div>
  );
}
