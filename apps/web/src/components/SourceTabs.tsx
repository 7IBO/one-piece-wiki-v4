/**
 * Un onglet par TYPE DE SOURCE dans le module des apparitions.
 *
 * Demande du mainteneur : « maybe proposer tabs chapitre, épisode,
 * autres sources dans apparitions section pour pas trop mélanger ». Le
 * mélange était réel et il avait deux effets, pas un :
 *
 * 1. **Les vignettes n'ont pas le même ratio.** Un chapitre est une
 *    couverture 2:3, un épisode un plan 16:9 (`lib/image-ratio.ts`).
 *    Empilés dans une même grille ils ne peuvent pas s'aligner, et
 *    aucun réglage de gabarit n'y change quoi que ce soit — c'est une
 *    propriété de ce que les images SONT.
 * 2. **Les numérotations ne sont pas comparables.** « 1044 » ne veut
 *    pas dire la même chose selon qu'il s'agit d'un chapitre ou d'un
 *    épisode, et les deux séries avancent à des rythmes différents.
 *
 * Séparer par onglets règle les deux à la racine plutôt qu'en surface.
 * C'est aussi la seule forme qui tienne 342 chapitres ET 1 062
 * épisodes sur la même page.
 *
 * Un seul groupe ne produit AUCUN onglet : un onglet isolé n'est pas
 * une navigation — le même principe que la navigation de sous-pages
 * (ADR-110).
 *
 * Purement présentationnel : le contenu de chaque groupe arrive déjà
 * rendu, ce composant ne décide que de ce qui est visible.
 */
import { type JSX, type ReactNode, useState } from 'react';

export type SourceTabGroup = {
  /** Clé stable du groupe — l'id du type de source. */
  readonly key: string;
  /** Libellé déjà traduit. */
  readonly label: string;
  /** Nombre d'apparitions dans ce type de source, à la progression. */
  readonly count: number;
  readonly content: ReactNode;
};

export function SourceTabs(
  { groups }: { readonly groups: readonly SourceTabGroup[]; },
): JSX.Element | null {
  const first = groups[0];
  const [active, setActive] = useState(first?.key ?? '');
  if (first === undefined) return null;
  if (groups.length === 1) return <div>{first.content}</div>;
  const current = groups.find((group) => group.key === active) ?? first;
  return (
    <div>
      <div className='flex flex-wrap gap-x-5 border-b border-line'>
        {groups.map((group) => {
          const on = group.key === current.key;
          return (
            <button
              key={group.key}
              type='button'
              onClick={() => setActive(group.key)}
              aria-current={on ? 'true' : undefined}
              className={`-mb-px cursor-pointer border-b-2 pb-2 pt-1 text-[12.5px] transition-colors duration-150 ${
                on
                  ? 'border-gold font-semibold text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {group.label} <span className='tabular-nums text-faint'>{group.count}</span>
            </button>
          );
        })}
      </div>
      <div className='mt-4'>{current.content}</div>
    </div>
  );
}
