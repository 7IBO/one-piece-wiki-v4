/**
 * Les erreurs de validation d'un formulaire, ATTACHEES a la donnee
 * qu'elles decrivent.
 *
 * `EntityForm` gardait deux etats (`fieldErrors`, `topLevelErrors`) et
 * un effet qui les vidait des que la donnee editee changeait — « garder
 * un liseré rouge autour d'une propriete que l'utilisateur vient de
 * corriger est hostile ». Juste sur l'intention, faux sur le moment :
 * un effet s'execute APRES le commit, donc les erreurs perimees
 * restaient affichees un rendu de plus. Et remettre un etat a zero
 * depuis un effet parce qu'une AUTRE valeur a change est le motif que
 * react.dev deconseille (« you might not need an effect »).
 *
 * En estampillant les erreurs avec l'empreinte de la donnee validee, la
 * question « sont-elles encore d'actualite ? » se resout AU RENDU :
 * elles disparaissent dans le meme rendu que la frappe, et l'effet de
 * nettoyage disparait.
 */

export type ValidationErrors = {
  /**
   * Empreinte de la donnee que ces erreurs decrivent — la meme chaine
   * que `currentDataString` dans le formulaire.
   */
  readonly forData: string;
  /** Erreurs par id de propriete, pour le liseré rouge du champ. */
  readonly byProperty: Record<string, readonly string[]>;
  /** Erreurs qui ne s'attribuent a aucun champ, pour la banniere. */
  readonly topLevel: readonly string[];
};

/** `forData: ''` ne peut correspondre a aucune donnee serialisee. */
export const NO_ERRORS: ValidationErrors = { forData: '', byProperty: {}, topLevel: [] };

/**
 * Ce qui doit s'afficher pour l'etat courant de la donnee.
 *
 * Des erreurs dont l'empreinte ne correspond plus parlent d'un etat
 * revolu : elles ne s'affichent pas, sans qu'aucun effet ait eu a les
 * effacer.
 */
export function visibleErrors(
  errors: ValidationErrors,
  currentDataString: string,
): Pick<ValidationErrors, 'byProperty' | 'topLevel'> {
  return errors.forData === currentDataString ? errors : NO_ERRORS;
}

/**
 * Le resultat d'une validation live, replie sur l'etat precedent.
 *
 * Deux regles que le comportement d'origine imposait et qu'il faut
 * garder :
 *
 *  - **ne rien ecrire quand rien ne change** — reecrire un tableau vide
 *    a chaque pause de frappe serait un rendu pour rien ;
 *  - **une banniere de sauvegarde survit a la validation live** : elle
 *    decrit la donnee TELLE QU'ELLE A ETE ENVOYEE, donc elle reste tant
 *    que la donnee n'a pas bouge, et seulement alors.
 */
export function withLiveIssues(
  previous: ValidationErrors,
  currentDataString: string,
  byProperty: Record<string, readonly string[]>,
): ValidationErrors {
  const sameData = previous.forData === currentDataString;
  if (sameData && JSON.stringify(previous.byProperty) === JSON.stringify(byProperty)) {
    return previous;
  }
  return {
    forData: currentDataString,
    byProperty,
    topLevel: sameData ? previous.topLevel : [],
  };
}
