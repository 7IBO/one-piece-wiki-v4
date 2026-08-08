/**
 * Right-side slide-in sheet primitives for "grouped options" UIs.
 *
 * The popover-anchored UI we used before broke down as the qualifier
 * list grew:
 *  - **Width starvation** — anchored width was too narrow for chip
 *    pickers and stacked source pickers.
 *  - **Layout shift** — opening a modal popover next to dense in-flow
 *    siblings nudged the form's rhythm.
 *  - **Style drift** — Tailwind in the popover diverged from the main
 *    form, making "more options" feel like a different product.
 *  - **Visual overload** — every qualifier rendered as an empty input,
 *    so a property with 10 allowed qualifiers showed 10 empty boxes
 *    even though the maintainer set zero. Decision paralysis.
 *
 * Three layers, exported separately so the entity form can reuse the
 * chrome for its per-entry editor (2026-08 feedback: "regrouper les
 * options ensemble"):
 *  - `SideSheet` — CONTROLLED slide-in panel (open/onClose, title,
 *    children). Portal + transform-only animation, no backdrop tint,
 *    click-outside + ESC to dismiss.
 *  - `QualifierRowList` — the list-every-qualifier body: set or
 *    just-revealed ids show their editor, the rest render as a
 *    "LABEL   —" line that expands on tap and auto-focuses its first
 *    control.
 *  - `QualifierSheet` — the original trigger-owned composition
 *    (relations editor still uses it).
 */
import { Button } from '@/components/ui/button';
import { Settings2, X } from 'lucide-react';
import type { JSX, ReactElement, ReactNode } from 'react';
import { cloneElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './locale';

/** Selectors for "focusable controls a user would expect to type
 *  into first" — text inputs, dropdowns, buttons. Ordered roughly
 *  by typing-affordance: a text input wins over a button so e.g. a
 *  qualifier with both a Combobox trigger and a hidden input never
 *  steals the keyboard from the input. */
const FOCUSABLE_SELECTOR = [
  'input:not([type=hidden]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'button:not([disabled])',
  '[contenteditable=true]',
].join(',');

/** Minimal shape the sheet needs to render its add-picker. */
export type QualifierSummary = {
  readonly id: string;
  /** Localized human label for the picker entry. */
  readonly label: string;
};

export type SideSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /** Extra sticky footer content (e.g. a remove button). */
  readonly footer?: ReactNode;
};

/**
 * Controlled right-side sheet. Slides in via `createPortal` + plain
 * controlled state — Base UI's Dialog primitive added wrapper DOM
 * around triggers and its open animations introduced jank. Animates
 * only `transform` (GPU-friendly) and skips a backdrop so the page
 * stays clickable and scroll-smooth behind.
 */
export function SideSheet(p: SideSheetProps): JSX.Element | null {
  const t = useT();

  // ESC closes the sheet — cheap to wire up and matches every other
  // overlay UI in the dashboard. Skip when closed to avoid an idle
  // global listener per mounted sheet.
  useEffect(() => {
    if (!p.open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') p.onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.open, p.onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {
        /* Transparent click-outside catcher. Visually invisible
          (no overlay tint, no scroll lock) so the form behind
          stays readable, but intercepts pointer events so a
          click anywhere off the sheet dismisses it. */
      }
      {p.open
        ? (
          <div
            className='fixed inset-0 z-40'
            onClick={p.onClose}
          />
        )
        : null}
      <div
        role='dialog'
        aria-label={p.title}
        // Layered above the catcher; pointer-events disabled
        // when closed so the off-screen panel doesn't intercept
        // clicks that should reach the page behind.
        //
        // Border + shadow are gated on `open`: every entry row can
        // mount its own sheet so an entity with N entries leaves N
        // off-screen panels in the DOM at translate-x-full. Each
        // one's `shadow-xl` is a soft blur that EXTENDS PAST the
        // element bounds — N of them stack on the viewport's right
        // edge and leak a faint rounded smudge through the scrollbar
        // gutter. Drop the shadow when closed (no depth cue needed
        // off-screen) and the smudge goes away.
        className={`bg-background text-foreground fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col outline-none transition-transform duration-150 ease-out ${
          p.open
            ? 'translate-x-0 border-l shadow-xl'
            : 'pointer-events-none translate-x-full'
        }`}
        // GPU-promoted layer keeps the shadow + slide animation
        // off the main thread; without this, scrolling the form
        // behind the open sheet stutters on mid-range hardware.
        style={{ willChange: 'transform' }}
      >
        <div className='border-border flex shrink-0 items-center gap-2 border-b px-4 py-3'>
          <Settings2 className='text-muted-foreground size-4' />
          <h2 className='min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-wide'>
            {p.title}
          </h2>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='ml-auto size-7 shrink-0'
            onClick={p.onClose}
            aria-label={t('close')}
          >
            <X className='size-4' />
          </Button>
        </div>
        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4'>
          {p.children}
        </div>
        {p.footer !== undefined
          ? (
            <div className='border-border shrink-0 border-t px-4 py-3'>
              {p.footer}
            </div>
          )
          : null}
      </div>
    </>,
    document.body,
  );
}

export type QualifierRowListProps = {
  /** Every qualifier the property/relation allows, with localized
   *  labels resolved by the caller. */
  qualifiers: readonly QualifierSummary[];
  /** Set of qualifier ids that currently have a value. Drives which
   *  rows show their editor and which show the "—" expander. */
  setIds: ReadonlySet<string>;
  /** Render a single qualifier row. Called for every id in `setIds`
   *  AND for any id the user just added in this session (so an
   *  empty row appears immediately, ready to fill). */
  renderField: (id: string) => ReactNode;
};

/**
 * 2026-08 feedback: list EVERY available qualifier, like the entity
 * page's property list — set/revealed ones show their editor, the
 * rest show a "label — —" line that expands on tap. No separate
 * add-picker: what exists is always visible.
 */
export function QualifierRowList(p: QualifierRowListProps): JSX.Element {
  // Track qualifiers the user opened during this session but hasn't
  // populated yet. Without this, adding "Source" would render the
  // row briefly, then the value-empty test would hide it on next
  // render before the user could type anything.
  const [reveal, setReveal] = useState<readonly string[]>([]);
  // The id we should auto-focus on next render. Set by `add()` and
  // consumed (cleared) by the focus effect — using a state instead
  // of a ref so the effect re-runs reliably when the maintainer adds
  // several qualifiers in a row.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // After the just-added qualifier's row mounts, find its first
  // typeable control, focus it AND — if it's a Select/Combobox
  // trigger (button) — synthesise a click so the dropdown opens
  // straight away. Plain text/number/date inputs only get focus;
  // clicking those would deselect the cursor.
  useEffect(() => {
    if (pendingFocus === null) return;
    const row = bodyRef.current?.querySelector<HTMLElement>(
      `[data-qualifier-row='${CSS.escape(pendingFocus)}']`,
    );
    if (row === null || row === undefined) return;
    const control = row.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (control === null || control === undefined) {
      setPendingFocus(null);
      return;
    }
    control.focus({ preventScroll: true });
    if (control instanceof HTMLButtonElement) {
      // Defer one frame so Base UI's Select/Combobox can wire up its
      // pointer handlers; a click fired in the same tick as mount
      // can race with the popover's open-on-trigger logic.
      requestAnimationFrame(() => control.click());
    }
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setPendingFocus(null);
  }, [pendingFocus, reveal]);

  const rows = (() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; editing: boolean; }[] = [];
    for (const q of p.qualifiers) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push({
        id: q.id,
        label: q.label,
        editing: p.setIds.has(q.id) || reveal.includes(q.id),
      });
    }
    return out;
  })();

  function add(id: string): void {
    setReveal((prev) => prev.includes(id) ? prev : [...prev, id]);
    setPendingFocus(id);
  }

  return (
    <div ref={bodyRef} className='space-y-3'>
      {rows.map((row) => (
        // Tagged wrapper so the post-add focus effect can find
        // the just-rendered row and focus its first input.
        <div
          key={row.id}
          data-qualifier-row={row.id}
          className='border-border/40 border-b pb-2.5 last:border-0 last:pb-0'
        >
          {row.editing
            ? p.renderField(row.id)
            : (
              <button
                type='button'
                onClick={() => add(row.id)}
                className='hover:bg-accent/40 -mx-1 flex w-full items-baseline justify-between gap-2 rounded-md px-1 py-1.5 text-left transition-colors'
              >
                <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {row.label}
                </span>
                <span className='text-muted-foreground text-sm'>—</span>
              </button>
            )}
        </div>
      ))}
    </div>
  );
}

export type QualifierSheetProps = {
  /** Trigger element — typically the "⋯ More options · count" button.
   *  Receives `onClick` + `aria-expanded` via cloneElement so it
   *  stays a single DOM node (no wrapper magic). */
  trigger: ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog';
  }>;
  /** Sheet title; defaults to localized "More options". */
  title?: string;
  qualifiers: readonly QualifierSummary[];
  setIds: ReadonlySet<string>;
  renderField: (id: string) => ReactNode;
};

/** Trigger-owned composition of SideSheet + QualifierRowList — the
 *  relations editor's "More options" entry point. */
export function QualifierSheet(p: QualifierSheetProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);

  const triggerOriginalClick = p.trigger.props.onClick;
  const triggerWithHandlers = cloneElement(p.trigger, {
    'aria-expanded': open,
    'aria-haspopup': 'dialog' as const,
    onClick: (e: React.MouseEvent) => {
      triggerOriginalClick?.(e);
      setOpen(true);
    },
  });

  return (
    <>
      {triggerWithHandlers}
      <SideSheet
        open={open}
        onClose={() => setOpen(false)}
        title={p.title ?? t('moreOptions')}
      >
        <QualifierRowList
          qualifiers={p.qualifiers}
          setIds={p.setIds}
          renderField={p.renderField}
        />
      </SideSheet>
    </>
  );
}
