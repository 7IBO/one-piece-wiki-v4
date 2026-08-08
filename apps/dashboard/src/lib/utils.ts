import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mobile width recipe for floating layers (Select / Popover /
 * Combobox popups). Below `sm` an anchor-width dropdown leaves dead
 * space left and right; instead the popup spans the page — gutter to
 * gutter — using the same `--page-px` token as the page chrome.
 * No-op from `sm:` up, where popups keep their anchor-driven width.
 *
 * Pair with `POPUP_COLLISION_PADDING` on the Base UI Positioner: the
 * popup is exactly `100vw - 2 * --page-px` wide, so collision
 * shifting lands it precisely on the page gutters regardless of
 * where the anchor sits.
 */
export const POPUP_MOBILE_FULL_WIDTH_CLASS: string =
  'max-sm:w-[calc(100vw-2*var(--page-px))] max-sm:max-w-[calc(100vw-2*var(--page-px))] max-sm:min-w-0';

/**
 * Keep in sync with the `--page-px` layout token (0.75rem = 12px) in
 * styles.css — Base UI positioning is JS-side, so the token can't be
 * referenced directly here.
 */
export const POPUP_COLLISION_PADDING: number = 12;
