'use client';

import { Command as CommandPrimitive } from 'cmdk';
import * as React from 'react';
import { useEffect, useRef } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import { CheckIcon, SearchIcon } from 'lucide-react';

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot='command'
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className='sr-only'>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          'top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0',
          className,
        )}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const ref = useRef<HTMLInputElement>(null);
  // cmdk auto-focuses the search input when mounted; the browser then
  // calls scrollIntoView on it, which jumps the underlying page even
  // when the popover already fits in the viewport. Re-focus ourselves
  // with preventScroll on the next frame to override that behaviour.
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(handle);
  }, []);
  return (
    <div data-slot='command-input-wrapper' className='p-1 pb-0'>
      <InputGroup className='h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!'>
        <CommandPrimitive.Input
          ref={ref}
          data-slot='command-input'
          className={cn(
            'w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className='size-4 shrink-0 opacity-50' />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot='command-list'
      className={cn(
        'no-scrollbar max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none',
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot='command-empty'
      className={cn('py-6 text-center text-sm', className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot='command-group'
      // `p-0` (was `p-1`): combined with `CommandList`'s p-1 the
      // double-indent pushed items 8px right of the search input,
      // which read as a misaligned popover. Items now share the
      // list's left edge.
      className={cn(
        'overflow-hidden p-0 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot='command-separator'
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot='command-item'
      className={cn(
        // Styled to look identical to <SelectItem> so the two list UIs
        // feel like the same component. cmdk drives selection via
        // `data-selected="true"` on the keyboard-active item (mouse
        // enter also flips it), so we DON'T add a separate `hover:`
        // rule — it would stack on top of the same-item data-selected
        // and paint two shades for the same intent.
        //
        // IMPORTANT: scope highlight to data-[selected=true] (truthy
        // value only). cmdk emits BOTH `data-selected="true"` on the
        // active item AND `data-selected="false"` on every other item,
        // so the bare `data-selected:` Tailwind variant (attribute
        // presence, any value) would paint every item as highlighted.
        "group/command-item relative flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className='ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100' />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot='command-shortcut'
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-[selected=true]/command-item:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
