/**
 * ADR-095 — data-locale gating for translation inputs. `ja` is offered
 * on every localizable value; `ja-latn` ONLY on property types flagged
 * `romanizable` (name-like values). Non-localizable types offer no
 * translation locales at all.
 */
import { describe, expect, test } from 'bun:test';
import { translationLocalesFor } from '../src/data-locales.ts';
import { PropertyTypeSchema } from '../src/meta/property-type.ts';
import { DATA_LOCALES, DataLocale } from '../src/primitives.ts';

describe('DataLocale', () => {
  test('covers exactly the four data locales, superset of the UI pair', () => {
    expect(DATA_LOCALES).toEqual(['en', 'fr', 'ja', 'ja-latn']);
    expect(DataLocale.safeParse('ja-latn').success).toBe(true);
    // The rejected non-BCP-47 spelling from the design discussion:
    expect(DataLocale.safeParse('ja-rom').success).toBe(false);
  });
});

describe('translationLocalesFor', () => {
  test('every localizable property offers ja (but NOT ja-latn) by default', () => {
    expect(translationLocalesFor({ localizable: true })).toEqual(['en', 'fr', 'ja']);
    expect(translationLocalesFor({ localizable: true, romanizable: false }))
      .toEqual(['en', 'fr', 'ja']);
  });

  test('romanizable property types additionally offer ja-latn', () => {
    expect(translationLocalesFor({ localizable: true, romanizable: true }))
      .toEqual(['en', 'fr', 'ja', 'ja-latn']);
  });

  test('a non-romanizable localizable property must NOT offer ja-latn', () => {
    // A description-like free-text key: localizable, no romanizable flag.
    const descriptionLike = PropertyTypeSchema.parse({
      id: 'caption_key',
      schema_version: 1,
      labels: { en: 'Caption', fr: 'Légende' },
      value_type: 'i18n_key',
      historical: false,
      localizable: true,
    });
    expect(translationLocalesFor(descriptionLike)).not.toContain('ja-latn');
    expect(translationLocalesFor(descriptionLike)).toContain('ja');
  });

  test('non-localizable properties offer no translation locales', () => {
    expect(translationLocalesFor({ localizable: false })).toEqual([]);
    expect(translationLocalesFor({ localizable: false, romanizable: true })).toEqual([]);
  });

  test('PropertyTypeSchema accepts the optional romanizable flag', () => {
    const nameLike = PropertyTypeSchema.parse({
      id: 'name',
      schema_version: 1,
      labels: { en: 'Name', fr: 'Nom' },
      value_type: 'i18n_key',
      historical: true,
      localizable: true,
      romanizable: true,
    });
    expect(nameLike.romanizable).toBe(true);
    expect(translationLocalesFor(nameLike)).toEqual(['en', 'fr', 'ja', 'ja-latn']);
  });
});
