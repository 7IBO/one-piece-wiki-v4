/**
 * MobileSheet — bottom-sheet primitive for thumb-friendly mobile
 * UIs. Slides up from the viewport bottom, covers the full width,
 * caps height at 85vh so the trigger context above stays visible
 * for orientation. Respects `env(safe-area-inset-bottom)` so the
 * inner scroll area doesn't sit under the home-indicator.
 *
 * Use this in place of `Popover` whenever the trigger is something
 * a contributor is likely to interact with on a touch device —
 * pickers, dropdowns, "more options" menus. On desktop the
 * `Popover` is fine; the `usePopoverOrSheet()` hook in this file
 * picks between them via `pointer: coarse` so a desktop user with
 * a mouse keeps the compact popover.
 *
 * Built on Base UI's Dialog primitive — we get focus trap, ESC,
 * scroll lock, backdrop click-to-dismiss + portal-rendered overlay
 * for free.
 */
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { type ComponentProps, type JSX, type ReactNode, useEffect, useState } from 'react';
import { Button } from './button';

export function MobileSheet(
  { ...props }: ComponentProps<typeof DialogPrimitive.Root>,
): JSX.Element {
  return <DialogPrimitive.Root {...props} />;
}

export const MobileSheetTrigger = DialogPrimitive.Trigger;
export const MobileSheetClose = DialogPrimitive.Close;

/**
 * Default open=true. Caller controls open/close via the Dialog's
 * root open state — same API as Base UI's Dialog so the migration
 * from Popover stays mechanical.
 */
export function MobileSheetContent({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-100' />
      <DialogPrimitive.Popup
        className={
          // Slide up from the bottom; the data-open / data-closed
          // hooks come from Base UI's Dialog open-state and let
          // tailwindcss-animate drive the transition cleanly. The
          // `pb-[env(safe-area-inset-bottom)]` keeps the scroll
          // area clear of the home-indicator on iPhones.
          `bg-background text-foreground fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] w-full max-w-[40rem] flex-col rounded-t-[1rem] border-t shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom duration-150 ease-out ${className}`
        }
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        {
          /* Drag-handle visual — pure decoration, no actual swipe
            (Base UI's Dialog doesn't expose a gesture API). Cheap
            affordance that signals "you can dismiss this". */
        }
        <div className='flex shrink-0 justify-center pt-2 pb-1'>
          <span className='bg-muted-foreground/30 h-1 w-10 rounded-full' />
        </div>
        <div className='border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 pb-3'>
          <div className='min-w-0 flex-1'>
            <DialogPrimitive.Title className='text-sm font-semibold truncate'>
              {title}
            </DialogPrimitive.Title>
            {description !== undefined
              ? (
                <DialogPrimitive.Description className='text-muted-foreground text-xs truncate'>
                  {description}
                </DialogPrimitive.Description>
              )
              : null}
          </div>
          <DialogPrimitive.Close
            render={
              <Button
                variant='ghost'
                size='icon'
                aria-label='Close'
                className='shrink-0'
              />
            }
          >
            <XIcon className='size-4' />
          </DialogPrimitive.Close>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {children}
        </div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/**
 * Tracks whether the device has a coarse pointer (touch). Returns
 * `true` on phones/tablets, `false` on mouse-using desktops. Use
 * in combination with `MobileSheet` vs `Popover` to render the
 * right affordance per device.
 *
 *   const sheet = useShouldUseSheet();
 *   return sheet ? <MobileSheet>…</MobileSheet> : <Popover>…</Popover>;
 *
 * SSR-safe: returns `false` on the server and during the first
 * paint, then re-renders with the real value after mount. Pickers
 * may briefly flash with desktop affordances on a touch device,
 * which is acceptable for editing-tool UX.
 */
export function useShouldUseSheet(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mql = globalThis.matchMedia?.('(pointer: coarse)');
    if (mql === undefined) return;
    setCoarse(mql.matches);
    const handler = (e: MediaQueryListEvent): void => setCoarse(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return coarse;
}
