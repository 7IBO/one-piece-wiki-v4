/**
 * The header search field (ADR-108). A plain `<form>` whose submit
 * navigates to `/search?q=…`, so it works with the keyboard alone,
 * with Enter, and with the browser's own search-field affordances. No
 * autocomplete popover: results are a page, and a floating suggestion
 * card is exactly the "modern web app" register WEB_APP.md § Identity
 * rejects.
 *
 * The field mirrors the URL rather than owning state: landing on
 * `/search?q=nami`, or navigating back to it, refills the input.
 * Presentational only — the query goes to the server, which owns the
 * cursor, the locale and the ranking.
 */
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

function queryFromLocation(search: unknown): string {
  if (search === null || typeof search !== 'object') return '';
  const q = (search as Record<string, unknown>)['q'];
  return typeof q === 'string' ? q : '';
}

export function SearchBox(): ReactElement {
  const locale = useLocale();
  const navigate = useNavigate();
  const urlQuery = useRouterState({
    select: (state) => queryFromLocation(state.location.search),
  });
  const [value, setValue] = useState(urlQuery);

  useEffect(() => setValue(urlQuery), [urlQuery]);

  return (
    <form
      role='search'
      className='min-w-0 flex-1 basis-full order-last sm:order-none sm:basis-auto'
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        if (q === '') return;
        void navigate({ to: '/search', search: { q } });
      }}
    >
      <label className='sr-only' htmlFor='wiki-search'>{t(locale, 'searchLabel')}</label>
      <input
        id='wiki-search'
        type='search'
        name='q'
        value={value}
        autoComplete='off'
        spellCheck={false}
        placeholder={t(locale, 'searchPlaceholder')}
        onChange={(event) => setValue(event.target.value)}
        className='w-full rounded-md border border-line-strong bg-canvas px-3 py-1.5 text-sm text-fg outline-none transition-colors duration-150 placeholder:text-faint hover:border-gold/45 focus:border-gold sm:max-w-80'
      />
    </form>
  );
}
