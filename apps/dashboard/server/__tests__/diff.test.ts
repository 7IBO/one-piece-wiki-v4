/**
 * Server-side structured diff for the admin queue detail (W-B slice 2).
 */
import { describe, expect, it } from 'bun:test';
import { classifyDataPath, diffEntityFile, diffTranslationFile } from '../diff.ts';

describe('diffEntityFile', () => {
  const before = {
    id: 'character:buggy',
    properties: { bounty: [{ value: 15_000_000 }], name: [{ value_key: 'k' }] },
    relations: [
      { type: 'member-of', target: 'crew:buggy-pirates' },
    ],
  };
  const after = {
    id: 'character:buggy',
    properties: {
      bounty: [{ value: 15_000_000 }, { value: 3_189_000_000 }],
      name: [{ value_key: 'k' }],
    },
    relations: [
      { type: 'member-of', target: 'crew:buggy-pirates' },
      { type: 'member-of', target: 'organization:cross-guild' },
    ],
  };

  it('reports only changed properties and relation deltas', () => {
    const d = diffEntityFile(
      'data/universes/one-piece/entities/character/buggy.json',
      before,
      after,
    );
    expect(d.kind).toBe('modified');
    expect(d.entityId).toBe('character:buggy');
    expect(d.properties.map((p) => p.id)).toEqual(['bounty']);
    expect(d.relations).toEqual([
      { type: 'member-of', added: ['organization:cross-guild'], removed: [] },
    ]);
  });

  it('classifies added/removed files', () => {
    expect(diffEntityFile('p', null, after).kind).toBe('added');
    expect(diffEntityFile('p', before, null).kind).toBe('removed');
  });
});

describe('diffTranslationFile', () => {
  it('reports changed keys with before/after', () => {
    const d = diffTranslationFile('p', 'en', { a: '1', b: 'x' }, { a: '2', c: 'y' });
    const byKey = Object.fromEntries(d.changed.map((c) => [c.key, c]));
    expect(byKey['a']).toMatchObject({ before: '1', after: '2' });
    expect(byKey['b']).toMatchObject({ before: 'x', after: null });
    expect(byKey['c']).toMatchObject({ before: null, after: 'y' });
  });
});

describe('classifyDataPath', () => {
  it('recognises entity, translation and other paths', () => {
    expect(
      classifyDataPath('data/universes/one-piece/entities/character/buggy.json'),
    ).toEqual({ kind: 'entity' });
    expect(
      classifyDataPath('data/universes/one-piece/translations/fr/character/buggy.json'),
    ).toEqual({ kind: 'translation', locale: 'fr' });
    expect(classifyDataPath('data/schemas/entity-types/character.json')).toEqual({
      kind: 'other',
    });
  });
});
