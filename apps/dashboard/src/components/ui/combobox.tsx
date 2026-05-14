/**
 * Generic combobox built on shadcn's Command + Popover. Used for any
 * select-like input where the option list is too long for a normal
 * <Select> (sources, i18n keys, etc).
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
import { Check, ChevronsUpDown } from 'lucide-react';
import { type JSX, type ReactNode, useState } from 'react';

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
  }: {
    value: string | undefined;
    onChange: (next: string) => void;
    items: readonly ComboboxItem[];
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    allowCustom?: boolean;
  },
): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = items.find((i) => i.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            className='w-full justify-between font-normal'
            aria-expanded={open}
          >
            <span className={cn('truncate', selected === undefined && 'text-muted-foreground')}>
              {selected !== undefined ? selected.label : (value ?? placeholder)}
            </span>
            <ChevronsUpDown className='size-4 opacity-50' />
          </Button>
        }
      />
      <PopoverContent
        className='w-(--anchor-width) min-w-[var(--anchor-width,18rem)] p-0'
        align='start'
      >
        <Command shouldFilter>
          <CommandInput
            placeholder='Search…'
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {allowCustom && query.length > 0
                ? (
                  <button
                    type='button'
                    className='text-foreground hover:bg-accent w-full rounded px-2 py-1 text-left text-sm'
                    onClick={() => {
                      onChange(query);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    Use “{query}”
                  </button>
                )
                : emptyText}
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.searchText}
                  onSelect={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Check
                    className={cn(
                      'size-4',
                      value === item.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className='flex-1 truncate'>{item.label}</span>
                  {item.hint !== undefined
                    ? (
                      <span className='text-muted-foreground ml-2 font-mono text-xs'>
                        {item.hint}
                      </span>
                    )
                    : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
