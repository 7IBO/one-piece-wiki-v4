/**
 * Scale guard for connection sections (WEB_APP.md § designed for
 * scale): renders `limit` items and folds the rest behind a "Show the
 * N others" toggle. Pure view state — the full item list is already
 * built (and spoiler-checked) by the server view models; this only
 * controls how many are painted.
 *
 * `anchorIndex` exists because a POSITIONAL list has a wrong answer
 * the others do not: the arc ribbon on chapter 1044 folded to 909–944
 * and hid the reader's own chapter, which is the only cell the ribbon
 * is there to show. When an anchor is given the collapsed window
 * CENTRES on it instead of starting at the head, clamped so it never
 * runs past either end.
 */
import { type ReactElement, useState } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { collapsedStart } from './show-more-window.ts';

export function ShowMoreList(
  { items, limit, listClassName, anchorIndex }: {
    readonly items: readonly ReactElement[];
    /** Items shown while collapsed; the toggle appears beyond it. */
    readonly limit: number;
    /** Class of the `<ul>` wrapping the items (grid or rows). */
    readonly listClassName: string;
    /**
     * Index the collapsed window must contain — the reader's own
     * position. Omit for lists with no "you are here".
     */
    readonly anchorIndex?: number;
  },
): ReactElement {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length - limit;
  // Never fold a single item behind a button — pointless indirection.
  const collapsible = overflow > 1;
  const start = collapsedStart(anchorIndex, limit, items.length);
  const visible = collapsible && !expanded ? items.slice(start, start + limit) : items;
  return (
    <div>
      <ul className={listClassName}>{visible}</ul>
      {collapsible
        ? (
          <button
            type='button'
            onClick={() => setExpanded((value) => !value)}
            className='mt-2.5 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-link transition-colors duration-150 hover:text-link-hover'
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
