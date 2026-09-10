/**
 * La regle qui a remplace l'effet de nettoyage des erreurs
 * (`EntityForm`). Elle vaut d'etre testee parce que son invariant est
 * temporel — « ces erreurs decrivent-elles encore ce qui est a
 * l'ecran ? » — et qu'aucun test ne couvrait le composant.
 */
import { describe, expect, it } from 'bun:test';
import {
  NO_ERRORS,
  type ValidationErrors,
  visibleErrors,
  withLiveIssues,
} from '../../src/form/validation-errors.ts';

const DATA_A = '{"properties":{"bounty":[{"value":30000000}]}}';
const DATA_B = '{"properties":{"bounty":[{"value":100000000}]}}';

const errorsFor = (forData: string): ValidationErrors => ({
  forData,
  byProperty: { bounty: ['Entrée 1 · Depuis : valeur manquante'] },
  topLevel: ['slug: Invalid input'],
});

describe('visibleErrors', () => {
  it('affiche les erreurs qui decrivent la donnee courante', () => {
    const shown = visibleErrors(errorsFor(DATA_A), DATA_A);
    expect(shown.byProperty['bounty']).toHaveLength(1);
    expect(shown.topLevel).toHaveLength(1);
  });

  it("efface celles qui parlent d'un etat revolu — sans effet", () => {
    // C'est tout l'objet du changement : l'ancien nettoyage passait par
    // un `useEffect`, qui s'execute APRES le commit, donc un liseré
    // rouge perime survivait un rendu de plus. Ici la frappe et la
    // disparition sont le meme rendu.
    const shown = visibleErrors(errorsFor(DATA_A), DATA_B);
    expect(shown.byProperty).toEqual({});
    expect(shown.topLevel).toEqual([]);
  });

  it("n'affiche rien a l'etat initial", () => {
    expect(visibleErrors(NO_ERRORS, DATA_A).topLevel).toEqual([]);
  });
});

describe('withLiveIssues', () => {
  it('ne renvoie pas un nouvel objet quand rien ne change', () => {
    // Reecrire un tableau identique a chaque pause de frappe serait un
    // rendu pour rien : l'identite doit etre preservee.
    const previous = errorsFor(DATA_A);
    expect(withLiveIssues(previous, DATA_A, previous.byProperty)).toBe(previous);
  });

  it('remplace les erreurs de champ quand le tableau change', () => {
    const next = withLiveIssues(errorsFor(DATA_A), DATA_A, { slug: ['trop long'] });
    expect(next.byProperty).toEqual({ slug: ['trop long'] });
    expect(next.forData).toBe(DATA_A);
  });

  it('GARDE la banniere de sauvegarde tant que la donnee ne bouge pas', () => {
    // Une banniere decrit la donnee telle qu'elle a ete ENVOYEE. La
    // validation live tourne encore (le formulaire reste dirty apres un
    // echec) et ne doit pas l'effacer.
    const next = withLiveIssues(errorsFor(DATA_A), DATA_A, { slug: ['trop long'] });
    expect(next.topLevel).toEqual(['slug: Invalid input']);
  });

  it('LA JETTE des que la donnee bouge', () => {
    const next = withLiveIssues(errorsFor(DATA_A), DATA_B, {});
    expect(next.topLevel).toEqual([]);
    expect(next.forData).toBe(DATA_B);
  });
});
