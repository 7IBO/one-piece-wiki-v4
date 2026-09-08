/**
 * The desktop hover preview (WEB_APP.md § Hover preview) — the
 * maintainer's « hover card sur desktop sur genre des liens ou on a
 * pas d'image ». Dwell on a link to an entity and a small plate opens
 * beside it: the entity's artwork or photo, its name, its identity
 * line and two or three facts. It is wrapped around the LINKS THAT
 * CARRY NO PICTURE — inline chips, a chapter number in a ledger, a
 * title in a contents list — where the name alone tells the reader
 * nothing about what they are about to open.
 *
 * ## Rules it must not break
 *
 * - **A preview is a surfacing.** It is built server-side at the
 *   reader's cursor (`buildEntityPreview`), and an entity beyond the
 *   cursor returns null: the card never opens, and no placeholder
 *   admits that something exists later.
 * - **Desktop only, and never on touch.** Everything here is behind
 *   `(hover: hover) and (pointer: fine)`, evaluated after mount — so
 *   the server renders no card, a phone never renders one, and nothing
 *   informative is hidden behind hover in the first place (every fact
 *   the card shows is also on the page it links to).
 * - **Keyboard reaches it**: focusing the link opens the same card and
 *   Escape closes it. The card is `aria-hidden` and
 *   `pointer-events: none` — it is a sighted-user affordance, not a
 *   second copy of the page: it holds nothing to interact with and
 *   nothing a reader could not get by following the link, so
 *   announcing it would only make the link read twice.
 * - **`prefers-reduced-motion`** cancels the entrance transform
 *   wholesale (`.hover-card` in `styles.css`).
 *
 * ## Loading strategy (why this is not an N+1 storm)
 *
 * Three compounding guards, all of them here:
 *
 * 1. **Hover intent.** Nothing is requested until the pointer has
 *    rested on the link for {@link OPEN_DELAY}. Sweeping a cursor
 *    across a roster of forty links fires zero requests.
 * 2. **A module-level memo, keyed `locale/type/slug`.** A preview is
 *    fetched AT MOST ONCE per entity per page session, whatever the
 *    number of links pointing at it — a crew page linking the same
 *    character six times pays for one. The artifact is immutable at
 *    runtime (CLAUDE.md), so a cached preview cannot go stale; the
 *    cursor lives in a cookie whose change reloads the page, which is
 *    also what discards this module's state.
 * 3. **One in-flight promise per key**, so two links hovered in quick
 *    succession share a single request instead of racing.
 *
 * Presentation only: every string arrives resolved and spoiler-checked
 * from `server/views.ts`.
 */
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { type EntityPreviewView, fetchPreview } from '../api';
import { type Locale, t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/** Pointer dwell before anything is requested or shown. */
const OPEN_DELAY = 170;
/** Grace period on leave, so a jitter does not flicker the card. */
const CLOSE_DELAY = 110;
/** Durée du fondu de sortie — doit rester égale à `.hover-card--leaving`. */
const EXIT_DURATION = 110;
/** Card width; also the clamp used to keep it inside the viewport. */
const CARD_WIDTH = 264;
/** Marge minimale entre la carte et le bord du viewport. */
const VIEWPORT_MARGIN = 12;
/**
 * Hauteur approximative de la carte — la vignette plus deux lignes.
 * Le retournement n'a besoin que d'un ordre de grandeur, et la carte se
 * recale de toute façon sur le viewport.
 */
const CARD_HEIGHT_GUESS = 190;
/** Gap between the link and the card. */
const CARD_OFFSET = 8;

type Placement = { readonly left: number; readonly top: number; readonly above: boolean; };

const cache = new Map<string, EntityPreviewView | null>();
const inflight = new Map<string, Promise<EntityPreviewView | null>>();

function keyFor(locale: Locale, type: string, slug: string, scope: string | null): string {
  return `${locale}/${type}/${slug}/${scope ?? ''}`;
}

/** Memoized, de-duplicated preview fetch. See § Loading strategy. */
function loadPreview(
  key: string,
  locale: Locale,
  type: string,
  slug: string,
  scope: string | null,
): Promise<EntityPreviewView | null> {
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = inflight.get(key);
  if (running !== undefined) return running;
  const request = fetchPreview({
    data: { locale, type, slug, ...(scope === null ? {} : { scope }) },
  })
    .then((view: EntityPreviewView | null) => {
      cache.set(key, view);
      return view;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/**
 * True on a device that actually hovers with a precise pointer.
 * Resolved after mount on purpose: SSR must emit no card at all.
 */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = (): void => setFine(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return fine;
}

/**
 * Ou va la carte : sous le lien, retournee au-dessus faute de place,
 * et CENTREE horizontalement sur lui.
 *
 * Elle etait alignee a gauche du lien (`rect.left`), ce qui la fait
 * partir en biais des qu'un lien est court : une puce de trente pixels
 * ouvrait une carte de 264 qui s'etalait toute vers la droite, sans
 * rapport visible avec ce qu'on survole. Centrer sur le milieu du
 * declencheur rattache la carte a son lien.
 *
 * La butee de bord reste : au ras du viewport la carte se recale au
 * lieu de deborder — donc elle n'est plus exactement centree, ce qui
 * est le bon compromis (une carte coupee ne se lit pas).
 */
function placeFor(rect: DOMRect, cardHeight: number): Placement {
  const room = window.innerHeight - rect.bottom;
  const above = room < cardHeight + CARD_OFFSET && rect.top > room;
  const maxLeft = window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN;
  const centered = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(centered, maxLeft)),
    top: above ? rect.top - CARD_OFFSET : rect.bottom + CARD_OFFSET,
    above,
  };
}

export function HoverPreview(
  { type, slug, children }: {
    readonly type: string;
    readonly slug: string;
    readonly children: ReactNode;
  },
): ReactElement {
  const locale = useLocale();
  const fine = useFinePointer();
  const scopeSearch = useScopeSearch();
  const scope = 'scope' in scopeSearch ? scopeSearch.scope : null;
  const anchor = useRef<HTMLSpanElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [view, setView] = useState<EntityPreviewView | null>(null);
  /** La carte est montée mais en train de sortir : elle joue son fondu. */
  const [leaving, setLeaving] = useState(false);

  /**
   * The box to anchor to. The wrapper is `display: contents` — it must
   * add no box of its own, so that wrapping a grid row or a flex link
   * changes nothing about the layout — which means IT has no rect;
   * the link it wraps is its first element child and does.
   */
  const triggerRect = (): DOMRect | null => {
    const element = anchor.current?.firstElementChild ?? anchor.current;
    return element === null || element === undefined ? null : element.getBoundingClientRect();
  };

  const clearTimers = (): void => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
    exitTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  /**
   * La carte SORT avant de disparaître.
   *
   * Elle était démontée d'un coup : elle entrait en 130 ms et
   * s'évanouissait en zéro. C'est ce déséquilibre qu'on lit comme « pas
   * fluide » — l'œil suit une apparition douce puis se fait arracher
   * l'objet. On la garde montée le temps du fondu, puis on démonte.
   *
   * `unmount` immédiat existe pour les cas où la carte ne doit PAS
   * traîner : la cible a quitté l'écran, ou le composant se démonte.
   */
  const unmount = (): void => {
    clearTimers();
    setLeaving(false);
    setPlacement(null);
    setView(null);
  };

  const close = (): void => {
    clearTimers();
    if (placement === null) return;
    setLeaving(true);
    exitTimer.current = setTimeout(() => {
      setLeaving(false);
      setPlacement(null);
      setView(null);
    }, EXIT_DURATION);
  };

  const open = (delay: number): void => {
    if (!fine) return;
    clearTimers();
    setLeaving(false);
    openTimer.current = setTimeout(() => {
      if (anchor.current === null) return;
      const key = keyFor(locale, type, slug, scope);
      void loadPreview(key, locale, type, slug, scope).then((preview) => {
        // Gated, dangling or failed: no card, no placeholder.
        const box = triggerRect();
        if (preview === null || box === null) return;
        setView(preview);
        setPlacement(placeFor(box, CARD_HEIGHT_GUESS));
      });
    }, delay);
  };

  const scheduleClose = (): void => {
    clearTimers();
    closeTimer.current = setTimeout(close, CLOSE_DELAY);
  };

  useEffect(() => {
    if (placement === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    /*
     * Au scroll la carte SUIT son lien au lieu d'être fermée.
     *
     * Elle se fermait à la moindre molette : la carte est `fixed`, donc
     * sans ça elle restait plantée pendant que le lien s'en allait — le
     * remède était pire que le mal, il suffisait d'un pixel de scroll
     * pour perdre ce qu'on lisait. On recalcule la position (une fois
     * par frame) et on ne démonte que si le lien quitte l'écran, cas où
     * il n'y a plus rien à rattacher.
     */
    let frame = 0;
    const follow = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = triggerRect();
        if (box === null) return;
        if (box.bottom < 0 || box.top > window.innerHeight) {
          unmount();
          return;
        }
        setPlacement(placeFor(box, CARD_HEIGHT_GUESS));
      });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
    // Re-bound whenever the card opens or closes; the handlers only
    // touch refs and setState, both stable by construction.
  }, [placement]);

  return (
    <span
      ref={anchor}
      className='contents'
      onMouseEnter={() => open(OPEN_DELAY)}
      onMouseLeave={scheduleClose}
      onFocus={() => open(0)}
      onBlur={close}
    >
      {children}
      {
        /* Portalled to `document.body` on purpose. The card is
          `position: fixed`, but the hero it can be triggered from is a
          stacking context (`isolation: isolate`), so an in-place card
          would paint UNDER everything that follows the hero in the
          document however high its z-index. Only ever reached on the
          client — `fine` is resolved in an effect — so there is no SSR
          document to miss. */
      }
      {placement !== null && view !== null
        ? createPortal(
          <PreviewCard
            view={view}
            placement={placement}
            locale={locale}
            leaving={leaving}
          />,
          document.body,
        )
        : null}
    </span>
  );
}

/**
 * The plate itself: artwork-led, in the entity's own colour chord
 * (ADR-103), squared off and hairlined like every other surface of the
 * site — NOT a floating rounded SaaS popover, which is the register
 * VISION.md § 4 rejects.
 */
function PreviewCard(
  { view, placement, locale, leaving }: {
    readonly view: EntityPreviewView;
    readonly placement: Placement;
    readonly locale: Locale;
    readonly leaving: boolean;
  },
): ReactElement {
  return (
    <span
      aria-hidden
      className={`hover-card${
        leaving ? ' hover-card--leaving' : ''
      } pointer-events-none fixed z-40 block overflow-hidden rounded-[3px] border border-line-strong bg-canvas`}
      style={{
        width: `${CARD_WIDTH}px`,
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        ...(placement.above ? { transform: 'translateY(-100%)' } : {}),
      } as CSSProperties}
    >
      {
        /* Chrome NEUTRE. La carte portait `tinted`, donc son liseré
        prenait la teinte de l'entité survolée — un contour vert ici,
        rouge trois lignes plus bas, pour une carte qui est du mobilier
        et non du contenu. Le mainteneur a tranché : « les couleurs
        random de contours j'aime pas ». L'illustration garde sa teinte,
        elle se la donne elle-même (`EntityImage`). */
      }
      <span className='relative block'>
        <EntityImage
          image={view.image}
          type={view.chip.type}
          slug={view.chip.slug}
          name={view.chip.name}
          ratio='wide'
          className='w-full'
        />
        {
          /* Un dégradé COURT, en bas seulement. Il montait aux deux
          tiers de l'image et la mangeait : la vignette existe pour
          montrer quelque chose, pas pour servir de fond au texte. */
        }
        <span
          aria-hidden
          className='absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas to-transparent'
        />
      </span>
      <span className='block px-3.5 pb-3 pt-2'>
        {
          /* Type et première apparition sur UNE ligne d'en-tête : deux
          repères de même nature (où l'on est dans le catalogue, où l'on
          est dans l'œuvre), qui tenaient l'un tout en haut et l'autre
          tout en bas avec le contenu coincé entre. */
        }
        <span className='flex items-baseline justify-between gap-2'>
          <span className='label-xs truncate'>{view.tag ?? view.chip.typeLabel}</span>
          {view.firstAppearance !== null
            ? (
              // Le libellé reste : une source nue à droite d'un type
              // ne dit pas ce qu'elle est.
              <span className='shrink-0 truncate text-[10.5px] text-faint'>
                {t(locale, 'firstAppearance')} · {view.firstAppearance}
              </span>
            )
            : null}
        </span>
        <span className='display mt-1 block truncate text-[15.5px] font-extrabold leading-tight text-fg'>
          {view.chip.name}
        </span>
        {view.secondary !== null
          ? <span className='mt-0.5 block truncate text-[11.5px] text-muted'>{view.secondary}</span>
          : null}
        {view.facts.length > 0
          ? (
            <span className='mt-2.5 block border-t border-line-soft pt-2'>
              {view.facts.map((fact) => (
                <span key={fact.label} className='flex items-baseline gap-3 py-[1.5px]'>
                  <span className='label-xs shrink-0'>{fact.label}</span>
                  <span className='min-w-0 flex-1 truncate text-right text-[11.5px] tabular-nums text-fg'>
                    {fact.value}
                  </span>
                </span>
              ))}
            </span>
          )
          : null}
      </span>
    </span>
  );
}
