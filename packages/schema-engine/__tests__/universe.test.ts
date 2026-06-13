/**
 * Tests for universe-scoped schemas (ADR-035): forUniverse filtering and
 * the cross-universe scope-leak guard. Builds tiny in-memory catalogues.
 */
import { describe, expect, it } from 'bun:test';
import type { ValidatedCatalogue } from '../src/meta-validator.ts';
import { checkUniverseScopes, forUniverse } from '../src/universe.ts';

type Lite = Record<string, unknown>;

function cat(parts: {
  entityTypes?: Record<string, Lite>;
  propertyTypes?: Record<string, Lite>;
  relationTypes?: Record<string, Lite>;
  vocabularies?: Record<string, Lite>;
}): ValidatedCatalogue {
  const m = (o: Record<string, Lite> = {}) => new Map(Object.entries(o));
  return {
    entityTypes: m(parts.entityTypes) as ValidatedCatalogue['entityTypes'],
    propertyTypes: m(parts.propertyTypes) as ValidatedCatalogue['propertyTypes'],
    relationTypes: m(parts.relationTypes) as ValidatedCatalogue['relationTypes'],
    vocabularies: m(parts.vocabularies) as ValidatedCatalogue['vocabularies'],
    errors: [],
  };
}

describe('forUniverse', () => {
  const catalogue = cat({
    entityTypes: {
      character: { allowed_relations: [], properties: [] }, // core
      'devil-fruit': { universes: ['one-piece'], allowed_relations: [], properties: [] },
      jutsu: { universes: ['naruto'], allowed_relations: [], properties: [] },
    },
  });

  it('includes core + the universe, excludes other universes', () => {
    const op = forUniverse(catalogue, 'one-piece');
    expect([...op.entityTypes.keys()].sort()).toEqual(['character', 'devil-fruit']);

    const naruto = forUniverse(catalogue, 'naruto');
    expect([...naruto.entityTypes.keys()].sort()).toEqual(['character', 'jutsu']);
  });

  it('treats empty universes[] as core', () => {
    const c = cat({ entityTypes: { x: { universes: [], allowed_relations: [], properties: [] } } });
    expect(forUniverse(c, 'anything').entityTypes.has('x')).toBe(true);
  });

  it('filters relation endpoints to entity types present in the universe (ADR-048)', () => {
    const c = cat({
      entityTypes: {
        character: { allowed_relations: [], properties: [] }, // core
        jutsu: { universes: ['naruto'], allowed_relations: [], properties: [] },
      },
      relationTypes: {
        // a core, universal relation whose valid_from lists a naruto-only type
        'depicted-by': {
          valid_from_types: ['character', 'jutsu'],
          valid_to_types: [],
          qualifiers: [],
        },
      },
    });
    expect(forUniverse(c, 'one-piece').relationTypes.get('depicted-by')?.valid_from_types)
      .toEqual(['character']); // jutsu (naruto-only) filtered out
    expect(forUniverse(c, 'naruto').relationTypes.get('depicted-by')?.valid_from_types)
      .toEqual(['character', 'jutsu']);
  });

  it('filters property applies_to to entity types present in the universe (ADR-048)', () => {
    const c = cat({
      entityTypes: {
        character: { allowed_relations: [], properties: [] }, // core
        jutsu: { universes: ['naruto'], allowed_relations: [], properties: [] },
      },
      propertyTypes: { name: { applies_to_entity_types: ['character', 'jutsu'] } },
    });
    expect(forUniverse(c, 'one-piece').propertyTypes.get('name')?.applies_to_entity_types)
      .toEqual(['character']);
  });
});

describe('checkUniverseScopes', () => {
  it('passes when everything is core', () => {
    const c = cat({
      entityTypes: { character: { allowed_relations: ['ally-of'], properties: [] } },
      relationTypes: {
        'ally-of': {
          valid_from_types: ['character'],
          valid_to_types: ['character'],
          qualifiers: [],
        },
      },
    });
    expect(checkUniverseScopes(c)).toEqual([]);
  });

  it('flags a core schema referencing a universe-scoped one', () => {
    // core character lists a one-piece-only property -> would dangle elsewhere.
    const c = cat({
      entityTypes: {
        character: {
          allowed_relations: [],
          properties: [{ id: 'bounty' }],
        },
      },
      propertyTypes: { bounty: { universes: ['one-piece'] } },
    });
    const codes = checkUniverseScopes(c).map((f) => f.code);
    expect(codes).toContain('SCHEMA_UNIVERSE_SCOPE_LEAK');
  });

  it('allows a universe-scoped schema to reference core', () => {
    // one-piece devil-fruit referencing a core relation is fine.
    const c = cat({
      entityTypes: {
        'devil-fruit': {
          universes: ['one-piece'],
          allowed_relations: ['depicted-by'],
          properties: [],
        },
      },
      relationTypes: {
        'depicted-by': {
          valid_from_types: ['devil-fruit'],
          valid_to_types: ['image'],
          qualifiers: [],
        },
      },
    });
    // devil-fruit (op) -> depicted-by: depicted-by is core -> OK for that edge.
    const fromDevilFruit = checkUniverseScopes(c).filter((f) => f.source === 'devil-fruit');
    expect(fromDevilFruit).toEqual([]);
  });

  it('does not flag a core relation/property that only APPLIES to a scoped type (ADR-048)', () => {
    // applicability lists (valid_from/valid_to, applies_to) are not dependencies;
    // forUniverse filters them, so a core schema may list a one-piece type.
    const c = cat({
      entityTypes: {
        'devil-fruit': { universes: ['one-piece'], allowed_relations: [], properties: [] },
      },
      relationTypes: {
        'depicted-by': {
          valid_from_types: ['devil-fruit'],
          valid_to_types: ['image'],
          qualifiers: [],
        },
      },
      propertyTypes: { name: { applies_to_entity_types: ['devil-fruit'] } },
    });
    expect(checkUniverseScopes(c)).toEqual([]);
  });
});
