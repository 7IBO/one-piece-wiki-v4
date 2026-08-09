/**
 * The Log ruler — the printed measure of the reader's progression
 * (WEB_APP.md § Identity). A slim strip under the masthead set like a
 * ruler in a logbook: graduated ticks rising from the bottom rule,
 * chapter figures over the major graduations, the read region shaded
 * in paper tint, and the cursor as a seal-red rule with its figure.
 * On entity pages small paper diamonds mark where THIS page's
 * knowledge anchors sit on the manga axis — every page literally
 * shows where in the story its data lives. No cursor = a bare,
 * unshaded measure (the masthead stamp carries the invitation). The
 * whole strip is a button opening the shared `ProgressPanel`.
 *
 * Pure CSS positioning (percent of a fixed chapter scale); the anchor
 * data arrives spoiler-filtered from `views.ts` (`logAnchors`), so
 * the ruler can never reveal that something happens beyond the cursor.
 */
import { Popover } from '@base-ui/react/popover';
import { type JSX, useState } from 'react';
import type { LogAnchorView, ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { ProgressPanel } from './ProgressControl';

/** Fixed manga-axis scale — robust: the ruler never rescales per page. */
const SCALE_MAX = 1150;
/** Minor graduation every N chapters; major (numbered) every 4 minors. */
const TICK_STEP = 50;

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
      <div className='mx-auto w-full max-w-[1200px] px-4 sm:px-6'>
        <Popover.Trigger
          aria-label={t(locale, 'progressTitle')}
          className='group relative block h-9 w-full cursor-pointer overflow-hidden border-b border-line-strong'
        >
          {/* Shaded read region: origin → cursor (printed tint). */}
          {cursor !== null
            ? (
              <span
                aria-hidden
                className='absolute inset-y-0 left-0 bg-fg/6'
                style={{ width: `${fill}%` }}
              />
            )
            : null}
          {/* Graduations rising from the bottom rule + figures. */}
          {ticks.map((n) => {
            const major = n % (TICK_STEP * 4) === 0;
            // The cursor figure owns its spot — the nearest printed
            // graduation figure yields to it.
            const showFigure = major
              && (cursor === null || Math.abs(n - cursor) > SCALE_MAX * 0.055);
            return (
              <span key={n} aria-hidden>
                <span
                  className={`absolute bottom-0 w-px bg-line-strong ${major ? 'h-3' : 'h-1.5'}`}
                  style={{ left: `${pct(n)}%` }}
                />
                {showFigure
                  ? (
                    <span
                      className='absolute bottom-3.5 hidden -translate-x-1/2 font-sans text-[9px] font-medium tabular-nums tracking-[0.08em] text-faint sm:block'
                      style={{ left: `${pct(n)}%` }}
                    >
                      {n}
                    </span>
                  )
                  : null}
              </span>
            );
          })}
          {/* This page's knowledge anchors (diamonds, spoiler-filtered). */}
          {anchors.map((anchor) => (
            <span
              key={anchor.chapter}
              title={`${t(locale, 'chapterShort')} ${anchor.chapter} — ${anchor.label}`}
              className='absolute bottom-[5px] size-[6px] -translate-x-1/2 rotate-45 bg-fg/70'
              style={{ left: `${pct(anchor.chapter)}%` }}
            />
          ))}
          {
            /* Cursor rule + figure (knocked out of the graduations).
              No cursor: the ruler stays a bare measure — the masthead
              stamp carries the printed invitation. */
          }
          {cursor !== null
            ? (
              <>
                <span
                  aria-hidden
                  className='absolute inset-y-0 w-[2px] bg-accent'
                  style={{ left: `calc(${fill}% - 1px)` }}
                />
                <span
                  className={`absolute top-0.5 whitespace-nowrap bg-canvas px-1 font-sans text-[9px] font-semibold uppercase tabular-nums tracking-[0.14em] text-accent ${
                    fill > 82 ? '-translate-x-full' : ''
                  }`}
                  style={{ left: fill > 82 ? `calc(${fill}% - 7px)` : `calc(${fill}% + 7px)` }}
                >
                  {t(locale, 'chapterShort')} {cursor}
                </span>
              </>
            )
            : null}
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='center'
          sideOffset={4}
          collisionPadding={12}
          className='isolate z-50'
        >
          <Popover.Popup className='w-72 border border-line-strong bg-surface p-4 outline-none'>
            <ProgressPanel progress={progress} onDone={() => setOpen(false)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
