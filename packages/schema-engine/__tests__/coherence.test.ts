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
});
