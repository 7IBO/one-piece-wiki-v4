/**
 * Pure narrative helpers (server/narrative.ts): path convention,
 * body normalization (empty → delete), and POST payload validation.
 */
import { describe, expect, test } from 'bun:test';
import {
  NARRATIVE_MAX_CHARS,
  narrativePath,
  normalizeNarrativeText,
  parseNarrativeSave,
} from '../narrative.ts';

describe('narrativePath', () => {
  test('follows narratives/<locale>/<type>/<fileBase>.md', () => {
    expect(narrativePath('one-piece', 'en', 'character', 'luffy')).toBe(
      'data/universes/one-piece/narratives/en/character/luffy.md',
    );
    expect(narrativePath('one-piece', 'fr', 'event', 'battle-of-marineford')).toBe(
      'data/universes/one-piece/narratives/fr/event/battle-of-marineford.md',
    );
  });

  test('uses the entity file base, not the display slug', () => {
    // character:ace lives in ace.json even though its slug is
    // portgas-d-ace — the narrative pairs with the JSON file.
    expect(narrativePath('one-piece', 'en', 'character', 'ace')).toBe(
      'data/universes/one-piece/narratives/en/character/ace.md',
    );
  });
});

describe('normalizeNarrativeText', () => {
  test('returns null for empty and whitespace-only text (→ delete)', () => {
    expect(normalizeNarrativeText('')).toBeNull();
    expect(normalizeNarrativeText('   \n\t\n  ')).toBeNull();
  });

  test('guarantees exactly one trailing newline', () => {
    expect(normalizeNarrativeText('Luffy sets sail.')).toBe('Luffy sets sail.\n');
    expect(normalizeNarrativeText('Luffy sets sail.\n\n\n')).toBe('Luffy sets sail.\n');
  });

  test('strips trailing whitespace per line and CRLF, keeps inner blank lines', () => {
    expect(normalizeNarrativeText('Para one.  \r\n\r\nPara two.\t\n')).toBe(
      'Para one.\n\nPara two.\n',
    );
  });

  test('strips leading blank lines', () => {
    expect(normalizeNarrativeText('\n\nText.')).toBe('Text.\n');
  });
});

describe('parseNarrativeSave', () => {
  test('accepts one or both locales', () => {
    expect(parseNarrativeSave({ en: 'Hi' })).toEqual({ ok: true, value: { en: 'Hi' } });
    expect(parseNarrativeSave({ en: 'Hi', fr: 'Salut' })).toEqual({
      ok: true,
      value: { en: 'Hi', fr: 'Salut' },
    });
  });

  test('accepts empty strings (they mean "delete this locale")', () => {
    expect(parseNarrativeSave({ fr: '' })).toEqual({ ok: true, value: { fr: '' } });
  });

  test('rejects non-object bodies', () => {
    for (const bad of [null, 'en', 42, ['en']]) {
      const parsed = parseNarrativeSave(bad);
      expect(parsed.ok).toBe(false);
    }
  });

  test('rejects an empty object (nothing to save)', () => {
    const parsed = parseNarrativeSave({});
    expect(parsed.ok).toBe(false);
  });

  test('rejects unknown keys loudly', () => {
    const parsed = parseNarrativeSave({ english: 'typo' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('english');
  });

  test('rejects non-string locale values', () => {
    expect(parseNarrativeSave({ en: 42 }).ok).toBe(false);
  });

  test('rejects over-long text (concision cap)', () => {
    const parsed = parseNarrativeSave({ en: 'x'.repeat(NARRATIVE_MAX_CHARS + 1) });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(String(NARRATIVE_MAX_CHARS));
  });
});
