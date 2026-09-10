/**
 * Le sélecteur de progression, planche `design/v2/Progression.dc.html`.
 *
 * Ce qui change par rapport au petit popover de v8.1 : on ne demande
 * plus un NUMÉRO, on demande **le dernier arc terminé, groupé par
 * saga**. C'est la seule question à laquelle un lecteur sait répondre
 * sans aller chercher — personne ne retient « chapitre 1044 », tout le
 * monde retient « j'ai fini Wano ».
 *
 * Trois décisions portent le composant.
 *
 * **Les deux axes se règlent dans le même dialogue.** Depuis ADR-123,
 * un axe laissé vide vaut zéro dès qu'un autre est réglé : proposer un
 * seul axe reviendrait à filtrer l'autre à zéro sans le dire. Les
 * onglets changent l'axe édité, jamais ce qui sera enregistré — les
 * deux partent ensemble.
 *
 * **L'échelle n'est pas filtrée par la progression.** C'est la seule
 * surface du site dans ce cas, et c'est la question elle-même : on ne
 * peut pas déclarer sa position dans une liste qui s'arrête à sa
 * position. Voir `buildProgressPicker`.
 *
 * **L'échelle arrive à la première ouverture, puis reste.** Elle ne
 * dépend ni de la page ni du curseur : une seule requête par langue et
 * par session, mémoïsée ici. Le dialogue s'ouvre donc instantanément
 * la deuxième fois.
 */
import { Dialog } from '@base-ui/react/dialog';
import { useRouter } from '@tanstack/react-router';
import { type ReactElement, useCallback, useEffect, useId, useState } from 'react';
import {
  fetchProgressPicker,
  PROGRESS_COOKIE,
  type ProgressArcView,
  type ProgressCursor,
  type ProgressPickerView,
} from '../api';
import { type Locale, t } from '../lib/chrome';

/** Axe de curseur ↔ onglet. L'ordre est celui de la planche. */
const AXES: readonly {
  readonly axis: keyof ProgressCursor;
  readonly label: 'progressAxisManga' | 'progressAxisAnime';
}[] = [
  { axis: 'manga', label: 'progressAxisManga' },
  { axis: 'anime', label: 'progressAxisAnime' },
];

function writeProgressCookie(cursor: ProgressCursor): void {
  const payload: Record<string, number> = {};
  if (cursor.manga !== null) payload['manga'] = cursor.manga;
  if (cursor.anime !== null) payload['anime'] = cursor.anime;
  const empty = Object.keys(payload).length === 0;
  // Un seul cookie first-party ; même raison que le sélecteur de langue.
  // oxlint-disable-next-line unicorn/no-document-cookie
  document.cookie = empty
    ? `${PROGRESS_COOKIE}=; path=/; max-age=0; samesite=lax`
    : `${PROGRESS_COOKIE}=${
      encodeURIComponent(JSON.stringify(payload))
    }; path=/; max-age=31536000; samesite=lax`;
}

/**
 * L'échelle, par langue. Un module-level cache plutôt qu'un état :
 * elle ne change pas d'une ouverture à l'autre, et le dialogue ne doit
 * pas re-payer la requête à chaque fois qu'on le rouvre.
 */
const scaleCache = new Map<Locale, ProgressPickerView>();

function useProgressScale(locale: Locale, open: boolean): ProgressPickerView | null {
  const [scale, setScale] = useState<ProgressPickerView | null>(
    () => scaleCache.get(locale) ?? null,
  );
  useEffect(() => {
    if (!open) return;
    const cached = scaleCache.get(locale);
    if (cached !== undefined) {
      setScale(cached);
      return;
    }
    let alive = true;
    void fetchProgressPicker({ data: { locale } }).then((loaded) => {
      scaleCache.set(locale, loaded);
      if (alive) setScale(loaded);
    });
    return () => {
      alive = false;
    };
  }, [locale, open]);
  return scale;
}

/** L'arc qui contient la position, sur l'axe demandé. */
function arcAt(
  scale: ProgressPickerView | null,
  axis: keyof ProgressCursor,
  at: number | null,
): ProgressArcView | null {
  if (scale === null || at === null) return null;
  for (const saga of scale.sagas) {
    for (const arc of saga.arcs) {
      const range = arc.range[axis];
      if (range !== null && at >= range[0] && at <= range[1]) return arc;
    }
  }
  return null;
}

/** La plus haute borne de l'échelle sur un axe — le « je suis à jour ». */
function scaleTop(scale: ProgressPickerView | null, axis: keyof ProgressCursor): number | null {
  if (scale === null) return null;
  let top: number | null = null;
  for (const saga of scale.sagas) {
    for (const arc of saga.arcs) {
      const range = arc.range[axis];
      if (range !== null && (top === null || range[1] > top)) top = range[1];
    }
  }
  return top;
}

type DialogProps = {
  readonly progress: ProgressCursor;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Le plus haut ordinal du corpus par axe — borne des raccourcis. */
  readonly extent: ProgressCursor;
};

/**
 * La coque : elle porte l'ouverture, le corps porte le brouillon.
 *
 * Le brouillon PART de la position enregistrée, mais s'en détache dès
 * la première modification — c'est exactement le cas où une `key`
 * remplace un effet de resynchronisation (react.dev, « resetting state
 * with a key »). Rouvrir avec une position différente remonte le
 * corps, donc `useState(progress)` redevient ce qu'il doit être : une
 * valeur INITIALE, pas une copie entretenue.
 */
export function ProgressDialog(props: DialogProps): ReactElement {
  const { progress, locale, open, onOpenChange } = props;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className='palette-backdrop fixed inset-0 z-40 bg-canvas/80 backdrop-blur-[2px]' />
        <ProgressDialogBody
          key={`${locale}/${progress.manga ?? ''}/${progress.anime ?? ''}`}
          {...props}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProgressDialogBody(
  { progress, locale, open, onOpenChange, extent }: DialogProps,
): ReactElement {
  const router = useRouter();
  const scale = useProgressScale(locale, open);
  const [axis, setAxis] = useState<keyof ProgressCursor>('manga');
  const [draft, setDraft] = useState<ProgressCursor>(progress);
  const sliderId = useId();

  const apply = (next: ProgressCursor): void => {
    writeProgressCookie(next);
    onOpenChange(false);
    void router.invalidate();
  };

  const at = draft[axis];
  const current = arcAt(scale, axis, at);
  const top = scaleTop(scale, axis) ?? extent[axis];

  // Ouvrir sur une position déjà réglée doit MONTRER cette position :
  // sans ça, un lecteur à Wano rouvre le dialogue sur East Blue et
  // doit refaire défiler les onze sagas pour se retrouver. Une ref de
  // rappel plutôt qu'un effet — le nœud n'existe qu'une fois l'échelle
  // arrivée, et c'est exactement quand React appelle la ref.
  const revealSelected = useCallback((node: HTMLElement | null): void => {
    node?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <Dialog.Popup className='palette-popup fixed left-1/2 top-[7vh] z-50 flex max-h-[86vh] w-[min(30rem,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl'>
      <header className='flex items-start justify-between gap-4 border-b border-line px-5 py-4'>
        <div>
          <Dialog.Title className='text-[17px] font-bold leading-tight text-fg'>
            {t(locale, 'progressWhere')}
          </Dialog.Title>
          <p className='mt-1.5 text-xs leading-relaxed text-muted'>
            {t(locale, 'progressHint')}
          </p>
        </div>
        <Dialog.Close
          aria-label={t(locale, 'progressCancel')}
          className='-mr-1 -mt-1 shrink-0 cursor-pointer rounded-md px-2 py-1 text-lg leading-none text-muted transition-colors duration-150 hover:text-fg'
        >
          ×
        </Dialog.Close>
      </header>

      {
        /* Les onglets changent l'AXE ÉDITÉ, pas ce qui sera
              enregistré : les deux partent ensemble (ADR-123). Chacun
              porte sa position, pour qu'on voie l'autre sans y aller. */
      }
      <div role='tablist' className='flex gap-1 border-b border-line px-5 pt-3'>
        {AXES.map((entry) => {
          const active = entry.axis === axis;
          const value = draft[entry.axis];
          return (
            <button
              key={entry.axis}
              type='button'
              role='tab'
              aria-selected={active}
              onClick={() => setAxis(entry.axis)}
              className={`cursor-pointer rounded-t-md border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors duration-150 ${
                active
                  ? 'border-gold text-gold'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {t(locale, entry.label)}
              {value === null
                ? null
                : (
                  <span className='ml-2 text-[11px] font-normal tabular-nums opacity-70'>
                    {value}
                  </span>
                )}
            </button>
          );
        })}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>
        <p className='label-xs'>{t(locale, 'progressLastArc')}</p>
        {scale === null
          ? <p className='mt-3 text-xs text-muted'>{t(locale, 'progressLoading')}</p>
          : (
            <ArcScale
              scale={scale}
              axis={axis}
              selectedId={current?.id ?? null}
              onSelectedRef={revealSelected}
              onPick={(arc) => {
                const range = arc.range[axis];
                if (range !== null) setDraft({ ...draft, [axis]: range[1] });
              }}
            />
          )}
      </div>

      <footer className='border-t border-line px-5 py-4'>
        {current === null || current.range[axis] === null
          ? null
          : (
            <div className='mb-3'>
              <label htmlFor={sliderId} className='label-xs block'>
                {t(locale, 'progressWithinArc').replace('{arc}', current.name)}
              </label>
              <div className='mt-2 flex items-center gap-3'>
                <input
                  id={sliderId}
                  type='range'
                  min={current.range[axis][0]}
                  max={current.range[axis][1]}
                  value={at ?? current.range[axis][1]}
                  onChange={(event) => setDraft({ ...draft, [axis]: Number(event.target.value) })}
                  className='h-1 w-full cursor-pointer appearance-none rounded-sm bg-line accent-gold'
                />
                <span className='w-14 shrink-0 text-right text-[13px] font-bold tabular-nums text-gold'>
                  {at}
                </span>
              </div>
            </div>
          )}

        {
          /* Les raccourcis : uniquement ceux qu'on peut poser sans
                mentir. « Fin de l'anime diffusé » demanderait le
                chapitre correspondant, que le corpus ne dérive pas
                encore — un raccourci faux vaut moins que pas de
                raccourci. */
        }
        <div className='flex flex-wrap gap-2'>
          <Shortcut onClick={() => setDraft({ manga: 1, anime: 1 })}>
            {t(locale, 'progressStarting')}
          </Shortcut>
          <Shortcut
            onClick={() =>
              setDraft({
                manga: scaleTop(scale, 'manga') ?? extent.manga,
                anime: scaleTop(scale, 'anime') ?? extent.anime,
              })}
          >
            {t(locale, 'progressUpToDate')}
          </Shortcut>
          <Shortcut onClick={() => apply({ manga: null, anime: null })}>
            {t(locale, 'progressReset')}
          </Shortcut>
        </div>

        <p className='mt-3 text-[11px] text-muted'>{t(locale, 'progressEditable')}</p>

        <div className='mt-3 flex items-center justify-between gap-2'>
          <ExactInput
            locale={locale}
            value={at}
            max={top}
            onChange={(value) => setDraft({ ...draft, [axis]: value })}
          />
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => onOpenChange(false)}
              className='cursor-pointer rounded-md border border-line-strong px-4 py-2 text-[13px] font-semibold text-muted transition-colors duration-150 hover:text-fg'
            >
              {t(locale, 'progressCancel')}
            </button>
            <button
              type='button'
              onClick={() => apply(draft)}
              className='cursor-pointer rounded-md bg-gold px-5 py-2 text-[13px] font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
            >
              {t(locale, 'progressSave')}
            </button>
          </div>
        </div>
      </footer>
    </Dialog.Popup>
  );
}

function Shortcut(
  { onClick, children }: {
    readonly onClick: () => void;
    readonly children: string;
  },
): ReactElement {
  return (
    <button
      type='button'
      onClick={onClick}
      className='cursor-pointer rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors duration-150 hover:border-gold/60 hover:text-fg'
    >
      {children}
    </button>
  );
}

/**
 * L'échelle : chaque saga, ses arcs, leurs bornes. Un arc sans
 * intervalle sur l'axe courant n'est pas listé — il n'y a rien à
 * cliquer, et une ligne sans nombre ferait croire à un trou.
 */
function ArcScale(
  { scale, axis, selectedId, onPick, onSelectedRef }: {
    readonly scale: ProgressPickerView;
    readonly axis: keyof ProgressCursor;
    readonly selectedId: string | null;
    readonly onPick: (arc: ProgressArcView) => void;
    /** Reçoit le nœud de l'arc sélectionné, pour l'amener à l'écran. */
    readonly onSelectedRef: (node: HTMLElement | null) => void;
  },
): ReactElement {
  // Un seul passage : garder les arcs qui ont un intervalle sur cet
  // axe, et ne garder la saga que s'il lui en reste.
  const sagas = scale.sagas.flatMap((saga) => {
    const arcs = saga.arcs.filter((arc) => arc.range[axis] !== null);
    return arcs.length === 0 ? [] : [{ ...saga, arcs }];
  });

  return (
    <div className='mt-3 space-y-4'>
      {sagas.map((saga) => (
        <section key={saga.id}>
          <h3 className='label-xs'>{saga.name}</h3>
          <ul className='mt-1.5 space-y-0.5'>
            {saga.arcs.map((arc) => {
              const range = arc.range[axis];
              const selected = arc.id === selectedId;
              return (
                <li key={arc.id}>
                  <button
                    ref={selected ? onSelectedRef : null}
                    type='button'
                    aria-pressed={selected}
                    onClick={() => onPick(arc)}
                    className={`flex w-full cursor-pointer items-baseline justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors duration-150 ${
                      selected ? 'bg-gold/12 text-gold' : 'text-fg/85 hover:bg-panel'
                    }`}
                  >
                    <span className='truncate font-medium'>{arc.name}</span>
                    <span className='shrink-0 text-[12px] tabular-nums text-muted'>
                      {range === null ? '' : `${range[0]} – ${range[1]}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Le numéro exact, pour qui le connaît — l'échelle reste le chemin normal. */
function ExactInput(
  { locale, value, max, onChange }: {
    readonly locale: Locale;
    readonly value: number | null;
    readonly max: number | null;
    readonly onChange: (value: number | null) => void;
  },
): ReactElement {
  return (
    <label className='flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted'>
      {t(locale, 'progressExact')}
      <input
        type='number'
        min={0}
        {...(max === null ? {} : { max })}
        inputMode='numeric'
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === '') {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null);
        }}
        className='w-20 rounded-md border border-line-strong bg-canvas px-2 py-1.5 text-[13px] tabular-nums text-fg outline-none transition-colors duration-150 focus:border-gold'
      />
    </label>
  );
}
