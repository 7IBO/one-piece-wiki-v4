/**
 * Header control for the spoiler cursor: shows the current progression
 * ("Ch. 1044 · Ep. 1071") or an invitation to set it, and opens a
 * small panel with the two numeric inputs plus a "show everything"
 * reset. Persists to the `web_progress` cookie — the only store the
 * server functions can read for SSR-filtered first paint — then
 * invalidates the router so every loader refetches filtered views.
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

export function ProgressControl(
  { progress }: { readonly progress: ProgressCursor; },
): JSX.Element {
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [manga, setManga] = useState(progress.manga === null ? '' : String(progress.manga));
  const [anime, setAnime] = useState(progress.anime === null ? '' : String(progress.anime));

  const active = progress.manga !== null || progress.anime !== null;
  const summary = active
    ? [
      progress.manga === null ? null : `${t(locale, 'chapterShort')} ${progress.manga}`,
      progress.anime === null ? null : `${t(locale, 'episodeShort')} ${progress.anime}`,
    ].filter((part) => part !== null).join(' · ')
    : t(locale, 'setProgress');

  const apply = (next: ProgressCursor): void => {
    writeProgressCookie(next);
    setOpen(false);
    void router.invalidate();
  };

  const inputClass =
    'w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none transition-colors focus:border-gold/60';

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger
        className='flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-gold/50 hover:text-fg'
        aria-label={t(locale, 'progressTitle')}
      >
        <span aria-hidden className={active ? 'text-gold' : 'text-faint'}>◉</span>
        <span className='max-w-40 truncate'>{summary}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='end'
          sideOffset={8}
          collisionPadding={12}
          className='isolate z-50'
        >
          <Popover.Popup className='w-72 rounded-xl border border-line bg-panel p-4 shadow-2xl outline-none'>
            <p className='font-display text-base font-semibold text-fg'>
              {t(locale, 'progressTitle')}
            </p>
            <p className='mt-1 text-xs leading-relaxed text-faint'>
              {t(locale, 'progressHint')}
            </p>
            <form
              className='mt-3 space-y-2.5'
              onSubmit={(event) => {
                event.preventDefault();
                apply({ manga: parseInput(manga), anime: parseInput(anime) });
              }}
            >
              <label className='block text-xs text-muted'>
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
              <label className='block text-xs text-muted'>
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
                  className='rounded-full px-3 py-1.5 text-xs text-faint transition-colors hover:text-fg'
                >
                  {t(locale, 'progressReset')}
                </button>
                <button
                  type='submit'
                  className='rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-canvas transition-colors hover:bg-gold-deep'
                >
                  {t(locale, 'progressSave')}
                </button>
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
