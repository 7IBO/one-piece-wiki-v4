/**
 * The Log Rail — the signature surface of the app (WEB_APP.md § Le
 * Log). A persistent slim strip under the header: a stylized timeline
 * of the manga axis with graduated ticks, a GOLD fill from origin to
 * the reader's cursor and a marker at the cursor position. On entity
 * pages it additionally shows small diamond markers where THIS page's
 * knowledge anchors live (first appearance, bounty changes…) — every
 * page literally shows where in the story its data sits. No cursor =
 * unfilled rail with the invitation. The whole strip is a button
 * opening the shared `ProgressPanel`.
 *
 * Pure CSS positioning (percent of a fixed chapter scale); the anchor
 * data arrives spoiler-filtered from `views.ts` (`logAnchors`), so
 * the rail can never reveal that something happens beyond the cursor.
 */
import { Popover } from '@base-ui/react/popover';
import { type JSX, useState } from 'react';
import type { LogAnchorView, ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { ProgressPanel } from './ProgressControl';

/** Fixed manga-axis scale — robust: the rail never rescales per page. */
const SCALE_MAX = 1150;
/** Graduation every N chapters; numbered label every 2 graduations. */
const TICK_STEP = 100;

function pct(chapter: number): number {
  return (Math.min(Math.max(chapter, 0), SCALE_MAX) / SCALE_MAX) * 100;
}

export function LogRail(
  { progress, anchors }: {
    readonly progress: ProgressCursor;
    readonly anchors: readonly LogAnchorView[];
  },
): JSX.Element {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const cursor = progress.manga;
  const fill = cursor === null ? 0 : pct(cursor);
  const ticks: number[] = [];
  for (let n = TICK_STEP; n < SCALE_MAX; n += TICK_STEP) ticks.push(n);
  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger
        aria-label={t(locale, 'progressTitle')}
        className='group relative block h-8 w-full cursor-pointer overflow-hidden border-t border-line bg-canvas sm:h-9'
      >
        {/* Track base line */}
        <span aria-hidden className='absolute inset-x-0 top-1/2 h-px bg-line-strong' />
        {/* Graduations + chapter numbers */}
        {ticks.map((n) => (
          <span key={n} aria-hidden>
            <span
              className='absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong'
              style={{ left: `${pct(n)}%` }}
            />
            {n % (TICK_STEP * 2) === 0
              ? (
                <span
                  className='absolute top-1/2 hidden -translate-y-1/2 translate-x-1.5 font-mono text-[9px] tabular-nums text-faint sm:block'
                  style={{ left: `${pct(n)}%` }}
                >
                  {n}
                </span>
              )
              : null}
          </span>
        ))}
        {/* Gold fill: origin → cursor (behind the anchors) */}
        {cursor !== null
          ? (
            <>
              <span
                aria-hidden
                className='absolute inset-y-0 left-0 bg-gold/10'
                style={{ width: `${fill}%` }}
              />
              <span
                aria-hidden
                className='absolute inset-y-0 w-[2px] bg-gold'
                style={{ left: `calc(${fill}% - 1px)` }}
              />
            </>
          )
          : null}
        {/* This page's knowledge anchors (diamonds, spoiler-filtered) */}
        {anchors.map((anchor) => (
          <span
            key={anchor.chapter}
            title={`${t(locale, 'chapterShort')} ${anchor.chapter} — ${anchor.label}`}
            className='absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-canvas bg-gold'
            style={{ left: `${pct(anchor.chapter)}%` }}
          />
        ))}
        {/* Cursor value / invitation — chipped above everything */}
        {cursor !== null
          ? (
            <span
              className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-canvas/85 px-1 font-mono text-[10px] font-semibold tabular-nums text-gold ${
                fill > 82 ? '-translate-x-full' : ''
              }`}
              style={{ left: fill > 82 ? `calc(${fill}% - 6px)` : `calc(${fill}% + 6px)` }}
            >
              {t(locale, 'chapterShort')} {cursor}
            </span>
          )
          : (
            <span className='absolute right-4 top-1/2 -translate-y-1/2 rounded bg-canvas px-1.5 text-[11px] font-medium text-muted transition-colors duration-150 group-hover:text-fg sm:right-6'>
              {t(locale, 'setProgress')} →
            </span>
          )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='center'
          sideOffset={4}
          collisionPadding={12}
          className='isolate z-50'
        >
          <Popover.Popup className='w-72 rounded-lg border border-line bg-surface p-4 shadow-2xl outline-none'>
            <ProgressPanel progress={progress} onDone={() => setOpen(false)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
