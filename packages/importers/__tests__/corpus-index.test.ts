/**
 * Le corpus comme index de résolution.
 *
 * Ce module existe à cause d'une mesure : la première passe
 * d'apparitions a rangé « hors corpus » 78 mentions de Roronoa Zoro,
 * 71 de Nami, 57 d'Usopp et 55 de Sanji — quatre entités présentes
 * depuis toujours, mais semées à la main et jamais crawlées, donc
 * absentes du registre d'import.
 */
import { describe, expect, test } from 'bun:test';
import {
  buildCorpusSlugIndex,
  type CorpusSlugIndex,
  resolveAgainstCorpus,
} from '../src/corpus-index.ts';

const index: CorpusSlugIndex = new Map([
  ['nami', ['character:nami']],
  ['roronoa-zoro', ['character:roronoa-zoro']],
  ['wano-country', ['location:wano-country', 'arc:wano-country']],
  ['romance-dawn', ['arc:romance-dawn']],
]);

describe('resolveAgainstCorpus', () => {
  test('un titre de page retrouve son entité par le slug', () => {
    expect(resolveAgainstCorpus(index, 'Nami')).toEqual({
      kind: 'resolved',
      entityId: 'character:nami',
    });
    expect(resolveAgainstCorpus(index, 'Roronoa Zoro')).toEqual({
      kind: 'resolved',
      entityId: 'character:roronoa-zoro',
    });
  });

  test('deux types pour un slug : le module REFUSE de trancher', () => {
    // `arc:wano-country` et `location:wano-country` portent le même
    // slug. Choisir serait un tirage au sort.
    expect(resolveAgainstCorpus(index, 'Wano Country')).toEqual({
      kind: 'ambiguous',
      candidates: ['location:wano-country', 'arc:wano-country'],
    });
  });

  test('restreindre les types lève l’ambiguïté quand un seul est admis', () => {
    // `features` accepte `location` mais pas `arc` : il n'y a plus
    // qu'un candidat, et ce n'est pas un choix arbitraire.
    expect(resolveAgainstCorpus(index, 'Wano Country', ['location', 'character'])).toEqual({
      kind: 'resolved',
      entityId: 'location:wano-country',
    });
  });

  test('un type non admis ne produit pas d’arête', () => {
    expect(resolveAgainstCorpus(index, 'Romance Dawn', ['character'])).toEqual({ kind: 'absent' });
  });

  test('un titre inconnu reste absent', () => {
    expect(resolveAgainstCorpus(index, 'Zunesha')).toEqual({ kind: 'absent' });
    expect(resolveAgainstCorpus(index, '')).toEqual({ kind: 'absent' });
  });
});

describe('buildCorpusSlugIndex', () => {
  test('lit le corpus réel et trouve les quatre que le registre ratait', async () => {
    const real = await buildCorpusSlugIndex(
      new URL('../../..', import.meta.url).pathname,
    );
    for (const slug of ['nami', 'roronoa-zoro', 'usopp', 'sanji']) {
      expect(real.get(slug)).toEqual([`character:${slug}`]);
    }
  });

  test('un dossier absent rend un index vide, pas une erreur', async () => {
    expect((await buildCorpusSlugIndex('/nowhere')).size).toBe(0);
  });
});
