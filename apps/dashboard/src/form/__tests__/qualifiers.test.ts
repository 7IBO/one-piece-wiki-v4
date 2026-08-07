/**
 * resolveQualifiers derives everything from the qualifier-type
 * registry (ADR-078) — no hardcoded ids or labels.
 */
import type { QualifierTypeSchema } from '@onepiece-wiki/schemas';
import { describe, expect, it } from 'bun:test';
import { type QualifierRegistry, resolveQualifiers } from '../qualifiers';

type Lite = Record<string, unknown>;
function reg(entries: Record<string, Lite>): QualifierRegistry {
  const out: Record<string, QualifierTypeSchema> = {};
  for (const [id, v] of Object.entries(entries)) {
    out[id] = {
      id,
      schema_version: 1,
      multi: false,
      mirrors_entry_value: false,
      ...v,
    } as unknown as QualifierTypeSchema;
  }
  return out;
}

const registry = reg({
  since: {
    kind: 'common',
    order: 1,
    labels: { en: 'Since', fr: 'Depuis' },
    value_type: 'source_ref',
    multi: true,
  },
  source: {
    kind: 'common',
    order: 3,
    labels: { en: 'Source', fr: 'Source' },
    value_type: 'source_ref',
    multi: true,
  },
  given_by: {
    kind: 'common',
    order: 6,
    labels: { en: 'Given by', fr: 'Donné par' },
    value_type: 'entity_ref',
    entity_type_filter: ['character'],
    multi: true,
  },
  epistemic_status: {
    kind: 'base',
    order: 1,
    labels: { en: 'Epistemic status', fr: 'Statut épistémique' },
    descriptions: { en: 'Truth kind.', fr: 'Nature de la vérité.' },
    value_type: 'enum',
    enum_ref: 'epistemic-statuses',
  },
  actual_value: {
    kind: 'base',
    order: 2,
    labels: { en: 'Actual value', fr: 'Valeur réelle' },
    value_type: 'string',
    mirrors_entry_value: true,
  },
});

describe('resolveQualifiers (schema-driven, ADR-078)', () => {
  it('resolves default ids against the registry, localized', () => {
    const { primary } = resolveQualifiers(registry, 'fr', ['given_by'], [], []);
    expect(primary).toHaveLength(1);
    expect(primary[0]).toMatchObject({
      id: 'given_by',
      label: 'Donné par',
      valueType: 'entity_ref',
      entityTypeFilter: ['character'],
      multi: true,
    });
  });

  it('always demotes `source` to secondary and skips pinned ids', () => {
    const { primary, secondary } = resolveQualifiers(
      registry,
      'en',
      ['since', 'source'],
      [],
      ['since'],
    );
    expect(primary).toHaveLength(0);
    expect(secondary.map((q) => q.id)).toContain('source');
    expect(secondary.map((q) => q.id)).not.toContain('since');
  });

  it('appends base qualifiers in registry order with metadata', () => {
    const { secondary } = resolveQualifiers(registry, 'en', [], [], []);
    const ids = secondary.map((q) => q.id);
    expect(ids).toEqual(['epistemic_status', 'actual_value']);
    expect(secondary[0]).toMatchObject({
      enumRef: 'epistemic-statuses',
      description: 'Truth kind.',
    });
    expect(secondary[1]).toMatchObject({ mirrorValueType: true });
  });

  it('prefers registry metadata for lean allowed_qualifiers, schema required wins', () => {
    const { secondary } = resolveQualifiers(
      registry,
      'en',
      [],
      [{ id: 'given_by', value_type: 'entity_ref', required: true }],
      [],
    );
    expect(secondary[0]).toMatchObject({
      id: 'given_by',
      required: true,
      entityTypeFilter: ['character'],
    });
  });

  it('falls back to a humanized label for bespoke declarations', () => {
    const { secondary } = resolveQualifiers(
      registry,
      'en',
      [],
      [{ id: 'issued_by', value_type: 'entity_ref' }],
      [],
    );
    expect(secondary[0]).toMatchObject({ id: 'issued_by', label: 'Issued By' });
  });
});
