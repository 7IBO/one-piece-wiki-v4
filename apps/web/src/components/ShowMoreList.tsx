/**
 * Scale guard for connection sections (WEB_APP.md § designed for
 * scale): renders the first `limit` items and folds the tail behind
 * a "Show the N others" toggle. Pure view state — the full item list
 * is already built (and spoiler-checked) by the server view models;
 * this only controls how many are painted.
 */
import { type JSX, useState } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

export function ShowMoreList(
  { items, limit, listClassName }: {
    readonly items: readonly JSX.Element[];
    /** Items shown while collapsed; the toggle appears beyond it. */
    readonly limit: number;
    /** Class of the `<ul>` wrapping the items (grid or rows). */
    readonly listClassName: string;
  },
): JSX.Element {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length - limit;
  // Never fold a single item behind a button — pointless indirection.
  const collapsible = overflow > 1;
  const visible = collapsible && !expanded ? items.slice(0, limit) : items;
  return (
    <div>
      <ul className={listClassName}>{visible}</ul>
      {collapsible
        ? (
          <button
            type='button'
            onClick={() => setExpanded((value) => !value)}
            className='mt-2.5 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors duration-150 hover:bg-surface hover:text-accent-hover'
          >
            {expanded
              ? t(locale, 'showLess')
              : t(locale, 'showNMore').replace('#', String(overflow))}
          </button>
        )
        : null}
    </div>
  );
}
