import { describe, expect, test } from 'bun:test';
import { ENTITY_ID_PATTERN, I18N_KEY_PATTERN, SLUG_PATTERN } from '../src/primitives.ts';

describe('SLUG_PATTERN', () => {
  test('accepts kebab-case and snake_case', () => {
    expect(SLUG_PATTERN.test('gomu-gomu')).toBe(true);
    expect(SLUG_PATTERN.test('blood_type')).toBe(true);
    expect(SLUG_PATTERN.test('arc')).toBe(true);
  });

  test('rejects uppercase, leading/trailing/double separators', () => {
    expect(SLUG_PATTERN.test('Luffy')).toBe(false);
    expect(SLUG_PATTERN.test('-x')).toBe(false);
    expect(SLUG_PATTERN.test('x-')).toBe(false);
    expect(SLUG_PATTERN.test('a--b')).toBe(false);
  });
});

describe('ENTITY_ID_PATTERN', () => {
  test('accepts type:slug, including snake_case slugs', () => {
    expect(ENTITY_ID_PATTERN.test('character:luffy')).toBe(true);
    // the bug the loose hyphen-only resolver regex silently skipped:
    expect(ENTITY_ID_PATTERN.test('devil-fruit:gomu_gomu')).toBe(true);
    expect(ENTITY_ID_PATTERN.test('manga-chapter:1044')).toBe(true);
  });

  test('rejects missing halves and bad shapes', () => {
    expect(ENTITY_ID_PATTERN.test('character:')).toBe(false);
    expect(ENTITY_ID_PATTERN.test(':luffy')).toBe(false);
    expect(ENTITY_ID_PATTERN.test('no-colon')).toBe(false);
    expect(ENTITY_ID_PATTERN.test('a:b:c')).toBe(false);
  });
});

describe('I18N_KEY_PATTERN', () => {
  test('requires at least one dot segment', () => {
    expect(I18N_KEY_PATTERN.test('character.luffy.name')).toBe(true);
    expect(I18N_KEY_PATTERN.test('image.x.caption_key')).toBe(true);
    expect(I18N_KEY_PATTERN.test('nodot')).toBe(false);
    expect(I18N_KEY_PATTERN.test('trailing.')).toBe(false);
  });
});
