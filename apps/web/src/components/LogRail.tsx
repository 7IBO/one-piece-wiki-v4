/**
 * The Log scrubber — the product's signature surface (WEB_APP.md
 * § Identity): the reader's manga-axis progression drawn as a slim
 * modern progress track under the top bar. Gold fill from origin to
 * the cursor, a labeled cursor marker, and — on entity pages — small
 * gold diamonds where THIS page's knowledge anchors sit, so every
 * page shows where in the story its data lives. No cursor = a clean
 * empty track (the header control carries the CTA). The whole strip
 * is a button opening the shared `ProgressPanel`.
 *
 * Pure CSS positioning (percent of a fixed chapter scale); the anchor
 * data arrives spoiler-filtered from `views.ts` (`logAnchors`), so
 * the scrubber can never reveal that something happens beyond the
 * cursor.
 */
import { Popover } from '@base-ui/react/popover';
import { type JSX, useState } from 'react';
import type { LogAnchorView, ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { ProgressPanel } from './ProgressControl';

/** Fixed manga-axis scale — robust: the track never rescales per page. */
const SCALE_MAX = 1150;

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
  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <div className='mx-auto w-full max-w-[1200px] px-4 sm:px-6'>
        <Popover.Trigger
          aria-label={t(locale, 'progressTitle')}
          className='group relative block h-6 w-full cursor-pointer'
        >
          {/* Track */}
          <span
            aria-hidden
            className='absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-surface-2 transition-colors duration-150 group-hover:bg-line-strong'
          />
          {/* Gold fill: origin → cursor */}
          {cursor !== null
            ? (
              <span
                aria-hidden
                className='absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gold/80'
                style={{ left: 0, width: `${fill}%` }}
              />
            )
            : null}
          {/* This page's knowledge anchors (diamonds, spoiler-filtered) */}
          {anchors.map((anchor) => (
            <span
              key={anchor.chapter}
              title={`${t(locale, 'chapterShort')} ${anchor.chapter} — ${anchor.label}`}
              className='absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-canvas bg-gold'
              style={{ left: `${pct(anchor.chapter)}%` }}
            />
          ))}
          {
            /* Cursor marker + figure. No cursor = a clean empty track —
              the header control carries the "set my progress" CTA. */
          }
          {cursor !== null
            ? (
              <>
                <span
                  aria-hidden
                  className='absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold'
                  style={{ left: `${fill}%` }}
                />
                <span
                  className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-canvas px-1 text-[10px] font-semibold tabular-nums text-gold ${
                    fill > 84 ? '-translate-x-full' : ''
                  }`}
                  style={{ left: fill > 84 ? `calc(${fill}% - 8px)` : `calc(${fill}% + 8px)` }}
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
          <Popover.Popup className='w-72 rounded-lg border border-line-strong bg-surface p-4 shadow-lg shadow-black/20 outline-none'>
            <ProgressPanel progress={progress} onDone={() => setOpen(false)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
