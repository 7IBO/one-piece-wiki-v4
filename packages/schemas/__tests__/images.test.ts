/**
 * Tests for the schema-driven image discovery helpers (ADR-070). These
 * lock in that app code finds the image-URL property and the depiction
 * relation WITHOUT hardcoding `url` / `depicted-by` — discovery is purely
 * a function of the schema shape.
 */
import { describe, expect, it } from 'bun:test';
import {
  depictionsOf,
  findDepictionRelationIds,
  findImageUrlProperty,
  IMAGE_URL_ROLE,
  imageEntityTypes,
  imageUrlOf,
} from '../src/images.ts';
import type { PropertyTypeSchema, RelationTypeSchema } from '../src/index.ts';

// Minimal fixtures — only the fields the helpers read. Cast keeps the
// tests focused on behaviour without constructing whole schema objects.
function prop(partial: Record<string, unknown>): PropertyTypeSchema {
  return partial as unknown as PropertyTypeSchema;
}
function rel(partial: Record<string, unknown>): RelationTypeSchema {
  return partial as unknown as RelationTypeSchema;
}

const propertyTypes: Record<string, PropertyTypeSchema> = {
  url: prop({
    id: 'url',
    applies_to_entity_types: ['image'],
    ui_hint: { role: IMAGE_URL_ROLE },
  }),
  bounty: prop({ id: 'bounty', ui_hint: { display_format: 'currency_short' } }),
  name: prop({ id: 'name' }),
};

const relationTypes: Record<string, RelationTypeSchema> = {
  'depicted-by': rel({ id: 'depicted-by', valid_to_types: ['image'] }),
  'member-of': rel({ id: 'member-of', valid_to_types: ['crew'] }),
  'appears-in': rel({ id: 'appears-in', valid_to_types: ['manga-chapter', 'arc'] }),
};

describe('findImageUrlProperty / imageEntityTypes', () => {
  it('finds the property tagged ui_hint.role === "image_url"', () => {
    expect(findImageUrlProperty(propertyTypes)?.id).toBe('url');
  });

  it('returns null when no property carries the role', () => {
    expect(findImageUrlProperty({ name: prop({ id: 'name' }) })).toBeNull();
  });

  it('derives the image entity type(s) from applies_to_entity_types', () => {
    expect([...imageEntityTypes(propertyTypes)]).toEqual(['image']);
  });

  it('returns no image types when the role property is absent', () => {
    expect([...imageEntityTypes({ name: prop({ id: 'name' }) })]).toEqual([]);
  });
});

describe('findDepictionRelationIds', () => {
  it('finds relations whose valid_to_types include an image type', () => {
    expect([...findDepictionRelationIds(relationTypes, propertyTypes)]).toEqual(['depicted-by']);
  });

  it('returns nothing when there is no image entity type', () => {
    expect([...findDepictionRelationIds(relationTypes, { name: prop({ id: 'name' }) })]).toEqual(
      [],
    );
  });

  it('matches structurally — a renamed relation is still found by its targets', () => {
    const renamed = { portrayed: rel({ id: 'portrayed', valid_to_types: ['image'] }) };
    expect([...findDepictionRelationIds(renamed, propertyTypes)]).toEqual(['portrayed']);
  });
});

describe('depictionsOf', () => {
  const data = {
    relations: [
      { type: 'member-of', target: 'crew:straw-hat-pirates', qualifiers: { role: 'captain' } },
      {
        type: 'depicted-by',
        target: 'image:luffy-primary-portrait',
        qualifiers: { role: 'primary_portrait' },
      },
      {
        type: 'depicted-by',
        target: 'image:straw-hats-group',
        qualifiers: { role: 'group_photo' },
      },
    ],
  };

  it('extracts only depiction relations, in source order', () => {
    const result = depictionsOf(data, relationTypes, propertyTypes);
    expect(result.map((d) => d.imageId)).toEqual([
      'image:luffy-primary-portrait',
      'image:straw-hats-group',
    ]);
  });

  it('carries the relation type and qualifiers verbatim', () => {
    const [first] = depictionsOf(data, relationTypes, propertyTypes);
    expect(first?.relationType).toBe('depicted-by');
    expect(first?.qualifiers).toEqual({ role: 'primary_portrait' });
  });

  it('returns empty for an entity with no relations', () => {
    expect(depictionsOf({}, relationTypes, propertyTypes)).toEqual([]);
    expect(depictionsOf({ relations: [] }, relationTypes, propertyTypes)).toEqual([]);
  });

  it('skips malformed relation entries', () => {
    const messy = {
      relations: [
        null,
        { type: 'depicted-by' }, // no target
        { type: 'depicted-by', target: '' }, // empty target
        { type: 'depicted-by', target: 'image:ok' },
      ],
    };
    expect(depictionsOf(messy, relationTypes, propertyTypes).map((d) => d.imageId)).toEqual([
      'image:ok',
    ]);
  });

  it('defaults qualifiers to {} when missing', () => {
    const noQ = { relations: [{ type: 'depicted-by', target: 'image:x' }] };
    expect(depictionsOf(noQ, relationTypes, propertyTypes)[0]?.qualifiers).toEqual({});
  });
});

describe('imageUrlOf', () => {
  it('reads the latest entry of the historical url property', () => {
    const image = {
      properties: {
        url: [
          { value: 'https://cdn/old.webp', since: 'manga-chapter:1' },
          { value: 'https://cdn/new.webp', since: 'manga-chapter:100' },
        ],
      },
    };
    expect(imageUrlOf(image, propertyTypes)).toBe('https://cdn/new.webp');
  });

  it('accepts a scalar (non-array) property value', () => {
    const image = { properties: { url: { value: 'https://cdn/one.webp' } } };
    expect(imageUrlOf(image, propertyTypes)).toBe('https://cdn/one.webp');
  });

  it('returns a staging:// reference unchanged (resolved for display elsewhere)', () => {
    const image = { properties: { url: [{ value: 'staging://pending/x.webp' }] } };
    expect(imageUrlOf(image, propertyTypes)).toBe('staging://pending/x.webp');
  });

  it('returns null when the url property is absent or empty', () => {
    expect(imageUrlOf({ properties: {} }, propertyTypes)).toBeNull();
    expect(imageUrlOf({}, propertyTypes)).toBeNull();
    expect(imageUrlOf({ properties: { url: [] } }, propertyTypes)).toBeNull();
  });

  it('returns null when no property carries the image_url role', () => {
    const image = { properties: { url: [{ value: 'https://cdn/x.webp' }] } };
    expect(imageUrlOf(image, { name: prop({ id: 'name' }) })).toBeNull();
  });
});
