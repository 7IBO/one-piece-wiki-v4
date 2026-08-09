import { describe, expect, test } from 'bun:test';
import {
  buildEntitySchema,
  type LoadedEntity,
  resolveEntityReferences,
} from '../src/entity-loader.ts';
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
    qualifierTypes: new Map(),
    rules: new Map(),
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

// ADR-096 — believed_by / known_truth_by items accept a plain EntityId
// or `{ target, source? }`, on property entries AND relation bags.
describe('entity-ref-item lists (ADR-096)', () => {
  const schema = buildEntitySchema('widget', catalogue())!;

  test('accepts plain, object and mixed items on a property entry', () => {
    const parsed = schema.safeParse({
      ...base,
      properties: {
        color: {
          value: 'red',
          believed_by: [
            'character:ace',
            { target: 'character:luffy', source: 'manga-chapter:585' },
            { target: 'character:nami', source: ['manga-chapter:585', 'anime-episode:504'] },
          ],
          known_truth_by: [{ target: 'character:sabo' }],
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  test('accepts both forms inside a relation qualifier bag', () => {
    const parsed = schema.safeParse({
      ...base,
      properties: {},
      relations: [{
        type: 'knows',
        target: 'widget:y',
        qualifiers: {
          believed_by: [
            { target: 'character:luffy', source: 'manga-chapter:585' },
            'character:ace',
          ],
        },
      }],
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects malformed items', () => {
    const entry = (believed_by: unknown): unknown => ({
      ...base,
      properties: { color: { value: 'red', believed_by } },
    });
    // Object without a target.
    expect(schema.safeParse(entry([{ source: 'manga-chapter:585' }])).success).toBe(false);
    // Target that is not an EntityId.
    expect(schema.safeParse(entry([{ target: 'nope' }])).success).toBe(false);
    // Number item.
    expect(schema.safeParse(entry([42])).success).toBe(false);
    // Empty source list (SourceRefOrList requires min 1).
    expect(schema.safeParse(entry([{ target: 'character:luffy', source: [] }])).success)
      .toBe(false);
  });
});

// ADR-096 — dangling-ref resolution walks believed_by / known_truth_by
// items: a missing believer target AND a missing per-item source both
// fail `check:references`.
function loaded(id: string, data: Record<string, unknown>): LoadedEntity {
  const [type] = id.split(':');
  return { id, type: type ?? '', path: `${id}.json`, data: { id, type, ...data } };
}

describe('resolveEntityReferences — entity-ref-item lists (ADR-096)', () => {
  const map = (...entities: LoadedEntity[]): Map<string, LoadedEntity> =>
    new Map(entities.map((e) => [e.id, e]));

  test('resolves object-item targets and sources on property entries', () => {
    const widget = loaded('widget:x', {
      properties: {
        color: [{
          value: 'red',
          believed_by: [
            { target: 'character:ghost', source: 'manga-chapter:404' },
            'character:real',
          ],
        }],
      },
    });
    const errors = resolveEntityReferences(
      map(widget, loaded('character:real', {})),
      catalogue(),
    );
    const targets = errors.map((e) => e.target);
    expect(targets).toContain('character:ghost');
    expect(targets).toContain('manga-chapter:404');
    expect(targets).not.toContain('character:real');
    expect(errors.every((e) => e.path === 'properties.color[0].believed_by')).toBe(true);
  });

  test('resolves object-item targets and sources on relation qualifier bags', () => {
    const widget = loaded('widget:x', {
      relations: [{
        type: 'knows',
        target: 'widget:y',
        qualifiers: {
          known_truth_by: [{ target: 'character:ghost', source: ['manga-chapter:404'] }],
        },
      }],
    });
    const errors = resolveEntityReferences(
      map(widget, loaded('widget:y', {})),
      catalogue(),
    );
    const targets = errors.map((e) => e.target);
    expect(targets).toContain('character:ghost');
    expect(targets).toContain('manga-chapter:404');
  });

  test('passes when every item target and per-item source exists', () => {
    const widget = loaded('widget:x', {
      properties: {
        color: [{
          value: 'red',
          believed_by: [{ target: 'character:real', source: 'manga-chapter:1' }],
        }],
      },
    });
    const errors = resolveEntityReferences(
      map(widget, loaded('character:real', {}), loaded('manga-chapter:1', {})),
      catalogue(),
    );
    expect(errors).toEqual([]);
  });
});
