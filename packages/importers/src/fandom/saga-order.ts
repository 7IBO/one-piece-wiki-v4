/**
 * Le rang d'une saga se déduit de la CHAÎNE, jamais d'une page isolée.
 *
 * `saga_number` est `required: true` au schéma, et le `Saga Box` ne le
 * porte pas : il porte `prev` et `next`, deux titres. Une page seule
 * sait qui la précède, pas combien la précèdent. Le rang se calcule
 * donc sur l'ensemble mappé dans un run, comme `orderArcs` le fait
 * pour les arcs.
 *
 * La marche part de la TÊTE — la saga sans `prev` — et suit `next`.
 * Deux garde-fous, parce qu'une chaîne tirée d'un wiki ouvert n'est
 * jamais garantie :
 *
 * - **un cycle ne bloque pas** : chaque maillon n'est visité qu'une
 *   fois, un `next` qui reboucle arrête la marche ;
 * - **ce qui reste hors de la chaîne n'est pas numéroté** plutôt que
 *   numéroté au hasard. Un rang inventé se propagerait dans la
 *   progression du lecteur, qui groupe les arcs par saga : mieux vaut
 *   une saga sans rang, visible comme telle, qu'une saga au mauvais
 *   rang.
 */

export type SagaChainLink = {
  /** Id d'entité (`saga:east-blue`). */
  readonly id: string;
  /** Titre de la page, tel que `prev`/`next` le nomment ailleurs. */
  readonly title: string;
  readonly previous: string | null;
  readonly next: string | null;
};

export type SagaRank = {
  readonly id: string;
  readonly sagaNumber: number;
};

export type SagaOrdering = {
  readonly ranks: readonly SagaRank[];
  /** Ce que la marche n'a pas atteint, et pourquoi ça compte. */
  readonly unchained: readonly string[];
  readonly warnings: readonly string[];
};

/** Normalisation MediaWiki minimale : les titres se comparent ainsi. */
function key(title: string): string {
  return title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function orderSagas(links: readonly SagaChainLink[]): SagaOrdering {
  const byTitle = new Map<string, SagaChainLink>();
  for (const link of links) byTitle.set(key(link.title), link);

  const warnings: string[] = [];

  // La tête : aucune `prev`, ou une `prev` qui ne designe rien de connu
  // (le cas d'un run partiel, ou d'un lien casse sur le wiki).
  const heads = links.filter((l) => l.previous === null || !byTitle.has(key(l.previous)));
  if (heads.length === 0) {
    warnings.push('aucune tete de chaine — toutes les sagas ont une prev connue (cycle ?)');
    return { ranks: [], unchained: links.map((l) => l.id), warnings };
  }
  if (heads.length > 1) {
    warnings.push(
      `${heads.length} tetes de chaine : ${
        heads.map((h) => h.title).join(', ')
      } — la plus longue marche gagne`,
    );
  }

  // Plusieurs departs possibles : on garde la marche la plus longue.
  // Sur un run partiel, la tete « vraie » n'est pas forcement presente,
  // et la plus longue chaine est la plus proche de la verite.
  let best: SagaChainLink[] = [];
  for (const head of heads) {
    const walk: SagaChainLink[] = [];
    const seen = new Set<string>();
    let current: SagaChainLink | undefined = head;
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      walk.push(current);
      current = current.next === null ? undefined : byTitle.get(key(current.next));
    }
    if (walk.length > best.length) best = walk;
  }

  const ranked = new Set(best.map((l) => l.id));
  const unchained = links.filter((l) => !ranked.has(l.id)).map((l) => l.id);
  if (unchained.length > 0) {
    warnings.push(
      `${unchained.length} saga(s) hors de la chaine, laissees sans rang : ${unchained.join(', ')}`,
    );
  }

  return {
    ranks: best.map((link, index) => ({ id: link.id, sagaNumber: index + 1 })),
    unchained,
    warnings,
  };
}
