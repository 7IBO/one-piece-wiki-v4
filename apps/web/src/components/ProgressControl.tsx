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
import { type ReactElement, useState } from 'react';
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
): ReactElement {
  const router = useRouter();
  const locale = useLocale();
  const [manga, setManga] = useState(progress.manga === null ? '' : String(progress.manga));
  const [anime, setAnime] = useState(progress.anime === null ? '' : String(progress.anime));

  const apply = (next: ProgressCursor): void => {
    writeProgressCookie(next);
    onDone();
    void router.invalidate();
  };

  // Les valeurs des planches : `border-radius: 6px`, filet `#2c3038`,
  // fond au niveau du canevas. Les chevrons natifs de `type=number`
  // sont supprimes globalement (`styles.css`), comme la croix native
  // de la recherche : personne ne les a dessines, et on ne monte pas
  // au chapitre 1044 en cliquant mille fois.
  const inputClass =
    'w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-[13.5px] tabular-nums text-fg outline-none transition-colors duration-150 focus:border-gold';

  return (
    <>
      {
        /* La voix des planches pour un titre de bloc : le label a 9px,
          pas un titre display de 15px. */
      }
      <p className='label-xs'>{t(locale, 'progressTitle')}</p>
      <p className='mt-2 text-xs leading-relaxed text-muted'>
        {t(locale, 'progressHint')}
      </p>
      <form
        className='mt-3 space-y-2.5'
        onSubmit={(event) => {
          event.preventDefault();
          apply({ manga: parseInput(manga), anime: parseInput(anime) });
        }}
      >
        <label className='label-xs block'>
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
        <label className='label-xs block'>
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
        <div className='flex items-center justify-between gap-2 pt-1.5'>
          <button
            type='button'
            onClick={() => {
              setManga('');
              setAnime('');
              apply({ manga: null, anime: null });
            }}
            className='cursor-pointer rounded-md border border-line-strong px-4 py-2 text-[13px] font-semibold text-muted transition-colors duration-150 hover:text-fg'
          >
            {t(locale, 'progressReset')}
          </button>
          <button
            type='submit'
            className='cursor-pointer rounded-md bg-gold px-5 py-2 text-[13px] font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
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
  { progress, variant = 'header', extent }: {
    readonly progress: ProgressCursor;
    /** `header`: the plate's bar segment. `button`: the hero's outlined action. */
    readonly variant?: 'header' | 'button';
    /**
     * Highest ordinal the corpus holds per axis — the gauge's
     * denominator. Absent (or zero) renders the position with no bar,
     * which is the honest shape when there is nothing to be a
     * fraction of.
     */
    readonly extent?: ProgressCursor;
  },
): ReactElement {
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
        className={variant === 'header'
          ? 'flex cursor-pointer items-center gap-2.25 rounded-md px-2.5 py-1.5 text-[11px] transition-colors duration-150'
          : 'flex cursor-pointer items-center rounded-md border border-line-strong px-5 py-2.5 text-[13.5px] font-semibold text-fg transition-colors duration-150'}
      >
        {
          /* Two shapes, one control. In the HEADER the plate reads
            « MA PROGRESSION  CH. 1044 »: a muted label beside the
            position in gold, no border — the segment hairlines are the
            frame. In the HERO it is an outlined button beside the gold
            "continue" one, and it says what pressing it does rather
            than restating the position the card already shows. The
            label hides on narrow screens, where the position alone has
            to carry the meaning. */
        }
        {variant === 'header'
          ? (
            <>
              <span className='hidden uppercase tracking-[0.14em] text-muted sm:inline'>
                {t(locale, 'myProgress')}
              </span>
              <ProgressGauge progress={progress} extent={extent} />
              <span
                className={`block max-w-40 truncate font-bold sm:max-w-64 ${
                  active ? 'tabular-nums text-gold' : 'text-fg/85'
                }`}
              >
                {summary}
              </span>
            </>
          )
          : t(locale, active ? 'progressChange' : 'progressSet')}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side='bottom'
          align='end'
          sideOffset={8}
          collisionPadding={12}
          className='isolate z-50'
        >
          {
            /* Le gabarit `.panel` des planches : 6px de rayon, filet
              `#1e222a`, fond `#101217`, 14/16 de marge. */
          }
          <Popover.Popup className='w-[19rem] rounded-md border border-line bg-panel px-4 py-3.5 shadow-lg shadow-black/40 outline-none'>
            <ProgressPanel progress={progress} onDone={() => setOpen(false)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The 90px rail of `design/v2`'s header, filled to the reader's
 * position. It draws the axis the reader has actually declared —
 * manga first, else anime — and nothing at all when there is no
 * cursor or no corpus to measure against: an empty rail would claim a
 * scale the page cannot back.
 */
function ProgressGauge(
  { progress, extent }: {
    readonly progress: ProgressCursor;
    readonly extent: ProgressCursor | undefined;
  },
): ReactElement | null {
  const axis = progress.manga !== null ? 'manga' : progress.anime !== null ? 'anime' : null;
  if (axis === null || extent === undefined) return null;
  const at = progress[axis];
  const total = extent[axis];
  if (at === null || total === null || total <= 0) return null;
  const pct = Math.min(100, Math.max(2, Math.round((at / total) * 100)));
  return (
    <span
      aria-hidden
      className='hidden h-[3px] w-[90px] shrink-0 overflow-hidden rounded-sm bg-line sm:block'
    >
      <span className='block h-full rounded-sm bg-gold' style={{ width: `${pct}%` }} />
    </span>
  );
}
