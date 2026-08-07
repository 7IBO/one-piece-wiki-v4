/**
 * Char Box → character mapper on the REAL Hyougoro response
 * (fixture captured by the maintainer, 2026-06-14).
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR } from '../../schema-engine/src/paths.ts';
import { mapCharacter, parseBirthday } from '../src/fandom/character.ts';
import type { ParsedPage } from '../src/fandom/client.ts';
import { parseNihongo, parseQrefs } from '../src/fandom/wikitext.ts';

async function hyougoro(): Promise<ParsedPage> {
  const raw = await Bun.file(
    join(import.meta.dir, 'fixtures', 'hyougoro.json'),
  ).json() as { parse: { title: string; pageid: number; wikitext: string; }; };
  return {
    title: raw.parse.title,
    pageId: raw.parse.pageid,
    wikitext: raw.parse.wikitext,
    url: 'https://onepiece.fandom.com/wiki/Hyougoro',
  };
}

describe('new Qref variants (real Char Box)', () => {
  it('parses cover= and card= into source ids', async () => {
    const page = await hyougoro();
    const ids = parseQrefs(page.wikitext).map((q) => q.sourceId);
    expect(ids).toContain('manga-chapter:1117'); // cover=1117
    expect(ids).toContain('databook-card:1329'); // card=1329 (Vivre Card)
    expect(ids).toContain('manga-chapter:926');
    expect(ids).toContain('anime-episode:919');
  });

  it('parses {{Nihongo}} alias/epithet values', () => {
    const n = parseNihongo(
      '{{Nihongo|"Hyougoro of the Flower"|花のヒョウ五郎|Hana no Hyōgorō|English: "Hyogoro the Flower"}}',
    );
    expect(n).toMatchObject({
      text: 'Hyougoro of the Flower',
      kanji: '花のヒョウ五郎',
      romaji: 'Hana no Hyōgorō',
    });
  });

  it('parses birthdays to the corpus MM-DD shape', () => {
    expect(parseBirthday('February 14th')).toBe('02-14');
    expect(parseBirthday('May 5')).toBe('05-05');
    expect(parseBirthday('sometime in spring')).toBeNull();
  });
});

describe('character mapper (real Char Box)', () => {
  it('maps the deterministic scalars with per-value provenance', async () => {
    const result = mapCharacter(await hyougoro());
    expect(result).not.toBeNull();
    const entity = result!.entity;
    expect(entity).toMatchObject({
      id: 'character:hyogoro',
      slug: 'hyogoro',
      canonical_name_key: 'character.hyogoro.name.common',
    });
    // name: common (debut since) + alias from {{Nihongo}}.
    const names = entity.properties['name'] as readonly Record<string, unknown>[];
    expect(names[0]).toMatchObject({
      value_key: 'character.hyogoro.name.common',
      name_type: 'common',
      since: 'manga-chapter:926',
    });
    expect(names[1]).toMatchObject({ name_type: 'alias' });
    expect(result!.translations.en['character.hyogoro.name.common']).toBe('Hyogoro');
    // Vivre-Card-sourced measured facts.
    expect(entity.properties['age']).toEqual([
      { value: 70, source: 'databook-card:1329' },
    ]);
    expect(entity.properties['height']).toEqual([
      { value: 100, source: 'databook-card:1329' },
    ]);
    expect(entity.properties['birthday']).toEqual({ value: '02-14' });
    expect(entity.properties['blood_type']).toEqual({ value: 'S' });
    // Status inferred (no param) — flagged, not silent.
    expect(entity.properties['status']).toEqual([
      { value: 'alive', since: 'manga-chapter:926' },
    ]);
    expect(result!.warnings.some((w) => w.includes('defaulted to alive'))).toBe(true);
    // Needs-resolution params surface as warnings.
    expect(result!.warnings.some((w) => w.startsWith('affiliation:'))).toBe(true);
    expect(result!.warnings.some((w) => w.startsWith('jva:'))).toBe(true);
  });

  it('validates against the generated character Zod', async () => {
    const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as {
      CharacterData: {
        safeParse: (v: unknown) => { success: boolean; error?: { message: string; }; };
      };
    };
    const result = mapCharacter(await hyougoro());
    const parsed = mod.CharacterData.safeParse(result!.entity);
    // Surface the Zod message through the assertion on failure.
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });

  it('returns null without a Char Box or ename', async () => {
    const page = await hyougoro();
    expect(mapCharacter({ ...page, wikitext: 'prose only' })).toBeNull();
    expect(mapCharacter({ ...page, wikitext: '{{Char Box|jname=x}}' })).toBeNull();
  });
});
