/**
 * The spoiler cursor UI. `ProgressPanel` is the shared editing form
 * (two numeric inputs + "show everything" reset) that persists to the
 * `web_progress` cookie — the only store the server functions can
 * read for SSR-filtered first paint — then invalidates the router so
 * every loader refetches filtered views. It is mounted by TWO
 * triggers: the masthead stamp below, and the Log ruler strip
 * (`LogRail.tsx`). Styled as a printed form: ruled inputs, small-cap
 * labels, a seal-red stamp for the save action.
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

  // Printed form field: bottom rule only, no box.
  const inputClass =
    'w-full border-0 border-b border-line-strong bg-transparent px-0 py-1 font-display text-lg tabular-nums text-fg outline-none transition-colors duration-150 focus:border-accent';

  return (
    <>
      <p className='overline-label text-fg'>{t(locale, 'progressTitle')}</p>
      <p className='mt-1.5 font-serif text-[13px] italic leading-snug text-muted'>
        {t(locale, 'progressHint')}
      </p>
      <form
        className='mt-3 space-y-3'
        onSubmit={(event) => {
          event.preventDefault();
          apply({ manga: parseInput(manga), anime: parseInput(anime) });
        }}
      >
        <label className='overline-label block'>
          {t(locale, 'progressManga')}
          <input
            type='number'
            min={0}
            inputMode='numeric'
            value={manga}
            onChange={(event) => setManga(event.target.value)}
            className={`mt-0.5 ${inputClass}`}
          />
        </label>
        <label className='overline-label block'>
          {t(locale, 'progressAnime')}
          <input
            type='number'
            min={0}
            inputMode='numeric'
            value={anime}
            onChange={(event) => setAnime(event.target.value)}
            className={`mt-0.5 ${inputClass}`}
          />
        </label>
        <div className='flex items-baseline justify-between gap-2 pt-1'>
          <button
            type='button'
            onClick={() => {
              setManga('');
              setAnime('');
              apply({ manga: null, anime: null });
            }}
            className='cursor-pointer py-1 text-[11px] font-medium text-faint underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg'
          >
            {t(locale, 'progressReset')}
          </button>
          <button
            type='submit'
            className='overline-label cursor-pointer border border-accent px-3.5 py-1.5 text-accent transition-colors duration-150 hover:bg-accent hover:text-canvas'
          >
            {t(locale, 'progressSave')}
          </button>
        </div>
      </form>
    </>
  );
}

/** Masthead trigger — the reader's position set like a printed folio. */
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
        className={`overline-label cursor-pointer border px-2.5 py-1.5 tabular-nums transition-colors duration-150 ${
          active
            ? 'border-line-strong text-fg hover:border-accent hover:text-accent'
            : 'border-accent text-accent hover:bg-accent hover:text-canvas'
        }`}
      >
        <span className='block max-w-56 truncate sm:max-w-64'>{summary}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='end'
          sideOffset={8}
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
