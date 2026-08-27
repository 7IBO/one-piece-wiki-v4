/**
 * Tests for the schema-compatibility classifier (ADR-042). Exercises
 * diffContract directly with hand-built contracts so each additive/breaking
 * rule is isolated.
 */
import { describe, expect, it } from 'bun:test';
import { diffContract, type SchemaContract } from '../src/compat.ts';

type Mutable = {
  entityTypes: Record<
    string,
    { properties: Record<string, { required: boolean; }>; allowed_relations: string[]; }
  >;
  propertyTypes: Record<
    string,
    { value_type: string; enum_ref: string | null; historical: boolean; localizable: boolean; }
  >;
  relationTypes: Record<string, {
    valid_from_types: string[];
    valid_to_types: string[];
    inverse_inferred: boolean;
    qualifiers: Record<string, { value_type: string; enum_ref: string | null; required: boolean; }>;
  }>;
  vocabularies: Record<string, string[]>;
};

const base: SchemaContract = {
  entityTypes: {
    character: {
      properties: { name: { required: true }, bounty: { required: false } },
      allowed_relations: ['ate-fruit'],
    },
  },
  propertyTypes: {
    bounty: { value_type: 'number', enum_ref: null, historical: true, localizable: false },
    classification: {
      value_type: 'enum',
      enum_ref: 'devil-fruit-classifications',
      historical: true,
      localizable: false,
    },
  },
  relationTypes: {
    'ate-fruit': {
      valid_from_types: ['character'],
      valid_to_types: ['devil-fruit'],
      inverse_inferred: true,
      qualifiers: { since: { value_type: 'source_ref', enum_ref: null, required: false } },
    },
  },
  vocabularies: { 'haki-types': ['armament', 'observation'] },
};

const clone = (): Mutable => structuredClone(base) as Mutable;

describe('diffContract', () => {
  it('reports nothing for identical contracts', () => {
    expect(diffContract(base, clone())).toEqual([]);
  });

  it('classifies additive changes as additive', () => {
    const next = clone();
    next.vocabularies['haki-types'] = ['armament', 'conqueror', 'observation'];
    next.entityTypes.character!.properties.age = { required: false };
    next.propertyTypes.age = {
      value_type: 'number',
      enum_ref: null,
      historical: true,
      localizable: false,
    };
    const findings = diffContract(base, next);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.kind === 'additive')).toBe(true);
  });

  it('flags a removed vocabulary value as breaking', () => {
    const next = clone();
    next.vocabularies['haki-types'] = ['observation'];
    const breaking = diffContract(base, next).filter((f) => f.kind === 'breaking');
    expect(breaking.some((f) => f.message.includes('armament'))).toBe(true);
  });

  it('flags a value_type change as breaking', () => {
    const next = clone();
    next.propertyTypes.bounty!.value_type = 'string';
    const breaking = diffContract(base, next).filter((f) => f.kind === 'breaking');
    expect(breaking.some((f) => f.message.includes('value_type'))).toBe(true);
  });

  it('flags a newly-required property as breaking', () => {
    const next = clone();
    next.entityTypes.character!.properties.gender = { required: true };
    const findings = diffContract(base, next);
    expect(findings.some((f) => f.kind === 'breaking' && f.message.includes('gender'))).toBe(true);
  });

  it('flags a narrowed relation endpoint as breaking', () => {
    const next = clone();
    next.relationTypes['ate-fruit']!.valid_from_types = [];
    const breaking = diffContract(base, next).filter((f) => f.kind === 'breaking');
    expect(breaking.some((f) => f.message.includes('valid_from_types removed'))).toBe(true);
  });

  it('flags a removed entity-type property as breaking', () => {
    const next = clone();
    delete next.entityTypes.character!.properties.bounty;
    const breaking = diffContract(base, next).filter((f) => f.kind === 'breaking');
    expect(breaking.some((f) => f.message.includes('property removed'))).toBe(true);
  });
});

/**
 * Bounds in the lockfile (ADR-117). Before this, the snapshot recorded
 * `value_type` but never `value_constraints`, so a bound could move in
 * either direction and CI still reported "matches the snapshot" — the
 * type was locked, the bound was not. The rule mirrors the one applied
 * everywhere else in this classifier, read as "what used to validate and
 * no longer does": tightening breaks, widening does not.
 */
describe('diffContract — property bounds', () => {
  const bounded = (
    constraints: {
      min?: number | null;
      max?: number | null;
      step?: number | null;
      pattern?: string | null;
    } | undefined,
  ): SchemaContract => ({
    entityTypes: {},
    relationTypes: {},
    vocabularies: {},
    propertyTypes: {
      number: {
        value_type: 'number',
        enum_ref: null,
        historical: false,
        localizable: false,
        ...(constraints === undefined ? {} : {
          constraints: {
            min: constraints.min ?? null,
            max: constraints.max ?? null,
            step: constraints.step ?? null,
            pattern: constraints.pattern ?? null,
          },
        }),
      },
    },
  });

  const kinds = (prev: SchemaContract, next: SchemaContract): string[] =>
    diffContract(prev, next).map((f) => f.kind);

  it('treats a raised min as breaking and a lowered one as additive', () => {
    expect(kinds(bounded({ min: 0 }), bounded({ min: 1 }))).toEqual(['breaking']);
    expect(kinds(bounded({ min: 1 }), bounded({ min: 0 }))).toEqual(['additive']);
  });

  it('treats introducing a bound as breaking and dropping one as additive', () => {
    // No bound -> a bound can invalidate rows that were legal before.
    expect(kinds(bounded({}), bounded({ min: 1 }))).toEqual(['breaking']);
    expect(kinds(bounded({}), bounded({ max: 10 }))).toEqual(['breaking']);
    expect(kinds(bounded({ min: 1 }), bounded({}))).toEqual(['additive']);
  });

  it('mirrors the rule for max — lower is stricter', () => {
    expect(kinds(bounded({ max: 100 }), bounded({ max: 10 }))).toEqual(['breaking']);
    expect(kinds(bounded({ max: 10 }), bounded({ max: 100 }))).toEqual(['additive']);
  });

  it('only calls a step change additive when the new step divides the old', () => {
    // 2 -> 1 admits everything step 2 did, and more.
    expect(kinds(bounded({ step: 2 }), bounded({ step: 1 }))).toEqual(['additive']);
    // 1 -> 2 drops every odd value.
    expect(kinds(bounded({ step: 1 }), bounded({ step: 2 }))).toEqual(['breaking']);
    // 3 -> 2 is not a widening even though it is smaller: 3 no longer validates.
    expect(kinds(bounded({ step: 3 }), bounded({ step: 2 }))).toEqual(['breaking']);
  });

  it('calls any live pattern change breaking, since regex subsumption is not tested', () => {
    expect(kinds(bounded({ pattern: '^a+$' }), bounded({ pattern: '^a*$' }))).toEqual(['breaking']);
    expect(kinds(bounded({ pattern: '^a+$' }), bounded({}))).toEqual(['additive']);
  });

  it('stays silent against a pre-ADR-117 snapshot that carries no bounds', () => {
    // Reporting "none -> 0" for every bounded property would render the
    // migration itself as a wall of breaking changes. The regeneration
    // establishes the baseline; the next run compares for real.
    expect(kinds(bounded(undefined), bounded({ min: 0, step: 1 }))).toEqual([]);
  });

  it('reports nothing when the bounds are unchanged', () => {
    expect(kinds(bounded({ min: 0, step: 1 }), bounded({ min: 0, step: 1 }))).toEqual([]);
  });
});
