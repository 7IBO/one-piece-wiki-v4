/**
 * Bulk-edit "table" view for an entity type.
 *
 * Why this exists: editing entities one-by-one through the EntityForm
 * doesn't scale. A maintainer fixing missing French names for 50
 * characters would otherwise click through 50 pages. The table view
 * shows every entity of a type as a row and every selected property
 * as a column, lets the maintainer fill missing cells inline, and
 * opens one PR per modified entity on save.
 *
 * Editable in-cell (MVP):
 *  - string / number / boolean / enum / date  — direct value edit
 *  - i18n_key (localizable, e.g. `name`)      — edits the active
 *    locale's translation for the latest entry's value_key
 *    (auto-generated as `${entity.id}.${propertyId}` when absent)
 *
 * Not editable in-cell (drawer-only — preview + "Edit" link):
 *  - entity_ref / source_ref / multi_enum / markdown / i18n_key
 *    on non-historical or unusual shapes — anything that needs the
 *    full form's picker + qualifier UX
 *
 * Save flow: dirty entities save sequentially via the existing
 * single-entity endpoint (one PR per row). The bulk-table response
 * doesn't include SHAs, so saves go through without optimistic
 * locking — acceptable for the table view since the maintainer
 * already sees every row's current state on screen.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { PropertyTypeSchema } from '@onepiece-wiki/schemas';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, ChevronLeft, Columns3, RotateCcw, Save, Search } from 'lucide-react';
import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type SchemaCatalogue, type TableEntity, type Translations } from '../api';
import { useEntityDrawer } from '../form/EntityDrawerProvider';
import { type Locale, useLocale, useT } from '../form/locale';

export const Route = createFileRoute('/types/$type/table')({
  component: TableComponent,
});

/** Inline-editable value types — anything else opens the drawer. */
const INLINE_EDITABLE = new Set([
  'string',
  'number',
  'boolean',
  'enum',
  'date',
  'i18n_key',
]);

/** Per-entity draft of pending edits. Stored sparsely (only properties
 *  the user actually touched) so we can diff cleanly against the
 *  original entity to know which cells are dirty. */
type EntityDraft = {
  readonly properties: Record<string, unknown>;
  readonly translations: Partial<Translations>;
};

function emptyDraft(): EntityDraft {
  return { properties: {}, translations: {} };
}

function propertyLabel(pt: PropertyTypeSchema, locale: Locale): string {
  return pt.labels[locale] ?? pt.labels.en ?? pt.id;
}

function entityName(
  e: TableEntity,
  locale: Locale,
  draft: EntityDraft | undefined,
): string {
  // Prefer a dirty draft's name translation, fall back to disk.
  const props = e.data['properties'] as Record<string, unknown> | undefined;
  const raw = (draft?.properties['name'] ?? props?.['name']) as unknown;
  const entries = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const last = entries[entries.length - 1];
  if (last !== undefined && typeof last === 'object' && last !== null) {
    const k = (last as Record<string, unknown>)['value_key'];
    if (typeof k === 'string' && k !== '') {
      const t = draft?.translations[locale]?.[k]
        ?? e.translations[locale][k]
        ?? e.translations.en[k];
      if (typeof t === 'string' && t.length > 0) return t;
    }
  }
  return e.slug;
}

/** Read the cell's current value from draft → entity. Returns the
 *  visible text and the raw value (for entering edit mode). For
 *  localizable props the returned `raw` is the translation string. */
function readCell(
  e: TableEntity,
  pt: PropertyTypeSchema,
  locale: Locale,
  draft: EntityDraft | undefined,
): { text: string; raw: unknown; valueKey: string | null; } {
  const props = e.data['properties'] as Record<string, unknown> | undefined;
  const rawProp = (draft?.properties[pt.id] ?? props?.[pt.id]) as unknown;
  const entries = pt.historical
    ? (Array.isArray(rawProp) ? rawProp : rawProp === undefined ? [] : [rawProp])
    : [rawProp];
  const latest = entries[entries.length - 1] as Record<string, unknown> | undefined;
  if (latest === undefined || latest === null) {
    return { text: '', raw: undefined, valueKey: null };
  }
  if (pt.localizable) {
    const key = latest['value_key'] as string | undefined;
    if (typeof key !== 'string' || key === '') {
      return { text: '', raw: '', valueKey: null };
    }
    const t = draft?.translations[locale]?.[key] ?? e.translations[locale][key] ?? '';
    return { text: t, raw: t, valueKey: key };
  }
  const v = latest['value'];
  const text = formatValue(v);
  return { text, raw: v, valueKey: null };
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (Array.isArray(v)) return `${v.length} items`;
  if (typeof v === 'object') return '…';
  return String(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Write the user's edit back into the draft. Mirrors the EntityForm
 *  shape: historical → array of `{ value | value_key, ...qualifiers }`
 *  entries; non-historical → a single such object. Preserves any
 *  qualifiers already present on the latest entry. */
function writeCell(
  draft: EntityDraft,
  e: TableEntity,
  pt: PropertyTypeSchema,
  locale: Locale,
  next: unknown,
): EntityDraft {
  const props = e.data['properties'] as Record<string, unknown> | undefined;
  const original = (draft.properties[pt.id] ?? props?.[pt.id]) as unknown;

  if (pt.localizable) {
    const text = typeof next === 'string' ? next : '';
    // Re-use existing value_key or generate a fresh, stable one.
    let key: string;
    const entries = pt.historical
      ? (Array.isArray(original) ? original : original === undefined ? [] : [original])
      : [original];
    const latest = entries[entries.length - 1];
    if (
      isPlainObject(latest) && typeof latest['value_key'] === 'string' && latest['value_key'] !== ''
    ) {
      key = latest['value_key'];
    } else {
      key = `${e.id}.${pt.id}`;
    }
    // Update translation map for the active locale.
    const localeMap = { ...draft.translations[locale] };
    if (text === '') delete localeMap[key];
    else localeMap[key] = text;
    const nextTranslations: Partial<Translations> = {
      ...draft.translations,
      [locale]: localeMap,
    };
    // Ensure the property entry references this key.
    const nextEntry = isPlainObject(latest)
      ? { ...latest, value_key: key }
      : { value_key: key };
    const nextProp = pt.historical
      ? (Array.isArray(original) && original.length > 0
        ? [...original.slice(0, -1), nextEntry]
        : [nextEntry])
      : nextEntry;
    return {
      properties: { ...draft.properties, [pt.id]: nextProp },
      translations: nextTranslations,
    };
  }

  // Non-localizable: update latest entry's `value`, or set the
  // non-historical singleton.
  const entries = pt.historical
    ? (Array.isArray(original) ? original : original === undefined ? [] : [original])
    : [original];
  const latest = entries[entries.length - 1];
  const baseEntry = isPlainObject(latest) ? latest : {};
  const nextEntry = { ...baseEntry, value: next };
  const nextProp = pt.historical
    ? (Array.isArray(original) && original.length > 0
      ? [...original.slice(0, -1), nextEntry]
      : [nextEntry])
    : nextEntry;
  return {
    properties: { ...draft.properties, [pt.id]: nextProp },
    translations: draft.translations,
  };
}

function TableComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const locale = useLocale();
  const t = useT();
  const drawer = useEntityDrawer();
  const [rows, setRows] = useState<readonly TableEntity[] | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Map<string, EntityDraft>>(new Map());
  const [saving, setSaving] = useState<{ done: number; total: number; } | null>(null);
  const [selectedCols, setSelectedCols] = useState<readonly string[]>([]);
  // Track whether the user has touched the column picker, so we don't
  // keep clobbering their choice with the schema's default each render.
  const colsInitialized = useRef(false);

  useEffect(() => {
    setRows(null);
    setError(null);
    setDrafts(new Map());
    colsInitialized.current = false;
    Promise.all([api.tableEntities(type), api.schemas()])
      .then(([r, s]) => {
        setRows(r.entities);
        setSchemas(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [type]);

  const entityType = schemas?.entityTypes[type];
  const propertyTypes = schemas?.propertyTypes ?? {};

  /**
   * Resolve declared properties for this entity type. The entity-type
   * schema may override `historical` / `localizable` on a per-decl
   * basis — those overrides drive how the JSON is shaped on disk, so
   * they MUST win over the property-type's defaults for table reads
   * and writes.
   */
  const allowedProperties = useMemo(() => {
    if (entityType === undefined) return [] as PropertyTypeSchema[];
    return entityType.properties
      .map((decl) => {
        const pt = propertyTypes[decl.id];
        if (pt === undefined) return undefined;
        return {
          ...pt,
          historical: decl.historical ?? pt.historical,
          localizable: decl.localizable ?? pt.localizable,
        };
      })
      .filter((pt): pt is PropertyTypeSchema => pt !== undefined);
  }, [entityType, propertyTypes]);

  // Default column set: identity-ish properties (name + a couple of
  // notable scalars). The maintainer can always open the picker to
  // expand from here.
  useEffect(() => {
    if (colsInitialized.current) return;
    if (allowedProperties.length === 0) return;
    const defaults = allowedProperties
      .filter((pt) =>
        pt.id === 'name'
        || pt.id === 'slug'
        || pt.value_type === 'i18n_key'
      )
      .slice(0, 3)
      .map((pt) => pt.id);
    setSelectedCols(defaults.length > 0 ? defaults : [allowedProperties[0]!.id]);
    colsInitialized.current = true;
  }, [allowedProperties]);

  const visibleCols = useMemo(
    () =>
      selectedCols
        .map((id) => allowedProperties.find((pt) => pt.id === id))
        .filter((pt): pt is PropertyTypeSchema => pt !== undefined),
    [selectedCols, allowedProperties],
  );

  const display = useMemo(() => {
    if (rows === null) return null;
    const q = query.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) => {
      const name = entityName(r, locale, drafts.get(r.id)).toLowerCase();
      return name.includes(q) || r.slug.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    });
  }, [rows, query, locale, drafts]);

  function updateDraft(entityId: string, updater: (d: EntityDraft) => EntityDraft): void {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(entityId) ?? emptyDraft();
      const updated = updater(current);
      // If updater clears everything, drop the entry so save count
      // matches what the user expects.
      if (
        Object.keys(updated.properties).length === 0
        && Object.values(updated.translations).every((m) =>
          m === undefined || Object.keys(m).length === 0
        )
      ) {
        next.delete(entityId);
      } else {
        next.set(entityId, updated);
      }
      return next;
    });
  }

  function resetDraft(entityId: string): void {
    setDrafts((prev) => {
      if (!prev.has(entityId)) return prev;
      const next = new Map(prev);
      next.delete(entityId);
      return next;
    });
  }

  async function saveAll(): Promise<void> {
    if (drafts.size === 0 || rows === null) return;
    const entityById = new Map(rows.map((r) => [r.id, r]));
    const items = [...drafts.entries()];
    setSaving({ done: 0, total: items.length });
    let opened = 0;
    const failures: { id: string; message: string; }[] = [];
    for (const [id, draft] of items) {
      const original = entityById.get(id);
      if (original === undefined) continue;
      // Compose the full payload: original data + draft property
      // overrides; original translations + draft translation overrides.
      const data: Record<string, unknown> = { ...original.data };
      const baseProps = (original.data['properties'] as Record<string, unknown> | undefined) ?? {};
      data['properties'] = { ...baseProps, ...draft.properties };
      const translations: Translations = {
        en: { ...original.translations.en, ...draft.translations.en },
        fr: { ...original.translations.fr, ...draft.translations.fr },
      };
      try {
        // Intentionally sequential: parallel PR opens would hammer
        // GitHub's rate limits and produce racy merge conflicts when
        // multiple PRs touch overlapping files (translation maps).
        // eslint-disable-next-line no-await-in-loop
        await api.saveEntity(original.type, original.slug, data, null, translations);
        opened += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ id: original.id, message });
        // eslint-disable-next-line no-console
        console.error(`[table save] ${original.id} failed:`, message);
      }
      setSaving((s) => s === null ? null : { done: s.done + 1, total: s.total });
    }
    setSaving(null);
    if (failures.length === 0) {
      toast.success(`${opened} ${t('bulkSaveDone')}`);
      setDrafts(new Map());
      return;
    }
    // Surface the *actual* first error so the maintainer can act on
    // it. "Some saves failed" alone is useless — common causes are
    // (a) not signed in, (b) GitHub App not installed on the repo,
    // (c) schema validation. The full list goes to the console.
    const first = failures[0]!;
    const hint = /401|unauthorized|sign in/i.test(first.message)
      ? ' — sign in first'
      : /503|app not/i.test(first.message)
      ? ' — GitHub App not installed on the data repo'
      : '';
    toast.error(
      `${failures.length} ${t('bulkSaveFailed')} (${opened} ok)`,
      {
        description: `${first.id}: ${first.message}${hint}${
          failures.length > 1 ? ` (+${failures.length - 1} more — see console)` : ''
        }`,
        duration: 10_000,
      },
    );
  }

  if (error !== null) {
    return <p className='text-destructive'>Failed: {error}</p>;
  }

  const entityTypeLabel = entityType?.labels[locale] ?? entityType?.labels.en ?? type;
  const totalDirty = drafts.size;

  return (
    <div className='flex h-[calc(100vh-6rem)] flex-col gap-3'>
      {/* Header */}
      <div className='border-border space-y-2 border-b pb-3'>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-1.5 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {entityTypeLabel}
        </Button>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {entityTypeLabel}
            <span className='text-muted-foreground ml-2 text-xs font-normal'>
              · {t('tableView')}
            </span>
          </h1>
          <span className='text-muted-foreground text-xs'>
            {rows === null
              ? t('loading')
              : display?.length === rows.length
              ? `${rows.length}`
              : `${display?.length ?? 0} / ${rows.length}`}
          </span>
          {totalDirty > 0
            ? (
              <Badge variant='outline' className='text-amber-500'>
                ● {totalDirty} {t('bulkSavePending')}
              </Badge>
            )
            : null}
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <div className='relative'>
              <Search className='text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2' />
              <Input
                type='search'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                className='h-8 w-48 pl-7 text-xs'
              />
            </div>
            <ColumnPicker
              all={allowedProperties}
              selected={selectedCols}
              onChange={setSelectedCols}
              locale={locale}
              t={t}
            />
            <Button
              type='button'
              size='sm'
              disabled={totalDirty === 0 || saving !== null}
              onClick={() => void saveAll()}
            >
              <Save className='size-3.5' />
              {saving !== null
                ? `${t('bulkSavingProgress')} ${saving.done}/${saving.total}…`
                : `${t('bulkSaveAll')}${totalDirty > 0 ? ` (${totalDirty})` : ''}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      {rows === null
        ? <Skeleton className='h-64 w-full' />
        : visibleCols.length === 0
        ? (
          <div className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            {t('noColumnsSelected')}
          </div>
        )
        : display === null || display.length === 0
        ? (
          <div className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            {t('noMatch')}
          </div>
        )
        : (
          <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
            <table className='w-full border-separate border-spacing-0 text-xs'>
              <thead className='sticky top-0 z-10'>
                <tr>
                  <th className='bg-muted text-muted-foreground sticky left-0 z-20 border-b border-r px-3 py-2 text-left font-medium'>
                    {t('entity')}
                  </th>
                  {visibleCols.map((pt) => (
                    <th
                      key={pt.id}
                      className='bg-muted text-muted-foreground border-b px-3 py-2 text-left font-medium'
                    >
                      <div className='flex items-baseline gap-1.5'>
                        <span>{propertyLabel(pt, locale)}</span>
                        <span className='font-mono text-[9px] opacity-60'>
                          {pt.value_type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.map((row) => {
                  const draft = drafts.get(row.id);
                  const isDirty = draft !== undefined;
                  return (
                    <tr key={row.id} className='hover:bg-accent/20'>
                      <td className='bg-background sticky left-0 z-10 border-b border-r px-3 py-1.5 align-top'>
                        <div className='flex items-center gap-1.5'>
                          <Link
                            to='/types/$type/$slug'
                            params={{ type: row.type, slug: row.slug }}
                            className='hover:underline truncate font-medium'
                            title={row.id}
                          >
                            {entityName(row, locale, draft)}
                          </Link>
                          {isDirty
                            ? (
                              <button
                                type='button'
                                onClick={() => resetDraft(row.id)}
                                className='text-muted-foreground hover:text-foreground'
                                aria-label={t('resetCell')}
                                title={t('resetCell')}
                              >
                                <RotateCcw className='size-3' />
                              </button>
                            )
                            : null}
                        </div>
                        <div className='text-muted-foreground font-mono text-[9px]'>
                          {row.slug}
                        </div>
                      </td>
                      {visibleCols.map((pt) => (
                        <EditableCell
                          key={pt.id}
                          entity={row}
                          propertyType={pt}
                          locale={locale}
                          draft={draft}
                          t={t}
                          onCommit={(next) => {
                            updateDraft(row.id, (d) => writeCell(d, row, pt, locale, next));
                          }}
                          onOpenDrawer={drawer === null
                            ? undefined
                            : () => drawer.openEntity(row.type, row.slug)}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

/* ───────────────────────── Column picker ───────────────────────── */

function ColumnPicker(p: {
  all: readonly PropertyTypeSchema[];
  selected: readonly string[];
  onChange: (next: readonly string[]) => void;
  locale: Locale;
  t: ReturnType<typeof useT>;
}): JSX.Element {
  function toggle(id: string): void {
    if (p.selected.includes(id)) p.onChange(p.selected.filter((s) => s !== id));
    else p.onChange([...p.selected, id]);
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type='button' variant='outline' size='sm' className='h-8 gap-1.5 text-xs'>
            <Columns3 className='size-3.5' />
            {p.t('columns')} · {p.selected.length}/{p.all.length}
          </Button>
        }
      />
      <PopoverContent align='end' side='bottom' className='w-72 max-h-[60vh] overflow-y-auto p-2'>
        <p className='text-muted-foreground mb-2 px-1 text-[10px] uppercase tracking-wide'>
          {p.t('pickColumns')}
        </p>
        <div className='space-y-0.5'>
          {p.all.map((pt) => {
            const isChecked = p.selected.includes(pt.id);
            return (
              <label
                key={pt.id}
                className='hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs'
              >
                <input
                  type='checkbox'
                  checked={isChecked}
                  onChange={() => toggle(pt.id)}
                  className='shrink-0'
                />
                <span className='flex-1 truncate'>{propertyLabel(pt, p.locale)}</span>
                <span className='text-muted-foreground font-mono text-[9px]'>
                  {pt.value_type}
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────── Editable cell ───────────────────────── */

function EditableCell(p: {
  entity: TableEntity;
  propertyType: PropertyTypeSchema;
  locale: Locale;
  draft: EntityDraft | undefined;
  t: ReturnType<typeof useT>;
  onCommit: (next: unknown) => void;
  onOpenDrawer: (() => void) | undefined;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const { text, raw } = readCell(p.entity, p.propertyType, p.locale, p.draft);
  const inlineEditable = INLINE_EDITABLE.has(p.propertyType.value_type);
  // The original-on-disk text drives dirty styling — comparing to
  // current "text" tells us whether the user actually changed it.
  const originalText = readCell(p.entity, p.propertyType, p.locale, undefined).text;
  const cellDirty = text !== originalText;

  function commit(next: unknown): void {
    setEditing(false);
    p.onCommit(next);
  }

  if (!inlineEditable) {
    return (
      <td className='border-b px-3 py-1.5 align-top'>
        <div className='flex items-center gap-1.5'>
          <span className={text === '' ? 'text-muted-foreground italic' : 'truncate'}>
            {text === '' ? p.t('empty') : text}
          </span>
          {p.onOpenDrawer !== undefined
            ? (
              <button
                type='button'
                onClick={p.onOpenDrawer}
                className='text-muted-foreground hover:text-foreground'
                aria-label={p.t('editInFullForm')}
                title={p.t('editInFullForm')}
              >
                <ArrowUpRight className='size-3' />
              </button>
            )
            : null}
        </div>
      </td>
    );
  }

  return (
    <td
      className={`border-b px-3 py-1.5 align-top ${
        cellDirty ? 'bg-amber-500/10 ring-1 ring-amber-500/30 ring-inset' : ''
      }`}
      onClick={() => {
        if (!editing) setEditing(true);
      }}
    >
      {editing
        ? (
          <CellEditor
            propertyType={p.propertyType}
            initial={raw}
            onCommit={commit}
            onCancel={() => setEditing(false)}
          />
        )
        : (
          <span className={text === '' ? 'text-muted-foreground italic' : 'truncate'}>
            {text === '' ? p.t('empty') : text}
          </span>
        )}
    </td>
  );
}

/* ─────────────────────── Per-value-type editor ─────────────────── */

function CellEditor(p: {
  propertyType: PropertyTypeSchema;
  initial: unknown;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}): JSX.Element {
  const valueType = p.propertyType.value_type;

  if (valueType === 'boolean') {
    const init = p.initial === true;
    return (
      <input
        type='checkbox'
        defaultChecked={init}
        autoFocus
        onChange={(e) => p.onCommit(e.target.checked)}
        onBlur={() => p.onCancel()}
      />
    );
  }

  if (valueType === 'enum') {
    const enumRef = p.propertyType.value_constraints?.enum_ref;
    // We don't have the vocabulary here; fall back to a free text input
    // typed as the enum id. (Full enum picker → use drawer.) MVP
    // compromise: enum cells edit as text matching the id.
    void enumRef;
    return (
      <TextCellEditor
        defaultValue={typeof p.initial === 'string' ? p.initial : ''}
        onCommit={(s) => p.onCommit(s === '' ? undefined : s)}
        onCancel={p.onCancel}
      />
    );
  }

  if (valueType === 'number') {
    return (
      <TextCellEditor
        defaultValue={p.initial === undefined || p.initial === null ? '' : String(p.initial)}
        onCommit={(s) => {
          if (s === '') return p.onCommit(undefined);
          const n = Number(s);
          if (Number.isFinite(n)) p.onCommit(n);
          else p.onCancel();
        }}
        onCancel={p.onCancel}
        type='number'
      />
    );
  }

  if (valueType === 'date') {
    return (
      <TextCellEditor
        defaultValue={typeof p.initial === 'string' ? p.initial : ''}
        onCommit={(s) => p.onCommit(s === '' ? undefined : s)}
        onCancel={p.onCancel}
        type='date'
      />
    );
  }

  // string / i18n_key (localizable text) → plain text editor
  return (
    <TextCellEditor
      defaultValue={typeof p.initial === 'string' ? p.initial : ''}
      onCommit={(s) => p.onCommit(s)}
      onCancel={p.onCancel}
    />
  );
}

function TextCellEditor(p: {
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  type?: 'text' | 'number' | 'date';
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type={p.type ?? 'text'}
      defaultValue={p.defaultValue}
      className='border-input bg-background w-full rounded-[3px] border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring'
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          p.onCommit((e.target as HTMLInputElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          p.onCancel();
        }
      }}
      onBlur={(e) => p.onCommit(e.target.value)}
    />
  );
}
