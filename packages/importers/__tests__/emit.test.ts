/**
 * Emit adapter (ADR-079): corpus file building + local staging with
 * translation merge and entity-conflict safety.
 */
import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEmitFiles, mergeEntity, stageToLocal } from '../src/emit.ts';

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

describe('mergeEntity — `--overwrite` folds, it does not replace (2026-08-27)', () => {
  // The chapter re-run gained ONE `part-of-volume` and destroyed two
  // `released_at`, two `part-of-arc`, one `part-of-volume` and one
  // `available-on`. Wholesale replacement is the wrong tool for the
  // one job the flag exists for: re-running after the mapper learned
  // to read MORE fields.
  const stored = {
    id: 'manga-chapter:1044',
    type: 'manga-chapter',
    slug: 'chapter-1044',
    properties: {
      number: { value: 1044 },
      released_at: { value: '2022-03-07', territory: 'jp' },
    },
    relations: [{ type: 'part-of-arc', target: 'arc:wano' }],
  };

  it('keeps a property the mapper does not produce', () => {
    // An infobox has no release date for most chapters. That silence
    // is not a claim that the stored date is wrong.
    const merged = JSON.parse(mergeEntity(stored, {
      properties: { number: { value: 1044 } },
    }));
    expect(merged.properties.released_at).toEqual({ value: '2022-03-07', territory: 'jp' });
  });

  it('lets the mapper correct a property it DOES produce', () => {
    const merged = JSON.parse(mergeEntity(stored, {
      properties: { released_at: { value: '2022-03-08', territory: 'jp' } },
    }));
    expect(merged.properties.released_at.value).toBe('2022-03-08');
  });

  it('unions relations rather than replacing them', () => {
    // An arc edge and a volume edge are different facts about the
    // same chapter; neither is evidence against the other.
    const merged = JSON.parse(mergeEntity(stored, {
      relations: [{ type: 'part-of-volume', target: 'volume:103' }],
    }));
    expect(merged.relations).toEqual([
      { type: 'part-of-arc', target: 'arc:wano' },
      { type: 'part-of-volume', target: 'volume:103' },
    ]);
  });

  it('does not duplicate a relation the re-import repeats', () => {
    const merged = JSON.parse(mergeEntity(stored, {
      relations: [{ type: 'part-of-arc', target: 'arc:wano' }],
    }));
    expect(merged.relations).toHaveLength(1);
  });

  it('emits no `relations` key when there are none on either side', () => {
    const merged = JSON.parse(mergeEntity(
      { id: 'x', properties: { a: 1 } },
      { properties: { b: 2 } },
    ));
    expect(merged).not.toHaveProperty('relations');
    expect(merged.properties).toEqual({ a: 1, b: 2 });
  });
});
