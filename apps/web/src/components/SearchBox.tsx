/**
 * The header search field, and the trigger for the palette.
 *
 * It is STILL a plain `<form>` GETting `/search?q=…`. That is the path
 * a reader gets before hydration and with JavaScript off — ADR-108's
 * page never went away. The `action` is load-bearing and was missing
 * at first: without it the form posts to the CURRENT url, so from `/`
 * a no-JS reader landed on `/?q=nami` and nothing happened. The
 * claim "it works without JavaScript" was false until the attribute
 * existed; it is true now, and `method='get'` keeps the query in the
 * URL where `/search` reads it.
 *
 * What the canvas added on top is a summoned overlay
 * (`SearchPalette`): clicking the field, typing in it, or pressing ⌘K
 * / Ctrl-K opens it with whatever is already there. NOT on focus —
 * closing the palette returns focus to this input, and an
 * open-on-focus would reopen it forever.
 *
 * The field mirrors the URL rather than owning state: landing on
 * `/search?q=nami`, or navigating back to it, refills the input.
 * Presentational only — the query goes to the server, which owns the
 * cursor, the locale and the ranking.
 */
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import type { ProgressCursor } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { SearchPalette } from './SearchPalette';

/**
 * True once there is room for the plate's full placeholder.
 *
 * Resolved AFTER mount on purpose: the server cannot know the
 * viewport, so SSR emits the short form, which is correct at every
 * width and never truncates mid-word. The long one — the plate's
 * « Rechercher — personnages, fruits, chapitres, arcs, épisodes… » —
 * arrives when the segment can hold it. Same shape as
 * `useFinePointer` in HoverPreview.
 */
function useWideHeader(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = (): void => setWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return wide;
}

function queryFromLocation(search: unknown): string {
  if (search === null || typeof search !== 'object') return '';
  const q = (search as Record<string, unknown>)['q'];
  return typeof q === 'string' ? q : '';
}

export function SearchBox(
  { progress }: { readonly progress: ProgressCursor; },
): ReactElement {
  const locale = useLocale();
  const navigate = useNavigate();
  const urlQuery = useRouterState({
    select: (state) => queryFromLocation(state.location.search),
  });
  const [value, setValue] = useState(urlQuery);
  const [palette, setPalette] = useState(false);
  const wide = useWideHeader();

  useEffect(() => setValue(urlQuery), [urlQuery]);

  // ⌘K / Ctrl-K from anywhere. Bound after mount, so the shortcut and
  // the overlay appear together — never a key that does nothing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setPalette(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {
        /* Mounted only while open: the palette seeds its query once,
        from `value`, with no effect syncing a prop into state. */
      }
      {palette && (
        <SearchPalette
          onClose={() => setPalette(false)}
          initialQuery={value}
          cursorSet={progress.manga !== null || progress.anime !== null}
        />
      )}
      {
        /* The plate gives the field the WHOLE segment between the
        wordmark and the controls, with no box of its own — the
        hairlines around it are the affordance. Boxed and capped at
        320px, it read as one control among three instead of as the
        page's dominant element. Below `sm` it keeps its box, because
        there are no segments to sit between. */
      }
      <form
        role='search'
        action='/search'
        method='get'
        className='order-last flex min-w-0 flex-1 basis-full items-center sm:order-none sm:basis-auto'
        onSubmit={(event) => {
          event.preventDefault();
          const q = value.trim();
          if (q === '') return;
          void navigate({ to: '/search', search: { q } });
        }}
      >
        <label className='sr-only' htmlFor='wiki-search'>{t(locale, 'searchLabel')}</label>
        <span aria-hidden className='hidden shrink-0 pl-4 text-[13px] text-muted sm:block'>⌕</span>
        <input
          id='wiki-search'
          type='search'
          name='q'
          value={value}
          autoComplete='off'
          spellCheck={false}
          placeholder={t(locale, wide ? 'searchPlaceholder' : 'searchPlaceholderShort')}
          onChange={(event) => setValue(event.target.value)}
          onClick={() => setPalette(true)}
          onKeyDown={(event) => {
            // Any character the reader types goes into the palette,
            // where the results are. Modifier combinations and
            // navigation keys are left to the field and the browser.
            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
              setPalette(true);
            }
          }}
          className='w-full rounded-md border border-line-strong bg-canvas px-3 py-1.5 text-sm text-fg outline-none transition-colors duration-150 placeholder:text-faint hover:border-gold/45 focus:border-gold sm:rounded-none sm:border-0 sm:bg-transparent sm:pl-2.5 sm:pr-4 sm:text-[12.5px] sm:hover:border-0 sm:focus:border-0 [&::-webkit-search-cancel-button]:hidden'
        />
      </form>
    </>
  );
}
