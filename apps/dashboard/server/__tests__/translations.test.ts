/**
 * ADR-095 — translation-record plumbing round-trip. The record covers
 * every data locale (en/fr/ja/ja-latn); missing or malformed files
 * normalize to `{}`; the save side writes one file per locale that
 * carries at least one non-empty value (empty string = no translation)
 * so `ja`/`ja-latn` directories only appear once real content exists.
 */
import { describe, expect, it } from 'bun:test';
import {
  emptyTranslationRecord,
  parseTranslationMap,
  readTranslationRecord,
  translationExtraFiles,
  translationsRelativePath,
} from '../translations.ts';

describe('translationsRelativePath', () => {
  it('builds the per-locale file path, including ja / ja-latn', () => {
    expect(translationsRelativePath('one-piece', 'en', 'character', 'luffy'))
      .toBe('data/universes/one-piece/translations/en/character/luffy.json');
    expect(translationsRelativePath('one-piece', 'ja-latn', 'character', 'luffy'))
      .toBe('data/universes/one-piece/translations/ja-latn/character/luffy.json');
  });
});

describe('parseTranslationMap', () => {
  it('parses flat objects and normalizes absence/malformation to {}', () => {
    expect(parseTranslationMap('{"a.b": "x"}')).toEqual({ 'a.b': 'x' });
    expect(parseTranslationMap(null)).toEqual({});
    expect(parseTranslationMap('not json')).toEqual({});
    expect(parseTranslationMap('[1,2]')).toEqual({});
  });
});

describe('readTranslationRecord', () => {
  it('reads all four locale files; missing locales become {}', async () => {
    const files: Record<string, string> = {
      'data/universes/one-piece/translations/en/character/luffy.json': JSON.stringify({
        'character.luffy.name.common': 'Monkey D. Luffy',
      }),
      'data/universes/one-piece/translations/ja/character/luffy.json': JSON.stringify({
        'character.luffy.name.common': 'モンキー・D・ルフィ',
      }),
      'data/universes/one-piece/translations/ja-latn/character/luffy.json': JSON.stringify({
        'character.luffy.name.common': 'Monkī Dī Rufi',
      }),
    };
    const record = await readTranslationRecord(
      (path) => Promise.resolve(files[path] ?? null),
      'one-piece',
      'character',
      'luffy',
    );
    expect(record.en['character.luffy.name.common']).toBe('Monkey D. Luffy');
    expect(record.fr).toEqual({});
    expect(record.ja['character.luffy.name.common']).toBe('モンキー・D・ルフィ');
    expect(record['ja-latn']['character.luffy.name.common']).toBe('Monkī Dī Rufi');
  });

  it('treats reader failures as absent files', async () => {
    const record = await readTranslationRecord(
      () => Promise.reject(new Error('boom')),
      'one-piece',
      'character',
      'luffy',
    );
    expect(record).toEqual(emptyTranslationRecord());
  });
});

describe('translationExtraFiles (save side)', () => {
  it('round-trips ja / ja-latn: what the record holds is what gets written', async () => {
    const written = translationExtraFiles('one-piece', 'character', 'luffy', {
      en: { 'character.luffy.name.common': 'Monkey D. Luffy' },
      ja: { 'character.luffy.name.common': 'モンキー・D・ルフィ' },
      'ja-latn': { 'character.luffy.name.common': 'Monkī Dī Rufi' },
    });
    expect(written.map((f) => f.path)).toEqual([
      'data/universes/one-piece/translations/en/character/luffy.json',
      'data/universes/one-piece/translations/ja/character/luffy.json',
      'data/universes/one-piece/translations/ja-latn/character/luffy.json',
    ]);
    // Read the written contents back through the reader — full loop.
    const files = Object.fromEntries(written.map((f) => [f.path, f.content]));
    const record = await readTranslationRecord(
      (path) => Promise.resolve(files[path] ?? null),
      'one-piece',
      'character',
      'luffy',
    );
    expect(record.ja['character.luffy.name.common']).toBe('モンキー・D・ルフィ');
    expect(record['ja-latn']['character.luffy.name.common']).toBe('Monkī Dī Rufi');
    expect(record.fr).toEqual({});
  });

  it('skips empty strings and locales with nothing left — no empty files', () => {
    const written = translationExtraFiles('one-piece', 'character', 'luffy', {
      en: { 'character.luffy.name.common': 'Monkey D. Luffy' },
      fr: { 'character.luffy.name.common': '' },
      ja: {},
    });
    expect(written.map((f) => f.path)).toEqual([
      'data/universes/one-piece/translations/en/character/luffy.json',
    ]);
  });

  it('handles an absent translations payload', () => {
    expect(translationExtraFiles('one-piece', 'character', 'luffy', undefined)).toEqual([]);
  });

  it('en/fr semantics are unchanged: files end with a trailing newline, 2-space indent', () => {
    const [file] = translationExtraFiles('one-piece', 'character', 'luffy', {
      en: { 'character.luffy.name.common': 'Monkey D. Luffy' },
    });
    expect(file?.content).toBe(
      `${JSON.stringify({ 'character.luffy.name.common': 'Monkey D. Luffy' }, null, 2)}\n`,
    );
  });
});
