/**
 * Generic combobox built on shadcn's Command + Popover. Used for any
 * select-like input where the option list is too long for a normal
 * <Select> (sources, i18n keys, etc).
 *
 * Scales to thousands of items via @tanstack/react-virtual: only the
 * visible rows are kept in the DOM (overscan 8). cmdk's built-in
 * filter is bypassed (`shouldFilter={false}`) in favour of a manual
 * case-insensitive substring match on `searchText`, so we know which
 * items to feed the virtualizer and can show an accurate match count.
 */
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsUpDown } from 'lucide-react';
import { type JSX, type ReactNode, useMemo, useRef, useState } from 'react';

export type ComboboxItem = {
  readonly value: string;
  readonly label: ReactNode;
  readonly searchText: string;
  readonly hint?: string;
};

export function Combobox(
  {
    value,
    onChange,
    items,
    placeholder = '— pick one —',
    emptyText = 'No matches.',
    disabled,
    allowCustom = false,
    triggerClassName,
  }: {
    value: string | undefined;
    onChange: (next: string) => void;
    items: readonly ComboboxItem[];
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    allowCustom?: boolean;
    /** Override the trigger button class — for inline use inside chip
     *  groups where the picker should drop its own border. */
    triggerClassName?: string;
  },
): JSX.Element {
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const selected = items.find((i) => i.value === value);

  // Defensive scroll-restore: even though we render the Popover as
  // non-modal, Base UI / Floating UI may still call .focus() on the
  // popup or the search input as it mounts. The browser's default
  // focus behaviour scrolls the focused element into view, which on
  // a long form jumps the page back to the top. We snapshot the
  // window scroll just before opening and restore it on the next
  // frame, defeating any scrollIntoView triggered by the open.
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            className={cn(
              'h-8 w-full justify-between rounded-[3px] px-2 text-xs font-normal',
              triggerClassName,
            )}
            aria-expanded={open}
          >
            <span className={cn('truncate', selected === undefined && 'text-muted-foreground')}>
              {selected !== undefined
                ? selected.label
                : (value !== undefined && value !== '' && allowCustom)
                ? value
                : placeholder}
            </span>
            <ChevronsUpDown className='size-3.5 opacity-50' />
          </Button>
        }
      />
      <PopoverContent
        className='w-(--anchor-width) min-w-[var(--anchor-width,18rem)] p-0'
        align='start'
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder='Search…'
            value={query}
            onValueChange={setQuery}
          />
          <VirtualizedList
            items={items}
            query={query}
            value={value}
            allowCustom={allowCustom}
            emptyText={emptyText}
            onPick={(v) => {
              onChange(v);
              setOpen(false);
              setQuery('');
            }}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Each row is the same height — cmdk's CommandItem at our text-xs
 *  scale renders at 28px including padding. Used for both the
 *  virtualizer's size estimate and the explicit row height so layout
 *  doesn't shift between estimate and measurement. */
const ROW_HEIGHT = 28;
/** Cap on the scrollable viewport height inside the popover. With
 *  ~12 rows visible (~336px) it's enough to feel scrollable without
 *  taking over the screen on dense pages. */
const LIST_MAX_HEIGHT = 320;

function VirtualizedList(p: {
  items: readonly ComboboxItem[];
  query: string;
  value: string | undefined;
  allowCustom: boolean;
  emptyText: string;
  onPick: (value: string) => void;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = p.query.trim().toLowerCase();
    if (q === '') return p.items;
    return p.items.filter((i) => i.searchText.toLowerCase().includes(q));
  }, [p.items, p.query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (filtered.length === 0) {
    return (
      <CommandList>
        <CommandEmpty>
          {p.allowCustom && p.query.length > 0
            ? (
              <button
                type='button'
                className='text-foreground hover:bg-accent w-full rounded px-2 py-1 text-left text-sm'
                onClick={() => p.onPick(p.query)}
              >
                Use “{p.query}”
              </button>
            )
            : p.emptyText}
        </CommandEmpty>
      </CommandList>
    );
  }

  return (
    <CommandList
      ref={scrollRef}
      style={{ maxHeight: LIST_MAX_HEIGHT }}
      className='overflow-y-auto'
    >
      <CommandGroup>
        <div
          // The virtualizer needs a tall spacer so the scrollbar
          // reflects the *full* list length even though only a
          // handful of rows are rendered at any moment.
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const item = filtered[row.index];
            if (item === undefined) return null;
            const isSelected = p.value === item.value;
            return (
              <div
                key={item.value}
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
                  value={item.searchText}
                  onSelect={() => p.onPick(item.value)}
                >
                  <span className='flex-1 truncate'>
                    {item.label}
                  </span>
                  {item.hint !== undefined
                    ? (
                      <span className='text-muted-foreground ml-2 font-mono text-[10px]'>
                        {item.hint}
                      </span>
                    )
                    : null}
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
  );
}
