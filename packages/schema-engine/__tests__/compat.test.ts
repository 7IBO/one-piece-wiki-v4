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
