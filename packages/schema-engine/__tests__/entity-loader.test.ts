import { describe, expect, test } from 'bun:test';
import { buildEntitySchema } from '../src/entity-loader.ts';
import type { ValidatedCatalogue } from '../src/meta-validator.ts';

// Minimal hand-built catalogue (cast for brevity, like coherence.test.ts).
// One entity type `widget` with an enum property (`color` → `colors`
// vocab) and a constrained number property (`count`, 0..10).
function catalogue(): ValidatedCatalogue {
  return {
    entityTypes: new Map([[
      'widget',
      {
        id: 'widget',
        schema_version: 1,
        labels: { en: 'Widget', fr: 'Widget' },
        properties: [
          { id: 'color', required: false },
          { id: 'count', required: false },
        ],
        allowed_relations: [],
        display_name_properties: [],
      },
    ]]),
    propertyTypes: new Map([
      [
        'color',
        {
          id: 'color',
          schema_version: 1,
          labels: { en: 'Color', fr: 'Couleur' },
          value_type: 'enum',
          historical: false,
          localizable: false,
          value_constraints: { enum_ref: 'colors' },
          default_qualifiers: [],
          allowed_qualifiers: [],
        },
      ],
      [
        'count',
        {
          id: 'count',
          schema_version: 1,
          labels: { en: 'Count', fr: 'Nombre' },
          value_type: 'number',
          historical: false,
          localizable: false,
          value_constraints: { min: 0, max: 10 },
          default_qualifiers: [],
          allowed_qualifiers: [],
        },
      ],
    ]),
    relationTypes: new Map(),
    vocabularies: new Map([[
      'colors',
      {
        id: 'colors',
        schema_version: 1,
        values: {
          red: { labels: { en: 'Red', fr: 'Rouge' } },
          blue: { labels: { en: 'Blue', fr: 'Bleu' } },
        },
      },
    ]]),
    errors: [],
  } as unknown as ValidatedCatalogue;
}

const base = { id: 'widget:x', type: 'widget', schema_version: 1, slug: 'x' };

describe('buildEntitySchema strictness', () => {
  test('accepts a valid enum value', () => {
    const schema = buildEntitySchema('widget', catalogue())!;
    expect(schema.safeParse({ ...base, properties: { color: { value: 'red' } } }).success)
      .toBe(true);
  });

  test('rejects an unknown enum value', () => {
    const schema = buildEntitySchema('widget', catalogue())!;
    expect(schema.safeParse({ ...base, properties: { color: { value: 'mauve' } } }).success)
      .toBe(false);
  });

  test('enforces numeric value_constraints', () => {
    const schema = buildEntitySchema('widget', catalogue())!;
    expect(schema.safeParse({ ...base, properties: { count: { value: 5 } } }).success).toBe(true);
    expect(schema.safeParse({ ...base, properties: { count: { value: 99 } } }).success).toBe(false);
    expect(schema.safeParse({ ...base, properties: { count: { value: -1 } } }).success).toBe(false);
  });

  test('returns undefined for an unknown entity type', () => {
    expect(buildEntitySchema('nope', catalogue())).toBeUndefined();
  });
});
