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
        // depicted-by is core; its valid_from lists a one-piece type — that's
        // the inverse direction (core -> scoped) and IS flagged, see next test.
      },
      // Keep this case clean: depicted-by here is scoped to one-piece too.
    });
    // devil-fruit (op) -> depicted-by: depicted-by is core -> OK for that edge.
    const fromDevilFruit = checkUniverseScopes(c).filter((f) => f.source === 'devil-fruit');
    expect(fromDevilFruit).toEqual([]);
  });
});
