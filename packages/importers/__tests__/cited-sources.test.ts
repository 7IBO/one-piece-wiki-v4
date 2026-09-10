/**
 * Les sources citées par Qref doivent exister — et un stub ne doit
 * jamais porter plus que ce que la citation dit.
 */
import { describe, expect, test } from 'bun:test';
import {
  citedSourceIds,
  STUBBABLE_SOURCE_TYPES,
  stubForCitedSource,
} from '../src/fandom/cited-sources.ts';

describe('stubForCitedSource', () => {
  test('une colonne SBS pend à son tome, et ne date rien', () => {
    const stub = stubForCitedSource('sbs:volume-90');
    expect(stub?.entity.id).toBe('sbs:volume-90');
    expect(stub?.entity['relations']).toEqual([
      { type: 'part-of-volume', target: 'volume:90' },
    ]);
    // Pas de `released_at` : la date est celle du tome, déjà portée
    // par le `volume`. L'inventer ici la dédoublerait, et la deviner
    // la falsifierait.
    expect(stub?.entity['properties']).toEqual({ canon_scope: { value: 'sbs' } });
  });

  test('une fiche de databook ne porte que son numéro', () => {
    const stub = stubForCitedSource('databook-card:0740');
    expect(stub?.entity.id).toBe('databook-card:0740');
    // Le numéro garde ses zéros : c'est l'id, pas un entier.
    expect(stub?.entity['properties']).toEqual({ card_number: { value: '0740' } });
    // Le TYPE de fiche demanderait de lire la fiche : il reste absent.
    expect(JSON.stringify(stub?.entity)).not.toContain('card_kind');
  });

  test('ce qui ne se matérialise pas reste pendant, plutôt qu’inventé', () => {
    expect(stubForCitedSource('sbs:volume-abc')).toBeNull();
    expect(stubForCitedSource('databook-card:vivre-card')).toBeNull();
    expect(stubForCitedSource('manga-chapter:1044')).toBeNull();
    expect(stubForCitedSource('no-colon')).toBeNull();
  });
});

describe('citedSourceIds', () => {
  const emit = {
    entity: {
      id: 'character:x',
      type: 'character',
      properties: {
        age: [{ value: 30, source: 'databook-card:0740' }],
        height: [{ value: 180, source: 'sbs:volume-90' }],
        bounty: [{ value: 100, since: 'manga-chapter:1', source: 'databook-card:0740' }],
      },
      relations: [{ type: 'member-of', target: 'crew:y', since: 'sbs:volume-97' }],
    },
    translations: { en: {} },
  };

  test('tous les axes, à toute profondeur, sans doublon', () => {
    expect([...citedSourceIds(emit)].sort()).toEqual([
      'databook-card:0740',
      'sbs:volume-90',
      'sbs:volume-97',
    ]);
  });

  test('les sources qui existent déjà comme type ne sont pas ramassées', () => {
    expect(citedSourceIds(emit)).not.toContain('manga-chapter:1');
    expect(STUBBABLE_SOURCE_TYPES).not.toContain('manga-chapter');
  });
});
