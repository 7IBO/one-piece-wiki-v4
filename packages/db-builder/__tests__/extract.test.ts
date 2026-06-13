/**
 * Unit tests for the pure row extractor. These use synthetic entities
 * rather than the /data seed corpus because the seed does not yet
 * exercise `features` appearances or `canon_scope` sources (those
 * arrive with the Phase 3.5 ingest). The logic must be correct before
 * the data lands, so it is proven here against fabricated fixtures.
 */
import type { LoadedEntity, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';
import { describe, expect, it } from 'bun:test';
import { extract } from '../src/extract.ts';

const emptyCatalogue: ValidatedCatalogue = {
  entityTypes: new Map(),
  propertyTypes: new Map(),
  relationTypes: new Map(),
  vocabularies: new Map(),
  errors: [],
};

function loaded(id: string, type: string, data: Record<string, unknown>): LoadedEntity {
  return { id, type, path: `${id}.json`, data };
}

function toMap(entities: LoadedEntity[]): Map<string, LoadedEntity> {
  return new Map(entities.map((e) => [e.id, e]));
}

describe('extract — derived fields', () => {
  const chapter1 = loaded('manga-chapter:1', 'manga-chapter', {
    slug: 'chapter-1',
    schema_version: 1,
    properties: { canon_scope: [{ value: 'manga', since: 'manga-chapter:1' }] },
    relations: [
      { type: 'features', target: 'character:test', qualifiers: { appearance_type: 'full' } },
    ],
  });
  const chapter5 = loaded('manga-chapter:5', 'manga-chapter', {
    slug: 'chapter-5',
    schema_version: 1,
    properties: { canon_scope: [{ value: 'manga', since: 'manga-chapter:5' }] },
    relations: [
      { type: 'features', target: 'character:test', qualifiers: { appearance_type: 'flashback' } },
    ],
  });
  const character = loaded('character:test', 'character', {
    slug: 'test',
    schema_version: 1,
    properties: { name: [{ value_key: 'character.test.name', since: 'manga-chapter:1' }] },
    relations: [],
  });

  const rows = extract(toMap([chapter1, chapter5, character]), emptyCatalogue);

  it('marks the earliest appearance per entity as is_first', () => {
    const testAppearances = rows.appearances.filter((a) => a.entity_id === 'character:test');
    expect(testAppearances).toHaveLength(2);

    const first = testAppearances.find((a) => a.source_id === 'manga-chapter:1');
    const later = testAppearances.find((a) => a.source_id === 'manga-chapter:5');
    expect(first?.is_first).toBe(1);
    expect(later?.is_first).toBe(0);
  });

  it('derives primary_canon_scope from the first-appearance source', () => {
    const character = rows.entities.find((e) => e.id === 'character:test');
    expect(character?.first_appearance_source).toBe('manga-chapter:1');
    expect(character?.primary_canon_scope).toBe('manga');
  });

  it('resolves a source entity to its own declared canon scope', () => {
    const chapter = rows.entities.find((e) => e.id === 'manga-chapter:1');
    expect(chapter?.primary_canon_scope).toBe('manga');
  });

  it('leaves primary_canon_scope null when the source declares none', () => {
    const noScope = loaded('character:orphan', 'character', {
      slug: 'orphan',
      schema_version: 1,
      properties: { name: [{ value_key: 'character.orphan.name', since: 'manga-chapter:999' }] },
      relations: [],
    });
    const out = extract(toMap([noScope]), emptyCatalogue);
    const row = out.entities.find((e) => e.id === 'character:orphan');
    // first_appearance_source points at manga-chapter:999, which is not in
    // the map, so the scope cannot be resolved and stays null.
    expect(row?.primary_canon_scope).toBeNull();
  });
});

describe('extract — relation base qualifiers (ADR-037)', () => {
  const catalogueWithAlly: ValidatedCatalogue = {
    entityTypes: new Map(),
    propertyTypes: new Map(),
    relationTypes: new Map([['ally-of', {
      inverse_inferred: true,
    }]]) as ValidatedCatalogue['relationTypes'],
    vocabularies: new Map(),
    errors: [],
  };

  const dragon = loaded('character:dragon', 'character', {
    slug: 'dragon',
    schema_version: 1,
    properties: {},
    relations: [
      {
        type: 'ally-of',
        target: 'organization:revolutionary-army',
        qualifiers: {
          since: 'manga-chapter:1',
          epistemic_status: 'believed_by_characters',
          believed_by: ['character:sabo'],
          known_truth_by: ['character:dragon', 'character:ivankov'],
          revealed_since: 'manga-chapter:593',
        },
      },
    ],
  });

  const rows = extract(toMap([dragon]), catalogueWithAlly);
  const canonical = rows.relations.find(
    (r) => r.relation_type === 'ally-of' && r.source_entity_id === 'character:dragon',
  );
  const inverse = rows.relations.find((r) => r.relation_type === 'ally-of.inverse');

  it('promotes the epistemic axis to columns on the authored edge', () => {
    expect(canonical?.epistemic_status).toBe('believed_by_characters');
    expect(canonical?.revealed_since).toBe('manga-chapter:593');
    expect(canonical?.believed_by).toBe(JSON.stringify(['character:sabo']));
    expect(canonical?.known_truth_by).toBe(
      JSON.stringify(['character:dragon', 'character:ivankov']),
    );
  });

  it('mirrors the epistemic axis onto the generated inverse edge', () => {
    expect(inverse?.source_entity_id).toBe('organization:revolutionary-army');
    expect(inverse?.epistemic_status).toBe('believed_by_characters');
    expect(inverse?.revealed_since).toBe('manga-chapter:593');
    expect(inverse?.known_truth_by).toBe(
      JSON.stringify(['character:dragon', 'character:ivankov']),
    );
  });

  it('defaults epistemic_status to "true" and leaves arrays null when absent', () => {
    const plain = loaded('character:zoro', 'character', {
      slug: 'zoro',
      schema_version: 1,
      properties: {},
      relations: [
        { type: 'ally-of', target: 'character:luffy', qualifiers: { since: 'manga-chapter:1' } },
      ],
    });
    const out = extract(toMap([plain]), catalogueWithAlly);
    const row = out.relations.find(
      (r) => r.relation_type === 'ally-of' && r.source_entity_id === 'character:zoro',
    );
    expect(row?.epistemic_status).toBe('true');
    expect(row?.believed_by).toBeNull();
    expect(row?.revealed_since).toBeNull();
  });
});
