/**
 * L'affichage du curseur anti-spoil dans l'en-tête, et sa gâchette.
 *
 * Il reste exactement UNE gâchette, donc ce contrôle est aussi
 * l'affichage de la position : son libellé EST la position du lecteur
 * (« Ch. 600 · Ép. 1071 »), en or, pour que l'état soit en permanence
 * à l'écran sans un rail gradué sur toute la largeur de chaque page.
 *
 * L'ÉDITION, elle, a quitté ce fichier : le petit popover à deux
 * champs numériques demandait un numéro que personne ne retient. Elle
 * vit maintenant dans `ProgressDialog`, qui demande le dernier arc
 * terminé, groupé par saga (planche `design/v2/Progression.dc.html`).
 */
import { type ReactElement, useState } from 'react';
import type { ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { ProgressDialog } from './ProgressDialog';

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
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        aria-label={t(locale, 'progressTitle')}
        aria-haspopup='dialog'
        className={variant === 'header'
          ? 'flex cursor-pointer items-center gap-2.25 rounded-md px-2.5 py-1.5 text-[11px] transition-colors duration-150'
          : 'flex cursor-pointer items-center rounded-md border border-line-strong px-5 py-2.5 text-[13.5px] font-semibold text-fg transition-colors duration-150'}
      >
        {
          /* Deux formes, un seul contrôle. Dans l'EN-TÊTE la plaque lit
            « MA PROGRESSION  CH. 1044 » : un libellé discret à côté de
            la position en or, sans bordure — les filets de la barre
            font le cadre. Dans le HÉROS c'est un bouton contouré à
            côté du bouton or « continuer », et il dit ce que le clic
            fait plutôt que de répéter la position que la carte montre
            déjà. Le libellé disparaît en écran étroit, où la position
            seule doit porter le sens. */
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
      </button>
      <ProgressDialog
        progress={progress}
        locale={locale}
        open={open}
        onOpenChange={setOpen}
        extent={extent ?? { manga: null, anime: null }}
      />
    </>
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
