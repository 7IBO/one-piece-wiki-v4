/**
 * GlobalCommandPalette — ⌘K / Ctrl-K search across every entity in
 * the catalogue. Mounted once at the app root. Two roles:
 *
 *   1. Quick nav — jump to any entity by name/slug/id without
 *      hopping through the type list.
 *   2. Duplicate-detection — on `/types/$type/new`, contributors can
 *      hit ⌘K to confirm an entity doesn't already exist before
 *      opening a PR for it.
 *
 * The dataset is built by fanning out `api.listEntities(type)` over
 * every entity type from `api.schemas()`. Both calls are cached
 * module-wide in `api.ts`, so opening the palette a second time is
 * instant. We do the fan-out lazily (on first open) to avoid eating
 * the catalogue cost on every page load.
 *
 * Filtering is delegated to `cmdk`: each item's `value` attribute is
 * the searchable string ("name | id | slug") and cmdk applies its
 * built-in fuzzy match. We don't debounce — the dataset stays in
 * memory and the filter runs at the keystroke without paying a
 * network round-trip.
 */
import { useNavigate } from '@tanstack/react-router';
import { FileQuestionIcon, SearchIcon } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type EntityRef, type SchemaCatalogue } from './api';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './components/ui/command';
import { useLocale } from './form/locale';

type Indexed = {
  readonly ref: EntityRef;
  /** Human-readable label in the current locale (falls back EN → id). */
  readonly label: string;
  /** What cmdk fuzzy-matches against. */
  readonly searchable: string;
  /** Entity-type label for the secondary line + group header. */
  readonly typeLabel: string;
};

function pickDisplayName(
  ref: EntityRef,
  locale: 'en' | 'fr',
): string {
  return ref.displayName[locale]
    ?? ref.displayName.en
    ?? ref.displayName.fr
    ?? ref.slug;
}

export function GlobalCommandPalette(): JSX.Element {
  const navigate = useNavigate();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [entities, setEntities] = useState<readonly EntityRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ⌘K / Ctrl-K toggles. We capture inside any focused input too —
  // cmdk owns the modal once open, so the only risk is hijacking
  // browser shortcuts that overlap; ⌘K is reserved by no major
  // browser for in-page actions.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'k' && e.key !== 'K') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, []);

  // Lazy load on first open. Module-level cache in api.ts means
  // subsequent opens are zero-cost. We deliberately do this AFTER
  // open is true (instead of on mount) so the first paint isn't
  // blocked on a 7-type fan-out the user may never need.
  useEffect(() => {
    if (!open) return;
    if (schemas !== null && entities.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const cat = await api.schemas();
        if (cancelled) return;
        setSchemas(cat);
        const lists = await Promise.all(
          Object.keys(cat.entityTypes).map((type) =>
            api.listEntities(type).catch(() => [] as EntityRef[])
          ),
        );
        if (cancelled) return;
        setEntities(lists.flat());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, schemas, entities.length]);

  const indexed = useMemo<readonly Indexed[]>(() => {
    if (schemas === null) return [];
    return entities.map((ref) => {
      const et = schemas.entityTypes[ref.type];
      const typeLabel = et?.labels[locale] ?? et?.labels.en ?? ref.type;
      const label = pickDisplayName(ref, locale);
      // Concatenate the searchable surface — cmdk fuzzy-matches on a
      // single string, so we include every angle a contributor might
      // type: locale-aware name, EN name, FR name, id (`type:slug`),
      // bare slug.
      const searchable = [
        label,
        ref.displayName.en ?? '',
        ref.displayName.fr ?? '',
        ref.id,
        ref.slug,
      ].filter(Boolean).join(' | ');
      return { ref, label, searchable, typeLabel };
    });
  }, [entities, schemas, locale]);

  // Group entries by entity type so the dropdown surfaces a section
  // header per type. The labels come from the schema; the group key
  // is the schema id (stable sort).
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Indexed[]; }>();
    for (const it of indexed) {
      const existing = map.get(it.ref.type);
      if (existing === undefined) {
        map.set(it.ref.type, { label: it.typeLabel, items: [it] });
      } else {
        existing.items.push(it);
      }
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.label.localeCompare(b.label));
  }, [indexed]);

  const handleSelect = (ref: EntityRef): void => {
    setOpen(false);
    void navigate({
      to: '/types/$type/$slug',
      params: { type: ref.type, slug: ref.slug },
    });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title='Search entities'
      description='Search across every entity in the catalogue.'
      // Mobile: snap to top with side-margins (so the dialog reads as a
      // floating panel, not a sheet that engulfs the viewport). Desktop:
      // float at ~20% from the top, capped at max-w-xl.
      className='top-4 left-1/2 -translate-x-1/2 w-[calc(100vw-1.5rem)] max-w-xl sm:top-[15%]'
    >
      {
        /* `<Command>` provides the cmdk store context that `CommandInput`,
          `CommandList`, `CommandItem`, etc. subscribe to. The local
          `CommandDialog` (components/ui/command.tsx) wraps in `<Dialog>`
          only — it does NOT include `<Command>` — so callers must add
          it themselves (see also `combobox.tsx:108`). */
      }
      <Command>
        <CommandInput placeholder='Search by name, slug, or id…' />
        {
          /* Shorter on mobile so the dialog feels like a panel, not a
          sheet — caps at 50vh, scrolls internally if there are more. */
        }
        <CommandList className='max-h-[50vh] sm:max-h-80'>
          {loading
            ? (
              <div className='text-muted-foreground py-6 text-center text-xs'>
                Loading catalogue…
              </div>
            )
            : error !== null
            ? (
              <div className='text-destructive py-6 text-center text-xs'>
                {error}
              </div>
            )
            : (
              <>
                <CommandEmpty>
                  <div className='text-muted-foreground flex flex-col items-center gap-2 py-4 text-xs'>
                    <FileQuestionIcon className='size-5 opacity-50' />
                    <span>No matching entity in the catalogue.</span>
                  </div>
                </CommandEmpty>
                {groups.map(([type, { label, items }]) => (
                  <CommandGroup key={type} heading={label}>
                    {items.map((it) => (
                      <CommandItem
                        key={it.ref.id}
                        value={it.searchable}
                        onSelect={() => handleSelect(it.ref)}
                      >
                        <span className='truncate'>{it.label}</span>
                        <CommandShortcut className='ml-auto truncate font-mono text-[10px]'>
                          {it.ref.id}
                        </CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/**
 * Inline trigger for the header — shows a faux-search button on
 * desktop with the ⌘K hint, an icon-only button on mobile (where the
 * keyboard shortcut is irrelevant). Both open the same dialog by
 * dispatching a synthesised ⌘K keydown so the toggle logic lives in
 * one place inside `GlobalCommandPalette`.
 */
export function CommandPaletteTrigger(): JSX.Element {
  const dispatch = (): void => {
    globalThis.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  };
  return (
    <>
      <button
        type='button'
        onClick={dispatch}
        aria-label='Search entities'
        className='border-input bg-input/30 text-muted-foreground hover:bg-input/50 hidden h-7 items-center gap-2 rounded-[3px] border px-2 text-xs sm:inline-flex'
      >
        <SearchIcon className='size-3.5' />
        <span>Search…</span>
        {/* ⌘K hint hidden on coarse pointers (touch) where it's noise. */}
        <kbd className='bg-card text-muted-foreground ml-2 hidden rounded border px-1 font-mono text-[10px] [@media(pointer:fine)]:inline'>
          ⌘K
        </kbd>
      </button>
      <button
        type='button'
        onClick={dispatch}
        aria-label='Search entities'
        className='text-muted-foreground hover:bg-accent inline-flex size-8 items-center justify-center rounded-[3px] sm:hidden'
      >
        <SearchIcon className='size-4' />
      </button>
    </>
  );
}
