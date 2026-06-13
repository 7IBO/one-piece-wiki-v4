/**
 * Tests for the cross-entity coherence checker. Builds a tiny in-memory
 * catalogue + entity map so each rule is exercised in isolation, without
 * touching /data.
 */
import { describe, expect, it } from 'bun:test';
import { checkCoherence, checkSchemaCoherence } from '../src/coherence.ts';
import type { LoadedEntity } from '../src/entity-loader.ts';
import type { ValidatedCatalogue } from '../src/meta-validator.ts';

type EntityTypeLite = {
  allowed_relations: readonly string[];
};
type RelationTypeLite = {
  valid_from_types: readonly string[];
  valid_to_types: readonly string[];
  qualifiers: readonly { id: string; required: boolean; }[];
};

function catalogue(
  entityTypes: Record<string, EntityTypeLite>,
  relationTypes: Record<string, RelationTypeLite>,
): ValidatedCatalogue {
  return {
    entityTypes: new Map(Object.entries(entityTypes)) as ValidatedCatalogue['entityTypes'],
    relationTypes: new Map(Object.entries(relationTypes)) as ValidatedCatalogue['relationTypes'],
    propertyTypes: new Map(),
    vocabularies: new Map(),
    errors: [],
  };
}

function entity(id: string, relations: unknown[] = []): LoadedEntity {
  const [type] = id.split(':');
  return { id, type: type ?? '', path: `${id}.json`, data: { id, type, relations } };
}

function entityMap(...entities: LoadedEntity[]): Map<string, LoadedEntity> {
  return new Map(entities.map((e) => [e.id, e]));
}

const baseCatalogue = catalogue(
  {
    character: { allowed_relations: ['depicted-by'] },
    image: { allowed_relations: ['depicts'] },
  },
  {
    'depicted-by': {
      valid_from_types: ['character'],
      valid_to_types: ['image'],
      qualifiers: [{ id: 'role', required: true }],
    },
  },
);

describe('checkCoherence — relation rules', () => {
  it('accepts a schema-compliant relation', () => {
    const entities = entityMap(
      entity('character:luffy', [
        { type: 'depicted-by', target: 'image:luffy', qualifiers: { role: 'primary_portrait' } },
      ]),
      entity('image:luffy'),
    );
    expect(checkCoherence(entities, baseCatalogue).filter((f) => f.severity === 'error')).toEqual(
      [],
    );
  });

  it('flags an unknown relation type', () => {
    const entities = entityMap(entity('character:luffy', [{ type: 'frobnicates', target: 'x:y' }]));
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('UNKNOWN_RELATION_TYPE');
  });

  it('flags a relation not in the source type allowed_relations', () => {
    // image's allowed_relations is ['depicts'] — depicted-by is not allowed there.
    const entities = entityMap(
      entity('image:x', [
        { type: 'depicted-by', target: 'character:luffy', qualifiers: { role: 'x' } },
      ]),
      entity('character:luffy'),
    );
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('RELATION_NOT_ALLOWED');
    expect(codes).toContain('RELATION_INVALID_SOURCE_TYPE');
  });

  it('flags an invalid target type', () => {
    const entities = entityMap(
      entity('character:luffy', [
        { type: 'depicted-by', target: 'character:zoro', qualifiers: { role: 'x' } },
      ]),
      entity('character:zoro'),
    );
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('RELATION_INVALID_TARGET_TYPE');
  });

  it('flags a missing required qualifier', () => {
    const entities = entityMap(
      entity('character:luffy', [{ type: 'depicted-by', target: 'image:luffy' }]),
      entity('image:luffy'),
    );
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('RELATION_MISSING_REQUIRED_QUALIFIER');
  });
});

describe('checkCoherence — unreferenced warning', () => {
  it('warns about an entity nothing points at', () => {
    const entities = entityMap(
      entity('character:luffy', [
        { type: 'depicted-by', target: 'image:luffy', qualifiers: { role: 'x' } },
      ]),
      entity('image:luffy'),
    );
    const warnings = checkCoherence(entities, baseCatalogue).filter((f) =>
      f.severity === 'warning'
    );
    // image:luffy is referenced; character:luffy is not.
    expect(warnings.map((w) => w.source)).toContain('character:luffy');
    expect(warnings.map((w) => w.source)).not.toContain('image:luffy');
  });

  it('counts since/source axis refs as references', () => {
    const entities = entityMap(
      entity('character:luffy', [
        { type: 'depicted-by', target: 'image:luffy', qualifiers: { role: 'x' } },
      ]),
      entity('image:luffy'),
    );
    // Add a property axis ref to character:luffy from image:luffy's side.
    (entities.get('image:luffy') as LoadedEntity).data['properties'] = {
      spoiler_since: { value: 'manga-chapter:1', since: 'character:luffy' },
    };
    const warnings = checkCoherence(entities, baseCatalogue).filter((f) =>
      f.severity === 'warning'
    );
    expect(warnings.map((w) => w.source)).not.toContain('character:luffy');
  });

  it('counts relation epistemic axes (revealed_since / known_truth_by) as references', () => {
    const entities = entityMap(
      entity('character:luffy', [
        {
          type: 'depicted-by',
          target: 'image:luffy',
          qualifiers: {
            role: 'x',
            revealed_since: 'manga-chapter:1',
            known_truth_by: ['character:dragon'],
          },
        },
      ]),
      entity('image:luffy'),
      entity('manga-chapter:1'),
      entity('character:dragon'),
    );
    const unreferenced = checkCoherence(entities, baseCatalogue)
      .filter((f) => f.severity === 'warning')
      .map((w) => w.source);
    expect(unreferenced).not.toContain('manga-chapter:1');
    expect(unreferenced).not.toContain('character:dragon');
  });
});

describe('checkSchemaCoherence', () => {
  it('passes a self-consistent catalogue', () => {
    const cat = catalogue(
      { character: { allowed_relations: ['depicted-by'] }, image: { allowed_relations: [] } },
      {
        'depicted-by': {
          valid_from_types: ['character'],
          valid_to_types: ['image'],
          qualifiers: [],
        },
      },
    );
    expect(checkSchemaCoherence(cat)).toEqual([]);
  });

  it('flags an allowed relation that does not exist', () => {
    const cat = catalogue(
      { character: { allowed_relations: ['ghost-relation'] } },
      {},
    );
    const codes = checkSchemaCoherence(cat).map((f) => f.code);
    expect(codes).toContain('SCHEMA_ALLOWED_RELATION_UNKNOWN');
  });

  it('flags an allowed relation whose valid_from_types excludes the type', () => {
    // image allows depicts (valid_from must include image); but here we
    // make image allow depicted-by, whose valid_from is [character] only.
    const cat = catalogue(
      { image: { allowed_relations: ['depicted-by'] } },
      {
        'depicted-by': {
          valid_from_types: ['character'],
          valid_to_types: ['image'],
          qualifiers: [],
        },
      },
    );
    const codes = checkSchemaCoherence(cat).map((f) => f.code);
    expect(codes).toContain('SCHEMA_ALLOWED_RELATION_INVALID_SOURCE');
  });

  it('flags a relation type that re-declares a base qualifier (ADR-037)', () => {
    const cat = catalogue(
      { character: { allowed_relations: ['ally-of'] } },
      {
        'ally-of': {
          valid_from_types: ['character'],
          valid_to_types: ['character'],
          qualifiers: [
            { id: 'since', required: false },
            { id: 'epistemic_status', required: false },
          ],
        },
      },
    );
    const findings = checkSchemaCoherence(cat).filter(
      (f) => f.code === 'RELATION_DECLARES_BASE_QUALIFIER',
    );
    expect(findings.map((f) => f.source)).toContain('ally-of');
  });

  it('does not flag relation-type-declared since/until/source/role', () => {
    const cat = catalogue(
      { character: { allowed_relations: ['member-of'] } },
      {
        'member-of': {
          valid_from_types: ['character'],
          valid_to_types: ['character'],
          qualifiers: [
            { id: 'since', required: true },
            { id: 'until', required: false },
            { id: 'role', required: true },
          ],
        },
      },
    );
    const codes = checkSchemaCoherence(cat).map((f) => f.code);
    expect(codes).not.toContain('RELATION_DECLARES_BASE_QUALIFIER');
  });
});

describe('checkCoherence — duplicate detection', () => {
  it('flags an exact-duplicate relation', () => {
    const dup = {
      type: 'depicted-by',
      target: 'image:luffy',
      qualifiers: { role: 'primary_portrait' },
    };
    const entities = entityMap(
      entity('character:luffy', [dup, { ...dup, qualifiers: { ...dup.qualifiers } }]),
      entity('image:luffy'),
    );
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('DUPLICATE_RELATION');
  });

  it('does NOT flag historised re-relations (same type+target, different since)', () => {
    const entities = entityMap(
      entity('character:luffy', [
        {
          type: 'depicted-by',
          target: 'image:luffy',
          qualifiers: { role: 'x', since: 'manga-chapter:1', until: 'manga-chapter:100' },
        },
        {
          type: 'depicted-by',
          target: 'image:luffy',
          qualifiers: { role: 'x', since: 'manga-chapter:200' },
        },
      ]),
      entity('image:luffy'),
    );
    const dupes = checkCoherence(entities, baseCatalogue).filter((f) =>
      f.code === 'DUPLICATE_RELATION'
    );
    expect(dupes).toEqual([]);
  });

  it('flags an exact-duplicate property entry regardless of key order', () => {
    const entities = entityMap(entity('character:luffy', []));
    (entities.get('character:luffy') as LoadedEntity).data['properties'] = {
      status: [
        { value: 'alive', since: 'manga-chapter:1' },
        { since: 'manga-chapter:1', value: 'alive' },
      ],
    };
    const codes = checkCoherence(entities, baseCatalogue).map((f) => f.code);
    expect(codes).toContain('DUPLICATE_PROPERTY_VALUE');
  });
});
