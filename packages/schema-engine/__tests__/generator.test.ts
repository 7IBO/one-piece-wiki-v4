/**
 * Generator smoke test: runs the full schema:generate pipeline against
 * /data/schemas, then imports the emitted Zod schemas and asserts that
 * a representative entity (Luffy-like character) and a representative
 * property entry (bounty) parse and reject as expected.
 *
 * Acts as the gate against generator regressions — anything that breaks
 * the public type surface for the SDK / dashboard will fail here.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { generate } from '../src/generator.ts';
import { loadSchemas } from '../src/loader.ts';
import { validateCatalogue } from '../src/meta-validator.ts';
import { GENERATED_DIR } from '../src/paths.ts';

describe('schema-engine generator', () => {
  it('emits importable Zod schemas that round-trip a valid character', async () => {
    const catalogue = await loadSchemas();
    const validated = validateCatalogue(catalogue);
    expect(validated.errors).toEqual([]);
    await generate(validated);

    // Bust the require cache so reruns reload freshly emitted code.
    const entitiesPath = join(GENERATED_DIR, 'entities.ts');
    const propertyValuesPath = join(GENERATED_DIR, 'property-values.ts');
    const vocabPath = join(GENERATED_DIR, 'vocabularies.ts');
    const entitiesMod = await import(`${entitiesPath}?t=${Date.now()}`);
    const propertyMod = await import(`${propertyValuesPath}?t=${Date.now()}`);
    const vocabMod = await import(`${vocabPath}?t=${Date.now()}`);

    expect(typeof entitiesMod.EntityDataSchemas).toBe('object');
    expect(entitiesMod.EntityDataSchemas.character).toBeDefined();
    expect(propertyMod.PropertyEntrySchemas.bounty).toBeDefined();
    expect(vocabMod.VocabularyValues['blood-types']).toContain('F');
  });

  it('accepts a well-formed bounty entry and rejects negative values', async () => {
    const propertyMod = await import(join(GENERATED_DIR, 'property-values.ts'));
    const Bounty = propertyMod.PropertyEntrySchemas.bounty;

    const good = Bounty.safeParse({
      value: 3_000_000_000,
      source: 'manga-chapter:1058',
      since: 'manga-chapter:1058',
      epistemic_status: 'confirmed',
    });
    expect(good.success).toBe(true);

    const bad = Bounty.safeParse({ value: -1, source: 'manga-chapter:1058' });
    expect(bad.success).toBe(false);
  });

  it('accepts a well-formed IsoDate and rejects malformed dates', async () => {
    const propertyMod = await import(join(GENERATED_DIR, 'property-values.ts'));
    const ReleasedAt = propertyMod.PropertyEntrySchemas.released_at;

    const good = ReleasedAt.safeParse({ value: '1997-07-22', territory: 'jp' });
    expect(good.success).toBe(true);

    const bad = ReleasedAt.safeParse({ value: '97/07/22' });
    expect(bad.success).toBe(false);
  });

  it('rejects an entity whose `type` literal does not match the schema key', async () => {
    const entitiesMod = await import(join(GENERATED_DIR, 'entities.ts'));
    const CharacterData = entitiesMod.EntityDataSchemas.character;

    const mismatched = CharacterData.safeParse({
      id: 'character:luffy',
      type: 'devil-fruit',
      schema_version: 1,
      slug: 'luffy',
      properties: { name: [{ value_key: 'character.luffy.name' }], status: [{ value: 'alive' }] },
      relations: [],
    });
    expect(mismatched.success).toBe(false);
  });
});
