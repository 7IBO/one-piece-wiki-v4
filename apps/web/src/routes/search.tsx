/**
 * `/search?q=…` — the results page (ADR-108).
 *
 * Server-rendered against the reader's progression cursor, so the
 * first paint is already filtered and no spoiler ever flashes. The
 * page reuses the collection wall (`CardGrid` + `EntityCard`) rather
 * than inventing a result-row language: a search result IS an entity,
 * and it should look exactly like the same entity does on its type
 * listing — artwork-led tile, name over the composition, its own
 * colour chord.
 *
 * The only search-specific addition is the `meta` line, which says
 * WHICH string matched when it was not the displayed name ("Epithet ·
 * Straw Hat"), so a hit on an alias explains itself. Everything on
 * screen came through the cursor gate.
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { fetchSearch } from '../api';
import { CardGrid, EntityCard } from '../components/EntityCard';
import { t } from '../lib/chrome';
import { useLocale } from './__root';

type SearchParams = { readonly q: string; };

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search['q'] === 'string' ? search['q'] : '',
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) => fetchSearch({ data: { locale: context.locale, q: deps.q } }),
  head: ({ loaderData }) => ({
    meta: [{
      title: loaderData?.query === undefined || loaderData.query === ''
        ? 'Search — One Piece Wiki'
        : `${loaderData.query} — One Piece Wiki`,
    }],
  }),
  component: SearchPage,
});

function SearchPage(): ReactElement {
  const view = Route.useLoaderData();
  const locale = useLocale();
  const asked = view.query.trim() !== '';
  const count = view.results.length;

  return (
    <div className='page-column pt-8 sm:pt-10'>
      <header className='mb-6'>
        <p className='label-xs text-gold'>{t(locale, 'searchTitle')}</p>
        <h1 className='display mt-2 text-[clamp(1.9rem,5vw,3.2rem)] font-extrabold uppercase leading-[0.95] text-fg'>
          {asked ? view.query : t(locale, 'searchLabel')}
        </h1>
        <p className='mt-2 text-sm text-muted'>
          {asked
            ? (
              <>
                <span className='font-semibold tabular-nums text-fg'>{count}</span>{' '}
                {t(locale, count === 1 ? 'searchResult' : 'searchResults')}
              </>
            )
            : t(locale, 'searchLead')}
        </p>
      </header>

      {view.approximate && count > 0
        ? (
          <p className='mb-5 border-y border-line py-3 text-[13px] text-gold'>
            {t(locale, 'searchApproximate')}
          </p>
        )
        : null}

      {!asked
        ? (
          <p className='rounded-md px-4 py-3 text-muted ring-1 ring-line'>
            {t(locale, 'searchPrompt')}
          </p>
        )
        : count === 0
        ? (
          <p className='rounded-md px-4 py-3 text-muted ring-1 ring-line'>
            {t(locale, 'searchEmpty')}
          </p>
        )
        : (
          <CardGrid>
            {view.results.map((result) => (
              <EntityCard
                key={result.id}
                type={result.type}
                slug={result.slug}
                image={result.image}
                name={result.name}
                secondary={result.secondary}
                meta={result.matched === null
                  ? null
                  : result.matchedLabel === null
                  ? result.matched
                  : `${result.matchedLabel} · ${result.matched}`}
                tag={result.typeLabel}
              />
            ))}
          </CardGrid>
        )}
    </div>
  );
}
