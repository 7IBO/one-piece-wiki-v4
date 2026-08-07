/**
 * Emit adapter (ADR-079): corpus file building + local staging with
 * translation merge and entity-conflict safety.
 */
import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEmitFiles, stageToLocal } from '../src/emit.ts';

const output = {
  entity: {
    id: 'character:hyogoro',
    type: 'character',
    schema_version: 5,
    slug: 'hyogoro',
    properties: {},
    relations: [],
  },
  translations: { en: { 'character.hyogoro.name.common': 'Hyogoro' } },
};

describe('buildEmitFiles', () => {
  it('emits corpus-layout paths for entity + EN translations', () => {
    const files = buildEmitFiles(output);
    expect(files.map((f) => f.path)).toEqual([
      'data/universes/one-piece/entities/character/hyogoro.json',
      'data/universes/one-piece/translations/en/character/hyogoro.json',
    ]);
    expect(files[0]?.content.endsWith('\n')).toBe(true);
  });

  it('omits the translation file when there are no keys', () => {
    const files = buildEmitFiles({ ...output, translations: { en: {} } });
    expect(files).toHaveLength(1);
  });
});

describe('stageToLocal', () => {
  it('writes fresh files, merges translations (existing keys win), protects entities', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'emit-'));
    const files = buildEmitFiles(output);

    const first = await stageToLocal(files, { repoRoot });
    expect(first.written).toHaveLength(2);
    expect(first.skipped).toHaveLength(0);

    // Human edits the translation…
    const translationPath = join(
      repoRoot,
      'data/universes/one-piece/translations/en/character/hyogoro.json',
    );
    await Bun.write(
      translationPath,
      `${
        JSON.stringify(
          {
            'character.hyogoro.name.common': 'Hyogoro (reviewed)',
            'character.hyogoro.epithet.flower': 'Hyougoro of the Flower',
          },
          null,
          2,
        )
      }\n`,
    );

    // …then a re-import stages again: entity skipped, translations merged.
    const second = await stageToLocal(files, { repoRoot });
    expect(second.skipped[0]?.path).toContain('entities/character/hyogoro.json');
    const merged = (await Bun.file(translationPath).json()) as Record<string, string>;
    expect(merged['character.hyogoro.name.common']).toBe('Hyogoro (reviewed)');
    expect(merged['character.hyogoro.epithet.flower']).toBe('Hyougoro of the Flower');

    // Explicit overwrite unlocks the entity write.
    const third = await stageToLocal(files, { repoRoot, overwrite: true });
    expect(third.written).toContain('data/universes/one-piece/entities/character/hyogoro.json');
  });
});
