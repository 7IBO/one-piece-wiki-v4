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
import { createFileRoute, useNavigate } from '@tanstack/react-router';
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

      {
        /* `key` sur la requete : quand l'URL change par une navigation
        cote client (un lien depuis la palette), le champ est REMONTE,
        donc son `defaultValue` reprend la nouvelle requete. C'est la
        facon React de resynchroniser — un `useEffect(() =>
        setValue(query), [query])` faisait le meme travail en deux
        rendus et une copie d'etat de plus.

        Sur un retour arriere le navigateur restaure lui-meme ce qui
        etait tape, et cette restauration gagne sur `defaultValue` :
        verifie au navigateur, le champ garde « nami » alors que l'URL
        repasse a `?q=`. C'est le comportement natif des formulaires,
        et le laisser est plus juste que le combattre — la requete
        precedente est ce qu'on veut retrouver sous la main. */
      }
      <QueryField key={view.query} query={view.query} />

      {!asked
        ? null
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
                urlSegment={result.urlSegment}
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

/**
 * Le champ de la page de resultats.
 *
 * Il y avait bien une boite ici, avec « Type a name to search the
 * wiki. » dedans — mais c'etait un `<p>`. Elle ressemblait exactement
 * a un champ de saisie et n'en etait pas un, et le bouton « Search the
 * wiki » de l'accueil menait droit dessus : on arrivait sur une page
 * de recherche ou l'on ne pouvait pas taper.
 *
 * Le champ de l'en-tete ne remplacait pas ce manque : au clic il ouvre
 * la palette PAR-DESSUS la page, donc il ne permet pas de reprendre la
 * requete en place — ce qui est precisement ce qu'on veut faire devant
 * une liste de resultats.
 *
 * Un `<form method='get' action='/search'>` : il marche avant meme que
 * React soit monte, ce qui est la bonne propriete pour la seule
 * commande de la page.
 */
function QueryField({ query }: { readonly query: string; }): ReactElement {
  const locale = useLocale();
  const navigate = useNavigate();
  return (
    <form
      role='search'
      action='/search'
      method='get'
      className='mb-6'
      onSubmit={(event) => {
        // Le champ n'a PAS d'etat React : le formulaire porte deja la
        // valeur, et la lire ici evite une copie qui pourrait diverger
        // de ce que la soumission native enverrait.
        const asked = new FormData(event.currentTarget).get('q');
        event.preventDefault();
        void navigate({
          to: '/search',
          search: { q: typeof asked === 'string' ? asked.trim() : '' },
        });
      }}
    >
      <label className='sr-only' htmlFor='search-page-q'>{t(locale, 'searchLabel')}</label>
      <div className='flex items-center gap-2.5 rounded-md border border-line-strong bg-surface px-4 transition-colors duration-150 focus-within:border-line-strong'>
        <span aria-hidden className='shrink-0 text-[13px] text-faint'>⌕</span>
        {
          /* Champ NON CONTROLE : le DOM garde ce qui est tape, la
          soumission native l'envoie sous `q`, et il n'y a aucune copie
          React a resynchroniser sur l'URL. C'est aussi ce que
          react-doctor demande (`no-derived-useState`) — et ici la
          demande coincide avec le plus simple. */
        }
        <input
          id='search-page-q'
          type='search'
          name='q'
          defaultValue={query}
          autoComplete='off'
          spellCheck={false}
          placeholder={t(locale, 'searchPrompt')}
          className='min-w-0 flex-1 bg-transparent py-3 text-sm text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden'
        />
      </div>
    </form>
  );
}
