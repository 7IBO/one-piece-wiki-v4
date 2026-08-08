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
 *    meter and x/y count are hidden; missing values render as an
 *    amber "—" WARNING chip. Clicking an editable cell swaps in the
 *    right inline editor for its value_type (string/number → input,
 *    enum → select, boolean → toggle, date → date input); commits
 *    land in a local draft store and a sticky save bar opens ONE PR
 *    per edited entity through the same `saveEntity` endpoint as the
 *    table view. Complex value types (refs, multi_enum, localizable
 *    i18n keys…) stay read-only inline — the "⋯" affordance links to
 *    the full entity page.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsUpDown, Columns3, ListFilter, MoreHorizontal, Search } from 'lucide-react';
import { type JSX, type ReactNode, useDeferredValue, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type AuditRow, type Completeness, type SchemaCatalogue } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { type Locale, useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/explore')({
  component: ExploreComponent,
});

/** Rows above this count switch from a plain list to virtualization. */
const VIRTUALIZE_THRESHOLD = 100;

/** Value types the explorer edits inline (latest entry only). Anything
 *  else — refs, multi_enum, markdown, localizable keys — goes through
 *  the full entity page. Mirrors the table view's `INLINE_EDITABLE`. */
const INLINE_EDITABLE = new Set(['string', 'number', 'boolean', 'enum', 'date']);

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

function vocabLabelOf(
  schemas: SchemaCatalogue,
  enumRef: string | undefined,
  valueId: string,
  locale: Locale,
): string {
  if (enumRef === undefined) return valueId;
  const term = schemas.vocabularies[enumRef]?.values[valueId];
  return term?.labels[locale] ?? term?.labels.en ?? valueId;
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

/** Can this row's cell for this property be edited inline? */
function cellEditable(
  schemas: SchemaCatalogue,
  entityType: string,
  propertyId: string,
): boolean {
  const decl = declOf(schemas, entityType, propertyId);
  const pt = schemas.propertyTypes[propertyId];
  if (decl === undefined || pt === undefined) return false;
  if (decl.localizable) return false;
  if (!INLINE_EDITABLE.has(pt.value_type)) return false;
  if (pt.value_type === 'enum') {
    const enumRef = pt.value_constraints?.enum_ref;
    if (enumRef === undefined || schemas.vocabularies[enumRef] === undefined) return false;
  }
  return true;
}

/** Latest stored scalar for a row's property (`raw.value` of the last
 *  entry) — the value inline editing targets. */
function latestRawValue(row: AuditRow, propertyId: string): unknown {
  const pv = row.values.find((v) => v.property === propertyId);
  const last = pv?.entries[pv.entries.length - 1];
  return last?.raw?.value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Write an edited scalar back into the property's on-disk shape,
 *  preserving the latest entry's qualifiers — mirrors the table
 *  view's `writeCell` (historical → replace the LAST entry of the
 *  array; non-historical → the singleton object). */
function writeLatestValue(original: unknown, historical: boolean, next: unknown): unknown {
  const entries = historical
    ? (Array.isArray(original) ? original : original === undefined || original === null ? [] : [
      original,
    ])
    : [original];
  const latest = entries[entries.length - 1];
  const base = isPlainObject(latest) ? latest : {};
  const nextEntry = { ...base, value: next };
  return historical
    ? (Array.isArray(original) && original.length > 0
      ? [...original.slice(0, -1), nextEntry]
      : [nextEntry])
    : nextEntry;
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

/** Inline editor for one cell — the right control for the value_type,
 *  committing on blur / Enter / pick, cancelling on Escape. */
function CellEditor(p: {
  valueType: string;
  enumRef: string | undefined;
  schemas: SchemaCatalogue;
  locale: Locale;
  initial: unknown;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useT();
  const cancelled = useRef(false);

  if (p.valueType === 'enum') {
    const vocab = p.schemas.vocabularies[p.enumRef ?? ''];
    const options = Object.entries(vocab?.values ?? {}).map(([id, v]) => ({
      id,
      label: v.labels[p.locale] ?? v.labels.en ?? id,
    }));
    const current = typeof p.initial === 'string' && p.initial !== '' ? p.initial : undefined;
    return (
      <Select
        value={current}
        onValueChange={(v) => {
          if (v !== undefined && v !== null && v !== '') p.onCommit(v);
        }}
        defaultOpen
        onOpenChange={(open) => {
          if (!open) p.onCancel();
        }}
      >
        <SelectTrigger className='w-full max-w-56'>
          <SelectValue placeholder={t('pickOne')}>
            {current !== undefined
              ? vocabLabelOf(p.schemas, p.enumRef, current, p.locale)
              : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // string / number / date share the input recipe.
  const initialText = p.initial === undefined || p.initial === null ? '' : String(p.initial);
  const commitText = (text: string): void => {
    if (cancelled.current) return;
    const trimmed = text.trim();
    // An emptied field cancels rather than writing an empty value —
    // clearing values goes through the full form.
    if (trimmed === '') {
      p.onCancel();
      return;
    }
    if (p.valueType === 'number') {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        p.onCancel();
        return;
      }
      p.onCommit(n);
      return;
    }
    p.onCommit(trimmed);
  };
  return (
    <Input
      autoFocus
      type={p.valueType === 'number' ? 'number' : p.valueType === 'date' ? 'date' : 'text'}
      defaultValue={initialText}
      aria-label={t('exploreEditValue')}
      className={p.valueType === 'date' ? 'w-44 font-mono' : 'max-w-56'}
      onBlur={(e) => commitText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitText(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          p.onCancel();
        }
      }}
    />
  );
}

/** One property cell in columns mode. */
function ValueCell(p: {
  row: AuditRow;
  propertyId: string;
  schemas: SchemaCatalogue;
  locale: Locale;
  draft: { readonly has: boolean; readonly value: unknown; };
  editing: boolean;
  onStartEdit: () => void;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useT();
  const pt = p.schemas.propertyTypes[p.propertyId];
  const declared = declOf(p.schemas, p.row.type, p.propertyId) !== undefined;
  const editable = cellEditable(p.schemas, p.row.type, p.propertyId);
  const pv = p.row.values.find((v) => v.property === p.propertyId);
  const entries = pv?.entries ?? [];
  const label = propertyLabelOf(p.schemas, p.propertyId, p.locale);
  const latestValue = p.draft.has ? p.draft.value : latestRawValue(p.row, p.propertyId);

  let content: JSX.Element;
  if (!declared) {
    // The selected entity types don't all share every chosen column —
    // an undeclared property is a plain muted dash, NOT a warning.
    content = (
      <span className='text-muted-foreground/50 text-xs' title={t('exploreNotApplicable')}>
        —
      </span>
    );
  } else if (p.editing && pt !== undefined) {
    content = (
      <CellEditor
        valueType={pt.value_type}
        enumRef={pt.value_constraints?.enum_ref}
        schemas={p.schemas}
        locale={p.locale}
        initial={latestValue}
        onCommit={p.onCommit}
        onCancel={p.onCancel}
      />
    );
  } else {
    const missing = !p.draft.has && entries.length === 0;
    const body = p.draft.has
      ? (
        <span className='text-primary flex items-center gap-1.5 text-xs font-medium'>
          <span aria-hidden='true' className='bg-primary size-1.5 shrink-0 rounded-full' />
          {formatDraft(p.draft.value, p.propertyId, p.schemas, p.locale)}
        </span>
      )
      : missing
      ? (
        // Missing value → amber WARNING chip (advisory, never an error).
        <span
          title={t('missingValue')}
          className='inline-block rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 text-xs text-amber-500'
        >
          —
        </span>
      )
      : (
        <span className='block space-y-0.5'>
          {entries.map((entry, i) => (
            <span key={i} className='block break-words text-xs'>
              {entry.display}
              {entry.since !== undefined
                ? <span className='text-muted-foreground ml-1.5'>{entry.since}</span>
                : null}
            </span>
          ))}
        </span>
      );
    content = editable
      ? (
        <button
          type='button'
          onClick={() => {
            // Booleans toggle in place — no editor state needed.
            if (pt?.value_type === 'boolean') p.onCommit(!(latestValue === true));
            else p.onStartEdit();
          }}
          aria-label={`${t('exploreEditValue')} — ${label}`}
          className='hover:bg-accent/40 -mx-1 block w-full min-w-0 rounded px-1 py-0.5 text-left'
        >
          {body}
        </button>
      )
      : <span className='block min-w-0 py-0.5'>{body}</span>;
  }

  return (
    <div className='flex min-w-0 items-start gap-1'>
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground truncate text-xs'>{label}</p>
        {content}
      </div>
      {/* "More options" — complex cases go through the full page. */}
      {declared && !p.editing
        ? (
          <Link
            to='/types/$type/$slug'
            params={{ type: p.row.type, slug: p.row.slug }}
            aria-label={t('fullPage')}
            title={t('fullPage')}
            className='text-muted-foreground/60 hover:text-foreground mt-0.5 shrink-0'
          >
            <MoreHorizontal className='size-3.5' aria-hidden='true' />
          </Link>
        )
        : null}
    </div>
  );
}

/** Localized display for a pending draft scalar — vocabulary label
 *  for enums, ✓/× booleans, localized number + unit. */
function formatDraft(
  value: unknown,
  propertyId: string,
  schemas: SchemaCatalogue,
  locale: Locale,
): string {
  const pt = schemas.propertyTypes[propertyId];
  if (value === true) return '✓';
  if (value === false) return '×';
  if (pt?.value_type === 'enum' && typeof value === 'string') {
    return vocabLabelOf(schemas, pt.value_constraints?.enum_ref, value, locale);
  }
  if (typeof value === 'number') {
    const formatted = value.toLocaleString(locale);
    return pt?.unit !== undefined ? `${formatted} ${pt.unit}` : formatted;
  }
  return String(value ?? '—');
}

function ExploreRow(p: {
  row: AuditRow;
  schemas: SchemaCatalogue | null;
  locale: Locale;
  chosenProps: readonly string[];
  draft: Readonly<Record<string, unknown>> | undefined;
  editingProp: string | null;
  onStartEdit: (propertyId: string) => void;
  onCommit: (propertyId: string, next: unknown) => void;
  onCancelEdit: () => void;
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
  );

  const schemas = p.schemas;
  if (columnsMode && schemas !== null) {
    // Columns mode: one cell per chosen property; the completeness
    // meter / x/y count is deliberately hidden ("on n'affiche pas le
    // 1/1") — the amber chips carry the missing-value signal.
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
              draft={p.draft !== undefined && pid in p.draft
                ? { has: true, value: p.draft[pid] }
                : { has: false, value: undefined }}
              editing={p.editingProp === pid}
              onStartEdit={() => p.onStartEdit(pid)}
              onCommit={(next) => p.onCommit(pid, next)}
              onCancel={p.onCancelEdit}
            />
          ))}
        </div>
      </div>
    );
  }

  // Default mode: always-expanded compact row — the values summary
  // sits directly under the entity line (no click-to-open, no pencil).
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
                            <span className='text-muted-foreground shrink-0 text-xs'>
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
      {nValues > 0
        ? (
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
        )
        : null}
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
  const { data, error, reload } = useApiResource(
    () => Promise.all([api.audit(), api.schemas()]),
    [],
  );
  const rows = data?.[0].rows ?? null;
  const schemas = data?.[1] ?? null;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [chosenProps, setChosenProps] = useState<readonly string[]>([]);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Readonly<Record<string, unknown>>>>(
    new Map(),
  );
  const [editingCell, setEditingCell] = useState<
    { entityId: string; propertyId: string; } | null
  >(null);
  const [saving, setSaving] = useState<{ done: number; total: number; } | null>(null);
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

  const rowById = useMemo(
    () => new Map((rows ?? []).map((r) => [r.id, r])),
    [rows],
  );

  function commitCell(entityId: string, propertyId: string, next: unknown): void {
    setEditingCell(null);
    const row = rowById.get(entityId);
    if (row === undefined) return;
    setDrafts((prev) => {
      const map = new Map(prev);
      const current: Record<string, unknown> = { ...map.get(entityId) };
      const original = latestRawValue(row, propertyId);
      // Re-committing the original value clears the pending edit.
      if (Object.is(next, original)) delete current[propertyId];
      else current[propertyId] = next;
      if (Object.keys(current).length === 0) map.delete(entityId);
      else map.set(entityId, current);
      return map;
    });
  }

  /**
   * One PR per edited entity via the SAME save endpoint as the table
   * view (`api.saveEntity`): fetch the entity fresh (full data + SHA +
   * translations), splice each edited scalar into the latest entry of
   * its property (qualifiers preserved), save sequentially to stay
   * inside GitHub rate limits.
   */
  async function saveAll(): Promise<void> {
    if (drafts.size === 0 || schemas === null) return;
    const items = [...drafts.entries()];
    setSaving({ done: 0, total: items.length });
    let opened = 0;
    const failures: { id: string; message: string; }[] = [];
    for (const [entityId, edits] of items) {
      const row = rowById.get(entityId);
      if (row === undefined) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const detail = await api.getEntity(row.type, row.slug);
        const nextData: Record<string, unknown> = { ...detail.data };
        const baseProps: Record<string, unknown> = isPlainObject(detail.data['properties'])
          ? { ...detail.data['properties'] }
          : {};
        for (const [propertyId, value] of Object.entries(edits)) {
          const decl = declOf(schemas, row.type, propertyId);
          baseProps[propertyId] = writeLatestValue(
            baseProps[propertyId],
            decl?.historical ?? false,
            value,
          );
        }
        nextData['properties'] = baseProps;
        // eslint-disable-next-line no-await-in-loop
        await api.saveEntity(row.type, row.slug, nextData, detail.sha, detail.translations);
        opened += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ id: entityId, message });
        // eslint-disable-next-line no-console
        console.error(`[explore save] ${entityId} failed:`, message);
      }
      setSaving((s) => s === null ? null : { done: s.done + 1, total: s.total });
    }
    setSaving(null);
    if (failures.length === 0) {
      toast.success(`${opened} ${t('bulkSaveDone')}`);
      setDrafts(new Map());
      reload();
      return;
    }
    const first = failures[0]!;
    const hint = /401|unauthorized|sign in/i.test(first.message)
      ? ' — sign in first'
      : /503|app not/i.test(first.message)
      ? ' — GitHub App not installed on the data repo'
      : '';
    toast.error(`${failures.length} ${t('bulkSaveFailed')} (${opened} ok)`, {
      description: `${first.id}: ${first.message}${hint}${
        failures.length > 1 ? ` (+${failures.length - 1} more — see console)` : ''
      }`,
      duration: 10_000,
    });
  }

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
      draft={drafts.get(row.id)}
      editingProp={editingCell !== null && editingCell.entityId === row.id
        ? editingCell.propertyId
        : null}
      onStartEdit={(propertyId) => setEditingCell({ entityId: row.id, propertyId })}
      onCommit={(propertyId, next) => commitCell(row.id, propertyId, next)}
      onCancelEdit={() => setEditingCell(null)}
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
        /* Sticky save bar — appears only with pending edits; one
          primary action (Save), one PR per edited entity. z-40 sits
          above the mobile BottomNav on purpose: while edits are
          pending, saving/cancelling IS the primary navigation. */
      }
      {drafts.size > 0
        ? (
          <>
            <div aria-hidden='true' className='h-16' />
            <div
              className='border-border bg-background fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t px-[var(--page-px)] py-3 sm:px-6 lg:left-64'
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <span className='text-muted-foreground text-xs'>
                {t('exploreEditsCount').replace('{n}', String(drafts.size))}
              </span>
              <div className='flex shrink-0 items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={saving !== null}
                  onClick={() => {
                    setDrafts(new Map());
                    setEditingCell(null);
                  }}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type='button'
                  disabled={saving !== null}
                  onClick={() => void saveAll()}
                >
                  {saving !== null
                    ? `${t('bulkSavingProgress')} ${saving.done}/${saving.total}…`
                    : t('exploreSaveChanges').replace('{n}', String(drafts.size))}
                </Button>
              </div>
            </div>
          </>
        )
        : null}
    </div>
  );
}
