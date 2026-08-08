/**
 * Translation + narrative loaders: corpus-layout trees built in a temp
 * directory, deterministic sorted output, loud failures on malformed
 * translation files.
 */
import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNarrativeRows, loadTranslationRows } from '../src/content.ts';

function write(root: string, relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function makeUniversesDir(): string {
  return mkdtempSync(join(tmpdir(), 'db-builder-content-'));
}

describe('loadTranslationRows', () => {
  it('loads flat key→value maps per universe/locale, sorted', async () => {
    const root = makeUniversesDir();
    write(
      root,
      'one-piece/translations/fr/character/luffy.json',
      JSON.stringify({ 'character.luffy.name.common': 'Monkey D. Luffy' }),
    );
    write(
      root,
      'one-piece/translations/en/character/luffy.json',
      JSON.stringify({
        'character.luffy.name.common': 'Monkey D. Luffy',
        'character.luffy.epithet.straw-hat': 'Straw Hat',
      }),
    );

    const rows = await loadTranslationRows(root);
    expect(rows).toEqual([
      {
        universe: 'one-piece',
        locale: 'en',
        key: 'character.luffy.epithet.straw-hat',
        value: 'Straw Hat',
      },
      {
        universe: 'one-piece',
        locale: 'en',
        key: 'character.luffy.name.common',
        value: 'Monkey D. Luffy',
      },
      {
        universe: 'one-piece',
        locale: 'fr',
        key: 'character.luffy.name.common',
        value: 'Monkey D. Luffy',
      },
    ]);
  });

  it('returns [] when the translations tree is absent', async () => {
    const root = makeUniversesDir();
    mkdirSync(join(root, 'one-piece'), { recursive: true });
    expect(await loadTranslationRows(root)).toEqual([]);
  });

  it('throws on duplicate keys within a locale', async () => {
    const root = makeUniversesDir();
    write(
      root,
      'one-piece/translations/en/character/a.json',
      JSON.stringify({ 'character.x.name': 'A' }),
    );
    write(
      root,
      'one-piece/translations/en/character/b.json',
      JSON.stringify({ 'character.x.name': 'B' }),
    );
    await expect(loadTranslationRows(root)).rejects.toThrow('Duplicate translation key');
  });

  it('throws on non-string values', async () => {
    const root = makeUniversesDir();
    write(
      root,
      'one-piece/translations/en/character/a.json',
      JSON.stringify({ 'character.x.bounty': 42 }),
    );
    await expect(loadTranslationRows(root)).rejects.toThrow('is not a string');
  });
});

describe('loadNarrativeRows', () => {
  it('derives entity ids from <entityType>/<fileBase>.md and keeps markdown verbatim', async () => {
    const root = makeUniversesDir();
    write(root, 'one-piece/narratives/en/character/ace.md', '**Ace** dies at Marineford.\n');
    write(root, 'one-piece/narratives/fr/character/ace.md', '**Ace** meurt à Marineford.\n');
    write(root, 'one-piece/narratives/en/arc/wano.md', 'The [[location:wano]] arc.\n');

    const rows = await loadNarrativeRows(root);
    expect(rows).toEqual([
      {
        universe: 'one-piece',
        entity_id: 'arc:wano',
        locale: 'en',
        markdown: 'The [[location:wano]] arc.\n',
      },
      {
        universe: 'one-piece',
        entity_id: 'character:ace',
        locale: 'en',
        markdown: '**Ace** dies at Marineford.\n',
      },
      {
        universe: 'one-piece',
        entity_id: 'character:ace',
        locale: 'fr',
        markdown: '**Ace** meurt à Marineford.\n',
      },
    ]);
  });

  it('returns [] when the narratives tree is absent', async () => {
    const root = makeUniversesDir();
    mkdirSync(join(root, 'one-piece'), { recursive: true });
    expect(await loadNarrativeRows(root)).toEqual([]);
  });
});
