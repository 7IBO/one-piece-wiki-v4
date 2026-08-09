/**
 * The spoiler cursor UI. `ProgressPanel` is the shared editing form
 * (two numeric inputs + "show everything" reset) that persists to the
 * `web_progress` cookie — the only store the server functions can
 * read for SSR-filtered first paint — then invalidates the router so
 * every loader refetches filtered views.
 *
 * Since v8.1 there is exactly ONE trigger: the compact header control
 * below. It is therefore also the display of the cursor — its label
 * IS the reader's position ("Ch. 600 · Ép. 1071"), in gold, so the
 * state stays permanently on screen without a full-width graduated
 * rail across the top of every page.
 */
import { Popover } from '@base-ui/react/popover';
import { useRouter } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { PROGRESS_COOKIE, type ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

function writeProgressCookie(cursor: ProgressCursor): void {
  const payload: Record<string, number> = {};
  if (cursor.manga !== null) payload['manga'] = cursor.manga;
  if (cursor.anime !== null) payload['anime'] = cursor.anime;
  const empty = Object.keys(payload).length === 0;
  // One tiny first-party cookie; same rationale as the locale switcher.
  // oxlint-disable-next-line unicorn/no-document-cookie
  document.cookie = empty
    ? `${PROGRESS_COOKIE}=; path=/; max-age=0; samesite=lax`
    : `${PROGRESS_COOKIE}=${
      encodeURIComponent(JSON.stringify(payload))
    }; path=/; max-age=31536000; samesite=lax`;
}

function parseInput(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Shared popup body: edit the cursor, persist, refetch everything. */
export function ProgressPanel(
  { progress, onDone }: {
    readonly progress: ProgressCursor;
    /** Called after a cursor write (close the owning popover). */
    readonly onDone: () => void;
  },
): JSX.Element {
  const router = useRouter();
  const locale = useLocale();
  const [manga, setManga] = useState(progress.manga === null ? '' : String(progress.manga));
  const [anime, setAnime] = useState(progress.anime === null ? '' : String(progress.anime));

  const apply = (next: ProgressCursor): void => {
    writeProgressCookie(next);
    onDone();
    void router.invalidate();
  };

  const inputClass =
    'w-full rounded-md border border-line-strong bg-canvas px-3 py-1.5 text-sm tabular-nums text-fg outline-none transition-colors duration-150 focus:border-gold';

  return (
    <>
      <p className='display text-[15px] font-bold text-fg'>
        {t(locale, 'progressTitle')}
      </p>
      <p className='mt-1 text-xs leading-relaxed text-muted'>
        {t(locale, 'progressHint')}
      </p>
      <form
        className='mt-3 space-y-2.5'
        onSubmit={(event) => {
          event.preventDefault();
          apply({ manga: parseInput(manga), anime: parseInput(anime) });
        }}
      >
        <label className='block text-xs font-medium text-muted'>
          {t(locale, 'progressManga')}
          <input
            type='number'
            min={0}
            inputMode='numeric'
            value={manga}
            onChange={(event) => setManga(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className='block text-xs font-medium text-muted'>
          {t(locale, 'progressAnime')}
          <input
            type='number'
            min={0}
            inputMode='numeric'
            value={anime}
            onChange={(event) => setAnime(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <div className='flex items-center justify-between gap-2 pt-1'>
          <button
            type='button'
            onClick={() => {
              setManga('');
              setAnime('');
              apply({ manga: null, anime: null });
            }}
            className='cursor-pointer py-1.5 text-xs font-medium text-faint transition-colors duration-150 hover:text-fg'
          >
            {t(locale, 'progressReset')}
          </button>
          <button
            type='submit'
            className='cursor-pointer rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
          >
            {t(locale, 'progressSave')}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * The header trigger — and, since v8.1, the ONLY place the spoiler
 * cursor is shown. Set: the position in gold behind a gold hairline.
 * Unset: the invitation to set one.
 */
export function ProgressControl(
  { progress }: { readonly progress: ProgressCursor; },
): JSX.Element {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const active = progress.manga !== null || progress.anime !== null;
  const summary = active
    ? [
      progress.manga === null ? null : `${t(locale, 'chapterShort')} ${progress.manga}`,
      progress.anime === null ? null : `${t(locale, 'episodeShort')} ${progress.anime}`,
    ].filter((part) => part !== null).join(' · ')
    : t(locale, 'setProgress');

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger
        aria-label={t(locale, 'progressTitle')}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 hover:bg-surface ${
          active
            ? 'text-gold ring-1 ring-gold/35 hover:ring-gold/60'
            : 'text-fg/85 ring-1 ring-line-strong hover:text-fg hover:ring-gold/45'
        }`}
      >
        <span className={`block max-w-56 truncate sm:max-w-64 ${active ? 'tabular-nums' : ''}`}>
          {summary}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='end'
          sideOffset={8}
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
