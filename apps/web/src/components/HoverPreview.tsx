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
import { entityTint } from '../lib/entity-tint';
import { useLocale } from '../routes/__root';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';

/** Pointer dwell before anything is requested or shown. */
const OPEN_DELAY = 170;
/** Grace period on leave, so a jitter does not flicker the card. */
const CLOSE_DELAY = 110;
/** Card width; also the clamp used to keep it inside the viewport. */
const CARD_WIDTH = 264;
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

/** Where the card goes: below the link, flipped above when it would not fit. */
function placeFor(rect: DOMRect, cardHeight: number): Placement {
  const room = window.innerHeight - rect.bottom;
  const above = room < cardHeight + CARD_OFFSET && rect.top > room;
  const maxLeft = window.innerWidth - CARD_WIDTH - 12;
  return {
    left: Math.max(12, Math.min(rect.left, maxLeft)),
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
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [view, setView] = useState<EntityPreviewView | null>(null);

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
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  const close = (): void => {
    clearTimers();
    setPlacement(null);
    setView(null);
  };

  const open = (delay: number): void => {
    if (!fine) return;
    clearTimers();
    openTimer.current = setTimeout(() => {
      if (anchor.current === null) return;
      const key = keyFor(locale, type, slug, scope);
      void loadPreview(key, locale, type, slug, scope).then((preview) => {
        // Gated, dangling or failed: no card, no placeholder.
        const box = triggerRect();
        if (preview === null || box === null) return;
        setView(preview);
        // 190px is the plate plus two lines; the flip only needs a
        // ballpark, and the card clamps itself to the viewport anyway.
        setPlacement(placeFor(box, 190));
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
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
    // Re-bound whenever the card opens or closes; `close` only touches
    // refs and setState, both stable by construction.
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
          <PreviewCard view={view} placement={placement} locale={locale} />,
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
  { view, placement, locale }: {
    readonly view: EntityPreviewView;
    readonly placement: Placement;
    readonly locale: Locale;
  },
): ReactElement {
  const tint = entityTint(view.chip.id);
  return (
    <span
      aria-hidden
      className='hover-card tinted pointer-events-none fixed z-40 block rounded-[3px] bg-canvas ring-1 ring-line-strong'
      style={{
        ...tint.vars,
        width: `${CARD_WIDTH}px`,
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        ...(placement.above ? { transform: 'translateY(-100%)' } : {}),
      } as CSSProperties}
    >
      <span className='relative block'>
        <EntityImage
          image={view.image}
          type={view.chip.type}
          slug={view.chip.slug}
          name={view.chip.name}
          ratio='wide'
          className='w-full rounded-t-[3px]'
        />
        <span
          aria-hidden
          className='absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-canvas via-canvas/70 to-transparent'
        />
        {view.tag !== null
          ? (
            <span className='absolute left-2 top-2 rounded-sm bg-canvas/85 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-fg'>
              {view.tag}
            </span>
          )
          : null}
      </span>
      <span className='block px-3 pb-2.5 pt-1.5'>
        <span className='label-xs block'>{view.chip.typeLabel}</span>
        <span className='display mt-0.5 block truncate text-[15px] font-extrabold leading-tight text-fg'>
          {view.chip.name}
        </span>
        {view.secondary !== null
          ? <span className='mt-0.5 block truncate text-[11.5px] text-muted'>{view.secondary}</span>
          : null}
        {view.facts.length > 0
          ? (
            <span className='mt-2 block border-t border-line pt-1.5'>
              {view.facts.map((fact) => (
                <span key={fact.label} className='flex items-baseline gap-2 py-[1px]'>
                  <span className='label-xs shrink-0'>{fact.label}</span>
                  <span className='min-w-0 flex-1 truncate text-right text-[11.5px] tabular-nums text-fg'>
                    {fact.value}
                  </span>
                </span>
              ))}
            </span>
          )
          : null}
        {view.firstAppearance !== null
          ? (
            <span className='mt-1.5 block truncate text-[10.5px] text-faint'>
              {t(locale, 'firstAppearance')} · {view.firstAppearance}
            </span>
          )
          : null}
      </span>
    </span>
  );
}
