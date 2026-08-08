/**
 * Cross-type data explorer (`/explore`). One flat list of EVERY entity
 * in the catalogue with its values pre-rendered server-side by
 * `GET /api/audit` — the maintainer's audit surface: filter by entity
 * type, spot missing translations / missing recommended values at a
 * glance, expand a row to read every historised value, and fix an
 * entity inline through the existing EntityEditDrawer (normal form +
 * PR flow).
 *
 * The client stays dumb by design: displays (vocabulary labels,
 * translated keys, number+unit, ✓/×) arrive resolved from the server;
 * only labels for chrome (type chips, property names) resolve here,
 * from the schema catalogue — no property name or entity type is
 * hardcoded. Rows virtualize via @tanstack/react-virtual past 100
 * entries; below that a plain list keeps the DOM simple.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute } from '@tanstack/react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronDown, ListFilter, Pencil, Search } from 'lucide-react';
import { type JSX, useDeferredValue, useMemo, useRef, useState } from 'react';
import { api, type AuditRow, type Completeness, type SchemaCatalogue } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { EntityEditDrawer } from '../form/EntityEditDrawer';
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

/** Same visual language as the per-type list rows (ADR-083 meter). */
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

/** Stay-open multi-select of entity types (checkbox list in a
 *  popover — same interaction as the table view's column picker). */
function TypeFilter(p: {
  schemas: SchemaCatalogue | null;
  selected: readonly string[];
  onChange: (next: readonly string[]) => void;
  locale: Locale;
}): JSX.Element {
  const t = useT();
  const allTypes = useMemo(
    () =>
      Object.values(p.schemas?.entityTypes ?? {})
        .map((et) => ({ id: et.id, label: et.labels[p.locale] ?? et.labels.en ?? et.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [p.schemas, p.locale],
  );
  function toggle(id: string): void {
    if (p.selected.includes(id)) p.onChange(p.selected.filter((s) => s !== id));
    else p.onChange([...p.selected, id]);
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type='button' variant='outline' size='sm' className='h-8 gap-1.5 text-xs'>
            <ListFilter className='size-3.5' />
            {p.selected.length === 0
              ? t('exploreAllTypes')
              : `${t('exploreTypesFilter')} · ${p.selected.length}/${allTypes.length}`}
          </Button>
        }
      />
      <PopoverContent align='start' side='bottom' className='max-h-[60vh] w-64 overflow-y-auto p-2'>
        <p className='text-muted-foreground mb-2 px-1 text-xs uppercase tracking-wide'>
          {t('exploreTypesFilter')}
        </p>
        <div className='space-y-0.5'>
          {allTypes.map((et) => (
            <label
              key={et.id}
              className='hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs'
            >
              <input
                type='checkbox'
                checked={p.selected.includes(et.id)}
                onChange={() => toggle(et.id)}
                className='shrink-0'
              />
              <span className='flex-1 truncate'>{et.label}</span>
              <span className='text-muted-foreground font-mono text-xs'>{et.id}</span>
            </label>
          ))}
        </div>
        {p.selected.length > 0
          ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='mt-2 h-7 w-full text-xs'
              onClick={() => p.onChange([])}
            >
              {t('exploreAllTypes')}
            </Button>
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
      size='sm'
      aria-pressed={p.active}
      onClick={p.onToggle}
      className={`h-8 text-xs ${
        p.active
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 hover:text-amber-500'
          : 'text-muted-foreground'
      }`}
    >
      {p.label}
    </Button>
  );
}

function ExploreRow(p: {
  row: AuditRow;
  schemas: SchemaCatalogue | null;
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}): JSX.Element {
  const t = useT();
  const { row } = p;
  const name = row.displayName[p.locale] ?? row.displayName.en ?? row.slug;
  const nTranslations = row.missingTranslations.length;
  const nValues = row.missingRecommended.length;
  return (
    <Collapsible open={p.expanded} onOpenChange={p.onToggle}>
      <div className='flex items-center gap-3 px-[var(--page-px)] py-2.5 sm:px-4'>
        <CollapsibleTrigger
          className='hover:bg-accent/40 -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left'
          aria-label={t('exploreToggleDetails')}
        >
          <ChevronDown
            aria-hidden='true'
            className={`text-muted-foreground size-4 shrink-0 transition-transform ${
              p.expanded ? '' : '-rotate-90'
            }`}
          />
          <div className='min-w-0 flex-1'>
            <p className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium'>
              <span className='min-w-0 truncate'>{name}</span>
              <Badge variant='outline' className='shrink-0 font-normal'>
                {typeLabelOf(p.schemas, row.type, p.locale)}
              </Badge>
              {nTranslations > 0
                ? (
                  <span className='shrink-0 rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 text-xs text-amber-500'>
                    {t('exploreMissingTranslationsBadge').replace('{n}', String(nTranslations))}
                  </span>
                )
                : null}
              {nValues > 0
                ? (
                  <span className='shrink-0 rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 text-xs text-amber-500'>
                    {t('exploreMissingValuesBadge').replace('{n}', String(nValues))}
                  </span>
                )
                : null}
            </p>
            <p className='text-muted-foreground truncate font-mono text-xs'>{row.slug}</p>
          </div>
        </CollapsibleTrigger>
        <RowMeter value={row.completeness} />
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('editLinked')}
          title={t('editLinked')}
          onClick={p.onEdit}
        >
          <Pencil className='size-4' />
        </Button>
      </div>
      <CollapsibleContent>
        <div className='space-y-3 px-[var(--page-px)] pb-3 pl-10 sm:px-4 sm:pl-10'>
          {/* Values — property label (catalogue-localized) → entries. */}
          {row.values.length === 0
            ? <p className='text-muted-foreground text-xs italic'>{t('exploreNoValues')}</p>
            : (
              <dl className='space-y-1.5'>
                {row.values.map((pv) => (
                  <div key={pv.property} className='flex flex-wrap gap-x-3 gap-y-0.5 text-xs'>
                    <dt className='text-muted-foreground w-32 shrink-0 truncate'>
                      {propertyLabelOf(p.schemas, pv.property, p.locale)}
                    </dt>
                    <dd className='min-w-0 flex-1 space-y-0.5'>
                      {pv.entries.length === 0
                        ? <span className='text-muted-foreground italic'>—</span>
                        : pv.entries.map((entry, i) => (
                          <div key={i} className='flex flex-wrap items-baseline gap-x-2'>
                            <span className='min-w-0 break-words'>{entry.display}</span>
                            {entry.since !== undefined
                              ? (
                                <span className='text-muted-foreground shrink-0 font-mono text-xs'>
                                  {entry.since}
                                </span>
                              )
                              : null}
                          </div>
                        ))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          {/* Missing lists in full. */}
          {nValues > 0
            ? (
              <div className='text-xs'>
                <p className='mb-1 text-amber-500'>
                  {t('exploreMissingValuesBadge').replace('{n}', String(nValues))}
                </p>
                <div className='flex flex-wrap gap-1'>
                  {row.missingRecommended.map((id) => (
                    <span
                      key={id}
                      className='rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 text-xs text-amber-500'
                    >
                      {expectedLabelOf(p.schemas, id, p.locale)}
                    </span>
                  ))}
                </div>
              </div>
            )
            : null}
          {nTranslations > 0
            ? (
              <div className='text-xs'>
                <p className='mb-1 text-amber-500'>
                  {t('exploreMissingTranslationsBadge').replace('{n}', String(nTranslations))}
                </p>
                <ul className='space-y-0.5'>
                  {row.missingTranslations.map((key) => (
                    <li key={key} className='text-muted-foreground font-mono text-xs'>
                      {key}
                    </li>
                  ))}
                </ul>
              </div>
            )
            : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Skeleton shaped like the real rows. */
function ExploreSkeleton(): JSX.Element {
  return (
    <Card bleed className='gap-0 py-0'>
      <ul className='divide-border divide-y'>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className='flex items-center gap-3 px-[var(--page-px)] py-2.5 sm:px-4'>
            <div className='min-w-0 flex-1 space-y-1.5'>
              <Skeleton className='h-4 w-52 max-w-full' />
              <Skeleton className='h-3 w-28 max-w-full' />
            </div>
            <div className='flex shrink-0 flex-col items-end gap-1'>
              <Skeleton className='h-3 w-8' />
              <Skeleton className='h-0.5 w-14 sm:w-16' />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExploreComponent(): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const { data, error, reload } = useApiResource(
    () => Promise.all([api.audit(), api.schemas()]),
    [],
  );
  const rows = data?.[0].rows ?? null;
  const schemas = data?.[1] ?? null;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<{ type: string; slug: string; } | null>(null);
  const deferredQuery = useDeferredValue(filters.query);

  const filtered = useMemo(() => {
    if (rows === null) return null;
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.types.length > 0 && !filters.types.includes(row.type)) return false;
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
  }, [rows, filters, deferredQuery, locale]);

  const hasActiveFilters = filters.types.length > 0
    || filters.query !== ''
    || filters.missingTranslations
    || filters.missingValues
    || filters.hideComplete;

  function toggleRow(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Virtualize only past the threshold — expanded rows re-measure via
  // measureElement (ResizeObserver), so variable heights stay correct.
  const listRef = useRef<HTMLDivElement>(null);
  const virtualize = filtered !== null && filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useWindowVirtualizer({
    count: virtualize ? filtered.length : 0,
    estimateSize: () => 64,
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
      expanded={expanded.has(row.id)}
      onToggle={() => toggleRow(row.id)}
      onEdit={() => setEditing({ type: row.type, slug: row.slug })}
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

      {/* Sticky toolbar — same offset/bleed recipe as the type lists. */}
      <div className='bleed bg-background sticky top-[var(--header-h)] z-10 flex flex-wrap items-center gap-2 border-b px-[var(--page-px)] py-2 sm:px-0'>
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
        <TypeFilter
          schemas={schemas}
          selected={filters.types}
          onChange={(types) => setFilters((f) => ({ ...f, types }))}
          locale={locale}
        />
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

      {
        /* Inline edit through the existing drawer (normal form + PR
          flow). Rendering it here — instead of via useEntityDrawer() —
          gives us the close event, which triggers the audit refetch
          (stale-while-refetch keeps the list on screen). Editing a
          linked entity from inside still stacks through the provider. */
      }
      {editing !== null
        ? (
          <EntityEditDrawer
            open
            type={editing.type}
            slug={editing.slug}
            onOpenChange={(open) => {
              if (!open) {
                setEditing(null);
                reload();
              }
            }}
          />
        )
        : null}
    </div>
  );
}
