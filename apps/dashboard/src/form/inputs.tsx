/**
 * Value-input registry, keyed by `value_type` so the form generator
 * stays schema-driven (no per-property-name component).
 *
 * Display rules at scale (hundreds of entities, dozens of properties):
 *  - Entity / source pickers show the entity's translated *name*, not
 *    its slug. Slug appears as muted secondary text. The picker is
 *    split into a tiny type Select + a searchable name Combobox so
 *    the maintainer never scrolls through "all 1000+ entities at once".
 *  - Enum selects lead with the localized `labels[locale]` value; the
 *    raw enum id is muted secondary text. We use a Combobox once the
 *    vocabulary has more than ENUM_COMBOBOX_THRESHOLD values.
 */
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  MobileSheet,
  MobileSheetContent,
  MobileSheetTrigger,
  useShouldUseSheet,
} from '@/components/ui/mobile-sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Checkbox } from '@base-ui-components/react/checkbox';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsUpDown, Pencil, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import { api, type EntityRef, type SourceRef } from '../api';
import { useEntityDrawer } from './EntityDrawerProvider';
import { type Locale, useLocale, useT } from './locale';

const ENUM_COMBOBOX_THRESHOLD = 10;

type CommonProps = {
  disabled?: boolean | undefined;
};

type InputProps<T> = CommonProps & {
  value: T | undefined;
  onChange: (next: T) => void;
};

function pickName(
  displayName: { en: string | null; fr: string | null; } | undefined,
  fallback: string,
  locale: Locale,
): string {
  if (displayName === undefined) return fallback;
  return displayName[locale] ?? displayName.en ?? displayName.fr ?? fallback;
}

export function StringInput({ value, onChange, disabled }: InputProps<string>): JSX.Element {
  return (
    <Input
      type='text'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DateInput({ value, onChange, disabled }: InputProps<string>): JSX.Element {
  return (
    <Input
      type='date'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
      className='w-44 font-mono'
    />
  );
}

export function NumberInput({ value, onChange, disabled }: InputProps<number>): JSX.Element {
  return (
    <Input
      type='number'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => {
        const next = e.target.value === '' ? 0 : Number(e.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
    />
  );
}

export function BooleanInput({ value, onChange, disabled }: InputProps<boolean>): JSX.Element {
  return (
    <Checkbox.Root
      checked={value === true}
      disabled={disabled === true}
      onCheckedChange={(next) => onChange(next === true)}
      className='border-input data-[checked]:bg-primary data-[checked]:border-primary inline-flex size-4 items-center justify-center rounded border'
    >
      <Checkbox.Indicator className='text-primary-foreground text-xs leading-none'>
        ✓
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export type EnumValue = {
  readonly id: string;
  readonly labels?: { readonly en: string; readonly fr: string; } | undefined;
  readonly label?: string | undefined;
};

function enumLabel(v: EnumValue, locale: Locale): string {
  if (v.labels !== undefined) return v.labels[locale] ?? v.labels.en ?? v.id;
  return v.label ?? v.id;
}

export function EnumInput(
  { value, onChange, enumValues, disabled }: InputProps<string> & {
    enumValues: readonly EnumValue[];
  },
): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const items = useMemo(
    () =>
      enumValues.map((v) => ({
        value: v.id,
        label: enumLabel(v, locale),
        searchText: `${enumLabel(v, locale)} ${v.id}`,
      })),
    [enumValues, locale],
  );

  if (enumValues.length > ENUM_COMBOBOX_THRESHOLD) {
    return (
      <Combobox
        value={value}
        onChange={onChange}
        items={items}
        placeholder={t('pickOne')}
        emptyText={t('noMatch')}
        disabled={disabled === true}
      />
    );
  }

  // Pass `undefined` rather than `''` so Base UI renders the
  // placeholder. With value=`''` it would treat the empty string as a
  // selected value and fall back to rendering the raw key.
  const selectedLabel = value !== undefined && value !== ''
    ? enumLabel(
      enumValues.find((v) => v.id === value) ?? { id: value, labels: undefined, label: value },
      locale,
    )
    : null;

  return (
    <Select
      value={value === '' ? undefined : value}
      onValueChange={(v) => onChange(v ?? '')}
      disabled={disabled === true}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={t('pickOne')}>
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {enumValues.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {enumLabel(v, locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Entity reference picker.
 *
 * Two display modes depending on how many entity types the caller
 * allows:
 *  - **Single allowed type** (`restrictTo: ['event']`, or one type
 *    that survives the filter): just the searchable name Combobox.
 *    The type is implicit; storing the value still uses the full
 *    `type:slug` id.
 *  - **Multiple allowed types** (`restrictTo: ['character', 'crew',
 *    'organization']`, or no restriction at all): a single merged
 *    Combobox that loads entities of *every* allowed type in
 *    parallel and dumps them in the same list, each annotated with
 *    a tiny type chip. No type Select — the maintainer picks "white
 *    beard" by name and we figure out the type from the chosen item.
 *
 * Rationale: a relation like `ally-of` lists three valid target
 * types in the schema. The old UI surfaced a type dropdown that the
 * maintainer had to pre-narrow before typing, which felt like an
 * obstacle ("I don't want to pick the type, I just want to type
 * the name"). Merging the lists matches Wikidata / Notion / Linear
 * behaviour and keeps the schema as the source of truth (only
 * declared `valid_to_types` show up).
 */
export function EntityRefInput(
  { value, onChange, entityTypes, defaultTypes, restrictTo, disabled }: InputProps<string> & {
    /** Map of entity-type id → human label. Drives the type chip. */
    entityTypes: readonly { id: string; label: string; }[];
    /** Pre-loaded source list, used when the chosen type matches. */
    defaultTypes?: readonly { type: string; entries: readonly EntityRef[]; }[] | undefined;
    /** Restrict pickable types (e.g. `event` qualifier → ['event']). */
    restrictTo?: readonly string[] | undefined;
  },
): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const drawer = useEntityDrawer();
  const allowedTypes = useMemo(() => {
    if (restrictTo === undefined) return entityTypes;
    const allowed = new Set(restrictTo);
    return entityTypes.filter((et) => allowed.has(et.id));
  }, [entityTypes, restrictTo]);

  // Keyed by type → entries for that type. Loaded in parallel for
  // every allowed type and merged into one item list.
  const [entriesByType, setEntriesByType] = useState<
    ReadonlyMap<string, readonly EntityRef[]>
  >(() => {
    const seeded = new Map<string, readonly EntityRef[]>();
    for (const seed of defaultTypes ?? []) seeded.set(seed.type, seed.entries);
    return seeded;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (allowedTypes.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      allowedTypes.map(async (et) => {
        const seed = defaultTypes?.find((d) => d.type === et.id);
        if (seed !== undefined) return [et.id, seed.entries] as const;
        try {
          const list = await api.listEntities(et.id);
          return [et.id, list] as const;
        } catch {
          return [et.id, [] as readonly EntityRef[]] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setEntriesByType(new Map(pairs));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [allowedTypes, defaultTypes]);

  const items = useMemo(() => {
    const out: ComboboxItem[] = [];
    for (const et of allowedTypes) {
      const list = entriesByType.get(et.id) ?? [];
      for (const e of list) {
        const name = pickName(e.displayName, String(e.slug), locale);
        out.push({
          value: e.id,
          // Chip + name: caller sees both in the dropdown rows. The
          // chip is muted so the name still dominates.
          label: allowedTypes.length > 1
            ? (
              <span className='flex items-center gap-1.5'>
                <span className='bg-muted text-muted-foreground rounded-[3px] px-1 py-0.5 font-mono text-[9px] uppercase'>
                  {et.label}
                </span>
                <span className='truncate'>{name}</span>
              </span>
            )
            : name,
          searchText: `${name} ${e.slug} ${e.id} ${et.label}`,
          hint: String(e.slug),
        });
      }
    }
    return out;
  }, [allowedTypes, entriesByType, locale]);

  const canEdit = drawer !== null && typeof value === 'string' && value.includes(':');
  const currentType = typeof value === 'string' && value.includes(':')
    ? value.split(':')[0] ?? ''
    : '';
  const currentSlug = typeof value === 'string' && value.includes(':')
    ? value.split(':').slice(1).join(':')
    : '';

  return (
    <div className='flex flex-1 gap-1'>
      <div className='flex-1'>
        <Combobox
          value={value}
          onChange={(next) => onChange(next)}
          items={items}
          placeholder={loading ? t('loading') : t('pickOne')}
          emptyText={loading ? t('loading') : t('noMatch')}
          disabled={disabled === true || loading}
        />
      </div>
      {canEdit
        ? (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-9 shrink-0'
            onClick={() => drawer.openEntity(currentType, currentSlug)}
            aria-label={t('editLinked')}
            title={t('editLinked')}
          >
            <Pencil className='size-3.5' />
          </Button>
        )
        : null}
    </div>
  );
}

/**
 * Multi-target picker for `entity_ref[]` qualifiers like `believed_by`
 * and `known_truth_by`. A single trigger button holds chips for every
 * selected entity (with an inline × to deselect); clicking it opens a
 * searchable list with a check next to each selected row. Toggling a
 * row adds or removes it from the value array.
 *
 * Values are stored as fully-qualified ids `type:slug`. When the
 * allowed types span more than one, a tiny type Select on top of the
 * popover lets the maintainer switch the visible list (selected items
 * from other types stay in the value, just out of view).
 */
export function MultiEntityRefInput(
  { value, onChange, entityTypes, restrictTo, disabled }: InputProps<readonly string[]> & {
    entityTypes: readonly { id: string; label: string; }[];
    restrictTo?: readonly string[] | undefined;
  },
): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const allowedTypes = useMemo(() => {
    if (restrictTo === undefined) return entityTypes;
    const allowed = new Set(restrictTo);
    return entityTypes.filter((et) => allowed.has(et.id));
  }, [entityTypes, restrictTo]);

  const list = value ?? [];

  const [open, setOpenState] = useState(false);
  // Merged entries from every allowed type, loaded in parallel. Same
  // pattern as EntityRefInput: dropping the type selector keeps the
  // maintainer focused on names. The type chip on each row tells
  // them what they're picking.
  const [entriesByType, setEntriesByType] = useState<
    ReadonlyMap<string, readonly EntityRef[]>
  >(new Map());
  const [loading, setLoading] = useState(false);

  // Defensive scroll-restore on open — matches Combobox behaviour.
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

  useEffect(() => {
    if (allowedTypes.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      allowedTypes.map(async (et) => {
        try {
          const l = await api.listEntities(et.id);
          return [et.id, l] as const;
        } catch {
          return [et.id, [] as readonly EntityRef[]] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setEntriesByType(new Map(pairs));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [allowedTypes]);

  // Quick lookup: full id (`type:slug`) → { name, typeLabel } for the
  // chip rendered in the trigger. Pre-built across every loaded type.
  const lookup = useMemo(() => {
    const m = new Map<string, { name: string; typeLabel: string; }>();
    for (const et of allowedTypes) {
      const list = entriesByType.get(et.id) ?? [];
      for (const e of list) {
        m.set(e.id, {
          name: pickName(e.displayName, String(e.slug), locale),
          typeLabel: et.label,
        });
      }
    }
    return m;
  }, [allowedTypes, entriesByType, locale]);

  const selectedSet = useMemo(() => new Set(list), [list]);

  function toggle(fullId: string): void {
    if (selectedSet.has(fullId)) {
      onChange(list.filter((v) => v !== fullId));
    } else {
      onChange([...list, fullId]);
    }
  }
  function removeOne(fullId: string): void {
    onChange(list.filter((v) => v !== fullId));
  }

  // Chips sit *next to* the popover trigger, not inside its <button>
  // element — nesting <button> in <button> is invalid HTML and React
  // throws a hydration error in strict mode. The outer container is a
  // styled div that looks like an input border; only the small "Add"
  // affordance to the right is the actual popover trigger.
  //
  // Mobile branch: on coarse-pointer devices we render the picker
  // inside a bottom-sheet (MobileSheet) instead of a Popover. The
  // Popover's small fixed-width content is unusable on a 360px
  // viewport — overflows the screen, hard to tap, can't see the
  // chips you just selected. The sheet covers up to 85vh with a
  // proper close affordance + safe-area inset.
  const useSheet = useShouldUseSheet();
  const list_ui = (
    <div
      className={cn(
        'border-input bg-background flex min-h-8 flex-wrap items-center gap-1 rounded-[3px] border px-1.5 py-1',
        disabled === true && 'opacity-50',
      )}
    >
      {
        /* No left-side placeholder: the trigger button on the right
         already says "— choisir —" when the selection is empty, so
         rendering the same string on both sides looked like a bug. */
      }
      {list.map((fullId) => {
        const [, slug] = fullId.split(':');
        const meta = lookup.get(fullId);
        const label = meta?.name ?? slug ?? fullId;
        return (
          <span
            key={fullId}
            className='bg-muted text-foreground inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px]'
          >
            <span className='truncate max-w-[12rem]'>{label}</span>
            <button
              type='button'
              className='hover:text-destructive shrink-0'
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeOne(fullId);
              }}
              aria-label={t('removeEntry')}
              disabled={disabled === true}
            >
              <X className='size-3' />
            </button>
          </span>
        );
      })}
      {useSheet
        ? (
          <MobileSheetTrigger
            render={
              <button
                type='button'
                disabled={disabled === true}
                aria-expanded={open}
                className='text-muted-foreground hover:bg-accent hover:text-foreground ml-auto inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px] disabled:opacity-50'
              />
            }
          >
            <span>{list.length === 0 ? t('pickOne') : t('addEntry')}</span>
            <ChevronsUpDown className='size-3 opacity-50' />
          </MobileSheetTrigger>
        )
        : (
          <PopoverTrigger
            render={
              <button
                type='button'
                disabled={disabled === true}
                aria-expanded={open}
                className='text-muted-foreground hover:bg-accent hover:text-foreground ml-auto inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px] disabled:opacity-50'
              />
            }
          >
            <span>{list.length === 0 ? t('pickOne') : t('addEntry')}</span>
            <ChevronsUpDown className='size-3 opacity-50' />
          </PopoverTrigger>
        )}
    </div>
  );
  const picker = (
    <Command shouldFilter={false}>
      <MultiEntityList
        allowedTypes={allowedTypes}
        entriesByType={entriesByType}
        selectedSet={selectedSet}
        locale={locale}
        loading={loading}
        noMatchText={t('noMatch')}
        loadingText={t('loading')}
        searchPlaceholder={t('search')}
        onToggle={toggle}
      />
    </Command>
  );
  return useSheet
    ? (
      <MobileSheet open={open} onOpenChange={setOpen}>
        {list_ui}
        <MobileSheetContent title={t('addEntry')}>
          {picker}
        </MobileSheetContent>
      </MobileSheet>
    )
    : (
      <Popover open={open} onOpenChange={setOpen}>
        {list_ui}
        <PopoverContent
          // The trigger is a tiny inline "Add" button (~60px wide) when
          // there are no chips yet, so anchoring the popover to the
          // trigger via `w-(--anchor-width)` collapses it to a useless
          // sliver — visible as a "bug" on qualifiers like
          // `believed_by` / `known_truth_by` / `given_by` where the
          // trigger never grows. Use a fixed width that's wide enough
          // to show the searchable name list, clamped to the viewport
          // for mobile.
          className='w-[24rem] max-w-[calc(100vw-2rem)] p-0'
          align='start'
        >
          {picker}
        </PopoverContent>
      </Popover>
    );
}

const MULTI_ROW_HEIGHT = 28;
const MULTI_LIST_MAX_HEIGHT = 320;

/**
 * Virtualized dropdown body for MultiEntityRefInput. Flattens the
 * per-type entries into one searchable list and renders only the
 * rows currently in view, so picking from a 5000-character list
 * stays smooth. The search bar lives inside (above the list) so its
 * input keeps focus across re-renders.
 */
function MultiEntityList(p: {
  allowedTypes: readonly { id: string; label: string; }[];
  entriesByType: ReadonlyMap<string, readonly EntityRef[]>;
  selectedSet: ReadonlySet<string>;
  locale: Locale;
  loading: boolean;
  noMatchText: string;
  loadingText: string;
  searchPlaceholder: string;
  onToggle: (id: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pre-flatten + memoize: building the same array on every render
  // would defeat the virtualizer's memo and trigger full re-layouts.
  const flat = useMemo(() => {
    const out: { entity: EntityRef; typeLabel: string; name: string; }[] = [];
    for (const et of p.allowedTypes) {
      const rows = p.entriesByType.get(et.id) ?? [];
      for (const e of rows) {
        out.push({
          entity: e,
          typeLabel: et.label,
          name: pickName(e.displayName, String(e.slug), p.locale),
        });
      }
    }
    return out;
  }, [p.allowedTypes, p.entriesByType, p.locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return flat;
    return flat.filter((row) =>
      row.name.toLowerCase().includes(q)
      || row.entity.slug.toLowerCase().includes(q)
      || row.entity.id.toLowerCase().includes(q)
      || row.typeLabel.toLowerCase().includes(q)
    );
  }, [flat, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MULTI_ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <>
      <CommandInput
        placeholder={p.searchPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      {filtered.length === 0
        ? (
          <CommandList>
            <CommandEmpty>{p.loading ? p.loadingText : p.noMatchText}</CommandEmpty>
          </CommandList>
        )
        : (
          <CommandList
            ref={scrollRef}
            style={{ maxHeight: MULTI_LIST_MAX_HEIGHT }}
            className='overflow-y-auto'
          >
            <CommandGroup>
              <div
                style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
              >
                {virtualizer.getVirtualItems().map((row) => {
                  const item = filtered[row.index];
                  if (item === undefined) return null;
                  const isSelected = p.selectedSet.has(item.entity.id);
                  return (
                    <div
                      key={item.entity.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${row.start}px)`,
                        height: `${row.size}px`,
                      }}
                    >
                      <CommandItem
                        value={`${item.name} ${item.entity.slug} ${item.entity.id} ${item.typeLabel}`}
                        onSelect={() => p.onToggle(item.entity.id)}
                      >
                        {p.allowedTypes.length > 1
                          ? (
                            <span className='bg-muted text-muted-foreground rounded-[3px] px-1 py-0.5 font-mono text-[9px] uppercase'>
                              {item.typeLabel}
                            </span>
                          )
                          : null}
                        <span className='flex-1 truncate'>{item.name}</span>
                        <span className='text-muted-foreground ml-2 font-mono text-[10px]'>
                          {item.entity.slug}
                        </span>
                        {isSelected
                          ? <Check className='text-primary ml-2 size-4' />
                          : null}
                      </CommandItem>
                    </div>
                  );
                })}
              </div>
            </CommandGroup>
          </CommandList>
        )}
    </>
  );
}

export const SOURCE_TYPE_LABELS: Record<string, { en: string; fr: string; }> = {
  'manga-chapter': { en: 'Chapter', fr: 'Chapitre' },
  'anime-episode': { en: 'Episode', fr: 'Épisode' },
  film: { en: 'Film', fr: 'Film' },
  sbs: { en: 'SBS', fr: 'SBS' },
  databook: { en: 'Databook', fr: 'Databook' },
};

// Default per-type pickers shown stacked in MultiSourceRefInput.
// Order matters — it's how they're rendered.
const DEFAULT_MULTI_SOURCE_TYPES: readonly string[] = ['manga-chapter', 'anime-episode'];

function sourceTypeLabel(typeId: string, locale: Locale): string {
  return SOURCE_TYPE_LABELS[typeId]?.[locale] ?? SOURCE_TYPE_LABELS[typeId]?.en ?? typeId;
}

/** Format a source for combobox display: "1043 — Two Crewmates" if a
 *  title translation exists, else just "1043" (or slug for sources
 *  without numbers like films). The type label lives OUTSIDE the
 *  picker as a chip so we never repeat it here. */
function formatSourceLabel(src: SourceRef, locale: Locale): string {
  const title = src.displayName[locale] ?? src.displayName.en;
  if (src.number !== null) {
    return title !== null && title !== '' ? `${src.number} — ${title}` : String(src.number);
  }
  return title ?? String(src.slug);
}

/**
 * Single-source picker for a specific source type (manga-chapter,
 * anime-episode, etc.). Renders just the searchable autocomplete —
 * the type label is the caller's responsibility (rendered as a chip
 * outside).
 */
function TypedSourcePicker(
  { value, onChange, sources, type, disabled, bare }: {
    value: string | undefined;
    onChange: (next: string) => void;
    sources: readonly SourceRef[];
    type: string;
    disabled?: boolean;
    /** When true, drop the picker's own border so it nests cleanly
     *  inside an outer chip group. */
    bare?: boolean;
  },
): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const items = useMemo(
    () =>
      sources
        .filter((s) => s.type === type)
        .map((s) => {
          const label = formatSourceLabel(s, locale);
          return {
            value: s.id,
            label,
            searchText: `${label} ${s.slug} ${s.id}`,
          };
        }),
    [sources, type, locale],
  );
  return (
    <Combobox
      value={value === undefined || value === '' ? undefined : value}
      onChange={onChange}
      items={items}
      placeholder='—'
      emptyText={t('noMatch')}
      disabled={disabled === true}
      {...(bare === true
        ? {
          triggerClassName:
            'border-0 rounded-none h-8 px-2 text-xs justify-between bg-transparent shadow-none',
        }
        : {})}
    />
  );
}

/**
 * Multi-source `since` / `until` / `source` qualifier picker. Renders
 * a stacked list of per-type pickers (default: manga chapter + anime
 * episode) so a single value entry can cite multiple equivalent
 * sources without duplicating the entry. Each picker shows its type
 * label as a chip outside the input.
 *
 * Saves as an array of source-ref strings; single-string legacy data
 * is auto-normalised.
 */
export function MultiSourceRefInput(
  {
    value,
    onChange,
    sources,
    disabled,
    initialTypes = DEFAULT_MULTI_SOURCE_TYPES,
  }: {
    value: unknown;
    onChange: (next: string | readonly string[] | undefined) => void;
    sources: readonly SourceRef[];
    disabled?: boolean;
    /** Source types to show out-of-the-box. */
    initialTypes?: readonly string[];
  },
): JSX.Element {
  const locale = useLocale();
  // Per-session "I want to see this type's picker" reveal state.
  // Independent of the actual value so clicking "+ Film" shows an
  // empty Film picker even before any film is selected.
  const [revealed, setRevealed] = useState<readonly string[]>([]);

  const values = useMemo<readonly string[]>(() => {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string' && value !== '') return [value];
    return [];
  }, [value]);

  // Which source types appear: those in data + the always-shown defaults
  // + those the user explicitly revealed via "+ Film" etc.
  const availableTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const v of values) {
      const t = v.split(':')[0];
      if (t !== undefined && t !== '') seen.add(t);
    }
    for (const t of initialTypes) seen.add(t);
    for (const t of revealed) seen.add(t);
    return [...seen];
  }, [values, initialTypes, revealed]);

  // Build a quick lookup of typeId -> current value (or undefined).
  const valueByType = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of values) {
      const t = v.split(':')[0];
      if (t !== undefined) m.set(t, v);
    }
    return m;
  }, [values]);

  function commit(typeId: string, nextRef: string): void {
    const next = new Map(valueByType);
    if (nextRef === '') next.delete(typeId);
    else next.set(typeId, nextRef);
    const list = [...next.values()];
    if (list.length === 0) onChange(undefined);
    else if (list.length === 1) onChange(list[0]); // single → store as string
    else onChange(list); // multi → store as array
  }

  function reveal(typeId: string): void {
    if (revealed.includes(typeId)) return;
    setRevealed([...revealed, typeId]);
  }

  const allTypes = Object.keys(SOURCE_TYPE_LABELS);
  const addableTypes = allTypes.filter((t) => !availableTypes.includes(t));

  // Pack two pickers per row by default — chapter + anime episode is
  // the canonical pair and they sit comfortably side-by-side in the
  // ~28rem sheet and on the main form. A single picker spans the
  // row instead of looking orphaned at 50% width.
  const cols = availableTypes.length <= 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className='space-y-1.5'>
      <div className={`grid gap-1.5 ${cols}`}>
        {availableTypes.map((typeId) => (
          <div
            key={typeId}
            className='border-input flex items-stretch overflow-hidden rounded-[3px] border'
          >
            <span className='bg-muted text-muted-foreground inline-flex shrink-0 items-center border-r border-input px-2 text-[10px] font-medium uppercase tracking-wider'>
              {sourceTypeLabel(typeId, locale)}
            </span>
            <div className='flex-1 min-w-0'>
              <TypedSourcePicker
                type={typeId}
                value={valueByType.get(typeId)}
                onChange={(v) => commit(typeId, v)}
                sources={sources}
                disabled={disabled === true}
                bare
              />
            </div>
          </div>
        ))}
      </div>
      {addableTypes.length > 0
        ? (
          <div className='flex flex-wrap gap-1'>
            {addableTypes.map((tid) => (
              <button
                key={tid}
                type='button'
                onClick={() => reveal(tid)}
                className='border-input/60 text-muted-foreground hover:border-input hover:text-foreground hover:bg-accent/40 rounded-[3px] border px-1.5 py-0.5 text-[10px]'
              >
                + {sourceTypeLabel(tid, locale)}
              </button>
            ))}
          </div>
        )
        : null}
    </div>
  );
}

/**
 * Backwards-compatible single source picker — used wherever the
 * data model expects exactly one source_ref (most properties). The
 * type label is rendered inline as a chip on the left.
 */
export function SourceRefInput(
  { value, onChange, sources, disabled }: InputProps<string> & {
    sources: readonly SourceRef[];
  },
): JSX.Element {
  const locale = useLocale();
  const currentType = value !== undefined && value.includes(':') ? value.split(':')[0]! : '';
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) set.add(s.type);
    return [...set].sort();
  }, [sources]);

  const [type, setType] = useState<string>(
    currentType !== '' ? currentType : (types[0] ?? 'manga-chapter'),
  );

  // Keep `type` in sync if the parent swaps the value behind our back.
  useEffect(() => {
    if (currentType !== '' && currentType !== type) setType(currentType);
  }, [currentType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className='flex items-center gap-2'>
      <Select
        value={type}
        onValueChange={(t) => {
          const nt = t ?? '';
          setType(nt);
          onChange('');
        }}
        disabled={disabled === true}
      >
        <SelectTrigger className='w-32 shrink-0'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {types.map((t) => (
            <SelectItem key={t} value={t}>
              {sourceTypeLabel(t, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className='flex-1'>
        <TypedSourcePicker
          type={type}
          value={value}
          onChange={onChange}
          sources={sources}
          disabled={disabled === true}
        />
      </div>
    </div>
  );
}

export function I18nKeyInput(
  { value, onChange, suggestions, disabled }: InputProps<string> & {
    suggestions: readonly string[];
  },
): JSX.Element {
  const items = suggestions.map((s) => ({
    value: s,
    label: s,
    searchText: s,
  }));
  return (
    <Combobox
      value={value}
      onChange={onChange}
      items={items}
      placeholder='entity.slug.property.variant'
      emptyText='No matching key — type a new one.'
      disabled={disabled === true}
      allowCustom
    />
  );
}

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'multi_enum'
  | 'date'
  | 'entity_ref'
  | 'source_ref'
  | 'i18n_key'
  | 'markdown';

export type ValueInputContext = {
  readonly enumValues: readonly EnumValue[];
  readonly sources: readonly SourceRef[];
  readonly i18nKeys: readonly string[];
  /** Allowed entity types for entity_ref pickers. */
  readonly entityTypes: readonly { id: string; label: string; }[];
};

export function ValueInput(
  { valueType, value, onChange, disabled, ctx, restrictTo }: {
    valueType: ValueType;
    value: unknown;
    onChange: (next: unknown) => void;
    disabled?: boolean | undefined;
    ctx: ValueInputContext;
    /** Only meaningful for `entity_ref` — see EntityRefInput.restrictTo. */
    restrictTo?: readonly string[] | undefined;
  },
): JSX.Element {
  switch (valueType) {
    case 'string':
    case 'markdown':
      return (
        <StringInput value={value as string | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'date':
      return (
        <DateInput value={value as string | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'number':
      return (
        <NumberInput value={value as number | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'boolean':
      return (
        <BooleanInput
          value={value as boolean | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'enum':
    case 'multi_enum':
      return (
        <EnumInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          enumValues={ctx.enumValues}
        />
      );
    case 'entity_ref':
      return (
        <EntityRefInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          entityTypes={ctx.entityTypes}
          restrictTo={restrictTo}
        />
      );
    case 'source_ref':
      return (
        <SourceRefInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          sources={ctx.sources}
        />
      );
    case 'i18n_key':
      return (
        <I18nKeyInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          suggestions={ctx.i18nKeys}
        />
      );
  }
}
