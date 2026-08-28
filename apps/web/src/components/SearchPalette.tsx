/**
 * The search palette (`Recherche.dc.html`, validated canvas v2; ADR-118).
 *
 * ## Why an overlay when ADR-108 rejected one
 *
 * ADR-108 shipped `/search` as a PAGE and said, in as many words, that
 * a floating suggestion card is the "modern web app" register the
 * project rejects. The maintainer then validated a canvas whose search
 * plate IS an overlay — so the reversal is theirs, and ADR-118 records
 * it. What survives from ADR-108 is the reasoning that made it right:
 * a result is an ENTITY, the ranking is the server's, and nothing
 * floats that the reader did not summon. The palette is summoned (⌘K,
 * or the field) and dismissed (Échap); `/search` remains the page, the
 * shareable URL, and the no-JS path.
 *
 * ## Mounted only while open
 *
 * The component does not take an `open` prop: the caller mounts it or
 * does not. That is what makes `useState(initialQuery)` correct —
 * the query is seeded once, at the moment of opening, with no effect
 * syncing a prop into state afterwards. The earlier version DID have
 * that effect, keyed on `[open, initialQuery]`, and it had a real bug:
 * any later change to `initialQuery` (the header field mirrors the
 * URL, so a route change rewrites it) overwrote whatever the reader
 * was typing.
 *
 * ## The counting rule
 *
 * Chip counts count RESULTS ON SCREEN, never corpus matches. The gate
 * runs in SQL, so a result the reader has not reached never reaches
 * this component — and must not be counted, teased or placeheld. "6
 * personnages" therefore means "six you can see", which is the only
 * number that is safe to render.
 *
 * ## What it never claims
 *
 * The empty state says "beyond your progression" ONLY when a cursor is
 * actually set. Told to a reader who declared nothing, that sentence
 * would be a false explanation for an ordinary miss.
 */
import { Dialog } from '@base-ui/react/dialog';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSearch, type SearchResultView, type SearchView } from '../api';
import { type Locale, t } from '../lib/chrome';
import { highlightRuns } from '../lib/highlight';
import { groupByType, visibleResults } from '../lib/search-groups';
import { useLocale } from '../routes/__root';
import { EntityImage } from './EntityImage';

/** Milliseconds of quiet before a keystroke becomes a request. */
const DEBOUNCE_MS = 160;

/** Results rendered at once — the server already caps its own list. */
const VISIBLE_LIMIT = 24;

/**
 * The answer to the CURRENT query, as one value.
 *
 * These four move together — a new answer arrives, the chip filter
 * resets and the cursor returns to the first row — so they are one
 * state, not four. Four `useState` calls would let a render observe a
 * new result list beside the previous query's active index.
 */
type Answer = {
  readonly view: SearchView | null;
  readonly loading: boolean;
  readonly typeFilter: string | null;
  readonly active: number;
};

const IDLE: Answer = { view: null, loading: false, typeFilter: null, active: 0 };

export function SearchPalette(
  { onClose, initialQuery, cursorSet }: {
    readonly onClose: () => void;
    /** Whatever was already typed in the header field, seeded once. */
    readonly initialQuery: string;
    /** A progression is declared — changes what an empty result MEANS. */
    readonly cursorSet: boolean;
  },
): ReactElement {
  const locale = useLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState<Answer>(IDLE);
  const listRef = useRef<HTMLDivElement | null>(null);

  // One request per pause; a stale answer is dropped rather than
  // rendered over a newer one.
  useEffect(() => {
    const asked = query.trim();
    if (asked === '') {
      setAnswer(IDLE);
      return;
    }
    let live = true;
    setAnswer((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(() => {
      fetchSearch({ data: { locale, q: asked } })
        .then((next: SearchView) => {
          if (live) setAnswer({ view: next, loading: false, typeFilter: null, active: 0 });
        })
        .catch(() => {
          if (live) setAnswer(IDLE);
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, locale]);

  // Memoize on the VIEW, not on a `results ?? []` fallback: that
  // fallback is a fresh array every render, so it defeated every memo
  // below while looking like it worked.
  const all = useMemo<readonly SearchResultView[]>(
    () => answer.view?.results ?? [],
    [answer.view],
  );
  const groups = useMemo(() => groupByType(all), [all]);
  const shown = useMemo(
    () => visibleResults(all, answer.typeFilter, VISIBLE_LIMIT),
    [all, answer.typeFilter],
  );
  const shownGroups = useMemo(() => groupByType(shown), [shown]);

  const go = (result: SearchResultView): void => {
    onClose();
    void navigate({
      to: '/$type/$slug',
      params: { type: result.type, slug: result.slug },
    });
  };

  const move = (delta: number): void =>
    setAnswer((prev) => ({
      ...prev,
      active: shown.length === 0 ? 0 : (prev.active + delta + shown.length) % shown.length,
    }));

  const pick = (typeFilter: string | null): void =>
    setAnswer((prev) => ({ ...prev, typeFilter, active: 0 }));

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = shown[answer.active];
      if (picked !== undefined) go(picked);
      else if (query.trim() !== '') {
        onClose();
        void navigate({ to: '/search', search: { q: query.trim() } });
      }
    }
  };

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]');
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' });
  }, [answer.active]);

  const asked = query.trim() !== '';
  let flat = -1;

  return (
    <Dialog.Root
      open
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 z-40 bg-canvas/80 backdrop-blur-[2px]' />
        <Dialog.Popup
          className='fixed left-1/2 top-[8vh] z-50 flex max-h-[80vh] w-[min(44rem,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl'
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className='sr-only'>{t(locale, 'searchLabel')}</Dialog.Title>

          {/* The input IS the header — no title bar, per the plate. */}
          <div className='flex items-center gap-3 px-5 py-4'>
            <span aria-hidden className='text-[17px] text-muted'>⌕</span>
            {
              /* `autoFocus` is the WAI-ARIA dialog pattern here, not a
                stolen focus: a modal the reader just summoned to type in
                is broken if the caret is anywhere else, and focus is
                trapped inside and restored on close. Linters flag the
                attribute generically; this is the case it exempts. */
            }
            <input
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type='search'
              value={query}
              autoComplete='off'
              spellCheck={false}
              placeholder={t(locale, 'searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t(locale, 'searchLabel')}
              className='min-w-0 flex-1 bg-transparent text-[19px] font-medium text-fg outline-none placeholder:text-faint'
            />
            {asked && !answer.loading && (
              <span className='shrink-0 text-xs tabular-nums text-muted'>
                {all.length} {t(locale, all.length === 1 ? 'searchResult' : 'searchResults')}
              </span>
            )}
            <kbd className='shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-muted'>
              {t(locale, 'paletteEsc')}
            </kbd>
          </div>

          {groups.length > 1 && (
            <div className='flex flex-wrap gap-1.5 border-t border-line px-5 py-3'>
              <Chip
                label={t(locale, 'paletteAll')}
                on={answer.typeFilter === null}
                onClick={() => pick(null)}
              />
              {groups.map((group) => (
                <Chip
                  key={group.type}
                  label={group.label}
                  count={group.results.length}
                  on={answer.typeFilter === group.type}
                  onClick={() => pick(group.type)}
                />
              ))}
            </div>
          )}

          <div ref={listRef} className='min-h-0 flex-1 overflow-y-auto border-t border-line'>
            {!asked
              ? <Note>{t(locale, 'searchPrompt')}</Note>
              : shown.length === 0
              ? (
                <Note>
                  {answer.loading
                    ? t(locale, 'paletteSearching')
                    : cursorSet
                    ? t(locale, 'paletteEmptyGated')
                    : t(locale, 'searchEmpty')}
                </Note>
              )
              : (
                shownGroups.map((group) => (
                  <div key={group.type}>
                    <p className='label-xs px-5 pb-1.5 pt-3.5 text-muted'>{group.label}</p>
                    {group.results.map((result) => {
                      flat += 1;
                      const index = flat;
                      return (
                        <Row
                          key={result.id}
                          result={result}
                          locale={locale}
                          query={query}
                          active={index === answer.active}
                          onHover={() => setAnswer((prev) => ({ ...prev, active: index }))}
                          onPick={() => go(result)}
                        />
                      );
                    })}
                  </div>
                ))
              )}
          </div>

          {answer.view?.approximate === true && shown.length > 0 && (
            <p className='border-t border-line px-5 py-2.5 text-[12.5px] text-gold'>
              {t(locale, 'searchApproximate')}
            </p>
          )}

          <div className='flex items-center justify-between gap-4 border-t border-line bg-canvas px-5 py-3 text-xs text-muted'>
            <span className='flex items-center gap-1.5'>
              <Key>↑</Key>
              <Key>↓</Key>
              {t(locale, 'paletteBrowse')}
              <Key>↵</Key>
              {t(locale, 'paletteOpen')}
            </span>
            {/* Only true when a cursor exists — otherwise nothing limits it. */}
            {cursorSet && <span className='shrink-0'>{t(locale, 'paletteGated')}</span>}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Key({ children }: { readonly children: React.ReactNode; }): ReactElement {
  return (
    <kbd className='rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-muted'>
      {children}
    </kbd>
  );
}

function Note({ children }: { readonly children: React.ReactNode; }): ReactElement {
  return <p className='px-5 py-6 text-sm text-muted'>{children}</p>;
}

function Chip(
  { label, count, on, onClick }: {
    readonly label: string;
    readonly count?: number;
    readonly on: boolean;
    readonly onClick: () => void;
  },
): ReactElement {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors duration-150 ${
        on
          ? 'border-gold bg-gold/10 text-gold'
          : 'border-line-strong text-muted'
      }`}
    >
      {label}
      {count !== undefined && <span className='ml-1.5 tabular-nums opacity-60'>{count}</span>}
    </button>
  );
}

function Row(
  { result, locale, query, active, onHover, onPick }: {
    readonly result: SearchResultView;
    readonly locale: Locale;
    /** The typed term, so the row can show WHERE it matched. */
    readonly query: string;
    readonly active: boolean;
    readonly onHover: () => void;
    readonly onPick: () => void;
  },
): ReactElement {
  return (
    <button
      type='button'
      data-active={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={`flex w-full items-center gap-3 px-5 py-2 text-left transition-colors duration-100 ${
        active ? 'bg-gold/10' : ''
      }`}
    >
      <span className='block size-9 shrink-0 overflow-hidden rounded'>
        <EntityImage
          image={result.image}
          type={result.type}
          slug={result.slug}
          name={result.name}
          ratio='square'
          className='size-full'
        />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold text-fg'>
          {highlightRuns(result.name, query).map((run) => (
            run.match
              // The plate emphasises the matched run in gold inside the
              // name, so the reader sees WHY a row is here without
              // reading the secondary line. Keyed on the run's offset
              // in the name, not on its rank in the array: when the
              // query changes the cuts move and a rank means nothing.
              ? <mark key={run.start} className='bg-transparent text-gold'>{run.text}</mark>
              : <span key={run.start}>{run.text}</span>
          ))}
        </span>
        {(result.secondary !== null || result.matched !== null) && (
          <span className='block truncate text-xs text-muted'>
            {result.matched === null
              ? result.secondary
              : result.matchedLabel === null
              ? result.matched
              : `${result.matchedLabel} · ${result.matched}`}
          </span>
        )}
      </span>
      {active && (
        <kbd
          aria-hidden
          className='shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-muted'
        >
          ↵
        </kbd>
      )}
      <span className='sr-only'>{t(locale, 'paletteOpen')}</span>
    </button>
  );
}
