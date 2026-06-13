/**
 * Tests for the shared display-name resolver. Locks in the behaviour
 * that was previously copy-pasted across the dashboard server and
 * client, so the dedup PR is provably behaviour-preserving.
 */
import { describe, expect, it } from 'bun:test';
import { nameKeyFor, resolveDisplayName } from '../src/display-name.ts';

const translations = {
  en: {
    'character.luffy.name': 'Monkey D. Luffy',
    'manga-chapter.1.title': 'Romance Dawn',
  },
  fr: {
    'character.luffy.name': 'Monkey D. Luffy',
  },
};

describe('nameKeyFor', () => {
  it('returns the latest entry of the name property', () => {
    const data = {
      properties: {
        name: [
          { value_key: 'character.luffy.name.old', since: 'manga-chapter:1' },
          { value_key: 'character.luffy.name', since: 'manga-chapter:100' },
        ],
      },
    };
    expect(nameKeyFor(data)).toBe('character.luffy.name');
  });

  it('falls back to title_key when name is absent', () => {
    const data = { properties: { title_key: { value_key: 'manga-chapter.1.title' } } };
    expect(nameKeyFor(data)).toBe('manga-chapter.1.title');
  });

  it('prefers name over title_key when both present', () => {
    const data = {
      properties: {
        title_key: { value_key: 'manga-chapter.1.title' },
        name: { value_key: 'character.luffy.name' },
      },
    };
    expect(nameKeyFor(data)).toBe('character.luffy.name');
  });

  it('returns null when no name-like property exists', () => {
    expect(nameKeyFor({ properties: { bounty: [{ value: 100 }] } })).toBeNull();
    expect(nameKeyFor({})).toBeNull();
  });

  it('accepts a literal `value` when there is no `value_key`', () => {
    expect(nameKeyFor({ properties: { name: { value: 'Raw Name' } } })).toBe('Raw Name');
  });
});

describe('resolveDisplayName', () => {
  const data = { properties: { name: [{ value_key: 'character.luffy.name' }] } };

  it('resolves against the requested locale', () => {
    expect(resolveDisplayName(data, translations, 'fr')).toBe('Monkey D. Luffy');
  });

  it('falls back to en when the locale lacks the key', () => {
    const chapter = { properties: { title_key: { value_key: 'manga-chapter.1.title' } } };
    expect(resolveDisplayName(chapter, translations, 'fr')).toBe('Romance Dawn');
  });

  it('returns null when no translation resolves', () => {
    const data = { properties: { name: [{ value_key: 'unknown.key' }] } };
    expect(resolveDisplayName(data, translations, 'en')).toBeNull();
  });

  it('scans earlier entries when the latest has no translation', () => {
    const data = {
      properties: {
        name: [
          { value_key: 'character.luffy.name' },
          { value_key: 'untranslated.key' },
        ],
      },
    };
    // latest entry (untranslated.key) has no translation; the resolver
    // falls back to the earlier entry that does.
    expect(resolveDisplayName(data, translations, 'en')).toBe('Monkey D. Luffy');
  });
});
