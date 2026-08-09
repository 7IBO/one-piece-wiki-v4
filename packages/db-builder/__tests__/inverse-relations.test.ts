/**
 * Inverse-relation materialization: every stored edge A→B produces a
 * B→A row flagged `is_inferred = 1` carrying the relation type's
 * `inverse` labels — except when the opposite direction is itself
 * stored in the JSON (double-stored symmetric edges), which must not
 * be duplicated. Runs on synthetic fixtures shaped like the corpus.
 */
import type { LoadedEntity, RelationType, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';
import { describe, expect, it } from 'bun:test';
import { extract } from '../src/extract.ts';

function relationType(
  id: string,
  labels: RelationType['labels'],
  inverseInferred: boolean,
): RelationType {
  return {
    id,
    schema_version: 1,
    labels,
    valid_from_types: ['character'],
    valid_to_types: ['character'],
    qualifiers: [],
    allow_multiple_concurrent: true,
    inverse_inferred: inverseInferred,
    historical: false,
  };
}

function catalogue(types: RelationType[]): ValidatedCatalogue {
  return {
    entityTypes: new Map(),
    propertyTypes: new Map(),
    relationTypes: new Map(types.map((t) => [t.id, t])),
    vocabularies: new Map(),
    qualifierTypes: new Map(),
    rules: new Map(),
    errors: [],
  };
}

function loaded(id: string, type: string, data: Record<string, unknown>): LoadedEntity {
  return { id, type, path: `${id}.json`, data };
}

function toMap(entities: LoadedEntity[]): Map<string, LoadedEntity> {
  return new Map(entities.map((e) => [e.id, e]));
}

const memberOf = relationType(
  'member-of',
  {
    en: { active: 'Member of', inverse: 'Members' },
    fr: { active: 'Membre de', inverse: 'Membres' },
  },
  true,
);

const familyOf = relationType(
  'family-of',
  {
    en: { active: 'Family of', inverse: 'Relatives' },
    fr: { active: 'Famille de', inverse: 'Parents' },
  },
  false,
);

describe('extract — inverse materialization', () => {
  const luffy = loaded('character:luffy', 'character', {
    slug: 'luffy',
    schema_version: 1,
    properties: {},
    relations: [
      {
        type: 'member-of',
        target: 'crew:straw-hats',
        qualifiers: { since: 'manga-chapter:1', role: 'captain' },
      },
    ],
  });

  const rows = extract(toMap([luffy]), catalogue([memberOf])).relations;

  it('keeps the stored edge with the active label and is_inferred = 0', () => {
    const stored = rows.find((r) => r.relation_type === 'member-of');
    expect(stored?.source_entity_id).toBe('character:luffy');
    expect(stored?.target_entity_id).toBe('crew:straw-hats');
    expect(stored?.is_inferred).toBe(0);
    expect(stored?.label).toBe(
      JSON.stringify({ en: 'Member of', fr: 'Membre de' }),
    );
  });

  it('materializes the inverse edge with the inverse label and is_inferred = 1', () => {
    const inverse = rows.find((r) => r.relation_type === 'member-of.inverse');
    expect(inverse?.source_entity_id).toBe('crew:straw-hats');
    expect(inverse?.target_entity_id).toBe('character:luffy');
    expect(inverse?.is_inferred).toBe(1);
    expect(inverse?.label).toBe(JSON.stringify({ en: 'Members', fr: 'Membres' }));
  });

  it('preserves the qualifier axes on the inverse edge', () => {
    const inverse = rows.find((r) => r.relation_type === 'member-of.inverse');
    expect(inverse?.since_source).toBe('manga-chapter:1');
    expect(inverse?.qualifiers).toBe(
      JSON.stringify({ since: 'manga-chapter:1', role: 'captain' }),
    );
  });

  it('exactly doubles single-direction edges', () => {
    expect(rows).toHaveLength(2);
  });

  it('materializes inverses for every relation type, not only inverse_inferred ones', () => {
    const ace = loaded('character:ace', 'character', {
      slug: 'ace',
      schema_version: 1,
      properties: {},
      relations: [
        {
          type: 'family-of',
          target: 'character:garp',
          qualifiers: { relation_kind: 'grandchild' },
        },
      ],
    });
    const out = extract(toMap([ace]), catalogue([familyOf])).relations;
    const inverse = out.find((r) => r.relation_type === 'family-of.inverse');
    expect(inverse?.source_entity_id).toBe('character:garp');
    expect(inverse?.is_inferred).toBe(1);
    expect(inverse?.label).toBe(JSON.stringify({ en: 'Relatives', fr: 'Parents' }));
  });
});

describe('extract — object believed_by items ride unchanged (ADR-096)', () => {
  // A mixed believed_by list: one item with per-item provenance
  // (`{ target, source }`), one plain ref. Both the stored edge and
  // the materialized inverse must carry the list byte-identical, in
  // the promoted column AND in the qualifiers JSON blob.
  const believedBy = [
    { target: 'character:luffy', source: 'manga-chapter:585' },
    'character:ace',
  ];
  const sabo = loaded('character:sabo', 'character', {
    slug: 'sabo',
    schema_version: 1,
    properties: {},
    relations: [
      {
        type: 'member-of',
        target: 'crew:revolutionary-army',
        qualifiers: {
          since: 'manga-chapter:585',
          epistemic_status: 'believed_by_characters',
          believed_by: believedBy,
        },
      },
    ],
  });

  const rows = extract(toMap([sabo]), catalogue([memberOf])).relations;
  const stored = rows.find((r) => r.relation_type === 'member-of');
  const inverse = rows.find((r) => r.relation_type === 'member-of.inverse');

  it('round-trips the mixed list on the stored direction', () => {
    expect(stored?.believed_by).toBe(JSON.stringify(believedBy));
    expect(JSON.parse(stored?.believed_by ?? 'null')).toEqual(believedBy);
    expect(JSON.parse(stored?.qualifiers ?? '{}')['believed_by']).toEqual(believedBy);
  });

  it('round-trips the mixed list on the materialized inverse direction', () => {
    expect(inverse?.is_inferred).toBe(1);
    expect(inverse?.source_entity_id).toBe('crew:revolutionary-army');
    expect(inverse?.target_entity_id).toBe('character:sabo');
    expect(JSON.parse(inverse?.believed_by ?? 'null')).toEqual(believedBy);
    expect(JSON.parse(inverse?.qualifiers ?? '{}')['believed_by']).toEqual(believedBy);
    expect(inverse?.epistemic_status).toBe('believed_by_characters');
  });
});

describe('extract — dedup of double-stored symmetric edges', () => {
  const ace = loaded('character:ace', 'character', {
    slug: 'ace',
    schema_version: 1,
    properties: {},
    relations: [
      {
        type: 'family-of',
        target: 'character:luffy',
        qualifiers: { relation_kind: 'sworn_brother' },
      },
    ],
  });
  const luffy = loaded('character:luffy', 'character', {
    slug: 'luffy',
    schema_version: 1,
    properties: {},
    relations: [
      {
        type: 'family-of',
        target: 'character:ace',
        qualifiers: { relation_kind: 'sworn_brother' },
      },
    ],
  });

  const rows = extract(toMap([ace, luffy]), catalogue([familyOf])).relations;

  it('does not add inferred copies when both directions are stored', () => {
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.is_inferred === 0)).toBe(true);
    expect(rows.some((r) => r.relation_type === 'family-of.inverse')).toBe(false);
  });

  it('keeps both stored directions', () => {
    const sources = rows.map((r) => r.source_entity_id).sort();
    expect(sources).toEqual(['character:ace', 'character:luffy']);
  });
});
