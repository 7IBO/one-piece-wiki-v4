/**
 * Les apparitions en LISTE, à hauteur de vignette constante.
 *
 * Règle du manifeste `design/v2` (annotation « images ») : « Les
 * apparitions passent en LISTE : la vignette garde son ratio d'origine
 * mais toutes ont la MEME HAUTEUR, donc les lignes s'alignent. Un
 * chapitre 2:3 fait 27 px de large, un episode 16:9 en fait 78 — et
 * les deux tiennent sur la meme ligne sans etre deformes. »
 *
 * C'est la seule forme qui tienne cette promesse : une GRILLE doit
 * choisir une largeur de cellule, donc déformer ou rogner l'un des
 * deux ratios. Une liste ne fixe QUE la hauteur, et laisse la largeur
 * suivre le ratio natif de l'image — `EntityImage` en `fit="native"`
 * réserve l'aspect, la classe `h-10` fixe la hauteur, le navigateur
 * calcule la largeur.
 *
 * Valeurs reprises telles quelles de `design/v2/Main.dc.html` : rangée
 * `gap: 11px; padding: 7px 0`, filet bas, vignette `height: 40px`
 * `border-radius: 3px`, numéro `12.5px/600` sur `58px`, titre `13px`
 * en or, contexte `11px` en gris.
 *
 * Une divergence assumée : la planche écrit « Ch. 1044 » dans la
 * colonne du numéro. Aucune abréviation de ce genre n'existe au
 * schéma (`entity-types/*.json` ne porte que `labels`), et en inventer
 * une par type dans le code applicatif est exactement ce que
 * `CLAUDE.md` interdit. L'onglet au-dessus nomme déjà le type, donc la
 * colonne porte le numéro seul.
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { SourceItemView } from '../api';
import { useScopeSearch } from './EntityChip';
import { EntityImage } from './EntityImage';
import { HoverPreview } from './HoverPreview';

/** Hauteur commune à toutes les vignettes — la règle, en une classe. */
const THUMB = 'h-10 w-auto rounded-[3px]';

export function SourceRow({ item }: { readonly item: SourceItemView; }): ReactElement {
  const search = useScopeSearch();
  const number = item.number === null ? null : String(item.number);
  const body = (
    <>
      <EntityImage
        image={item.image}
        type={item.chip.type}
        slug={item.chip.slug}
        name={item.chip.name}
        fit='native'
        className={THUMB}
      />
      {number === null
        ? null
        : (
          <span className='w-[58px] shrink-0 text-[12.5px] font-semibold tabular-nums'>
            {number}
          </span>
        )}
      <span className='min-w-0 grow truncate text-[13px]'>{item.chip.name}</span>
      {item.context === null
        ? null
        : <span className='shrink-0 text-[11px] text-faint'>{item.context.name}</span>}
    </>
  );
  // La ligne courante n'est pas un lien : on y est déjà. Elle prend
  // l'or, comme la cellule courante du ruban ordinal.
  if (item.current) {
    return (
      <li
        aria-current='page'
        className='flex items-center gap-[11px] border-b border-line-soft py-[7px] text-gold'
      >
        {body}
      </li>
    );
  }
  return (
    <li>
      <HoverPreview type={item.chip.type} slug={item.chip.slug}>
        <Link
          to='/$type/$slug'
          params={{ type: item.chip.type, slug: item.chip.slug }}
          search={search}
          className='flex items-center gap-[11px] border-b border-line-soft py-[7px] text-link transition-colors duration-150 hover:text-link-hover'
        >
          {body}
        </Link>
      </HoverPreview>
    </li>
  );
}
