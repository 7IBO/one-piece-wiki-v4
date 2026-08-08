/**
 * Volume Box → volume mapper.
 *
 * NB: `fixtures/volume-12.json` is SYNTHETIC (hand-written 2026-08-08
 * from the wiki's "Volume Box" template docs — the sandbox network
 * policy denies onepiece.fandom.com, ADR-079 §6). It must be
 * validated against a live action=parse response on the first CI run
 * and replaced with the capture, like chapter-1044/episode-1071 were.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR } from '../../schema-engine/src/paths.ts';
import type { ParsedPage } from '../src/fandom/client.ts';
import { detectKind } from '../src/fandom/crawl.ts';
import { mapVolume } from '../src/fandom/volume.ts';

async function fixture(name: string): Promise<ParsedPage> {
  const raw = await Bun.file(
    join(import.meta.dir, 'fixtures', `${name}.json`),
  ).json() as { parse: { title: string; pageid: number; wikitext: string; }; };
  return {
    title: raw.parse.title,
    pageId: raw.parse.pageid,
    wikitext: raw.parse.wikitext,
    url: `https://onepiece.fandom.com/wiki/${raw.parse.title.replace(/ /g, '_')}`,
  };
}

describe('volume mapper (SYNTHETIC Volume Box fixture)', () => {
  it('maps ordinal from the page title, ename title, and the JP release date', async () => {
    const page = await fixture('volume-12');
    const result = mapVolume(page);
    expect(result).not.toBeNull();
    expect(result?.entity).toMatchObject({
      id: 'volume:12',
      type: 'volume',
      slug: 'volume-12',
      properties: {
        number: { value: 12 },
        title_key: { value_key: 'volume.12.title' },
        released_at: { value: '2000-02-04', territory: 'jp' },
      },
    });
    expect(result?.entity.relations).toEqual([]);
    expect(result?.translations.en['volume.12.title']).toBe('The Legend Begins');
  });

  it('surfaces schema gaps (isbn/pages/EN release/chapter range) as warnings, not values', async () => {
    const page = await fixture('volume-12');
    const result = mapVolume(page);
    // The volume schema has ONLY number/title_key/released_at — the
    // rest of the box must stay out of the entity.
    expect(Object.keys(result!.entity.properties).sort()).toEqual([
      'number',
      'released_at',
      'title_key',
    ]);
    expect(result?.warnings.some((w) => w.startsWith('jisbn:'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('pages:'))).toBe(true);
    expect(result?.warnings.some((w) => w.includes('EN release'))).toBe(true);
    // The chapter list belongs to the chapter side (part-of-volume).
    expect(result?.warnings.some((w) => w.includes('chapters 99–107'))).toBe(true);
  });

  it('passes the generated volume Zod gate', async () => {
    const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as {
      VolumeData: {
        safeParse: (v: unknown) => { success: boolean; error?: { message: string; }; };
      };
    };
    const result = mapVolume(await fixture('volume-12'));
    const parsed = mod.VolumeData.safeParse(result?.entity);
    // Surface the Zod message through the assertion on failure.
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });

  it('returns null without an infobox or ordinal', async () => {
    const page = await fixture('volume-12');
    expect(mapVolume({ ...page, wikitext: 'just prose' })).toBeNull();
    expect(
      mapVolume({ ...page, title: 'Weird page', wikitext: '{{Volume Box|jname=x}}' }),
    ).toBeNull();
  });

  it('warns (instead of failing) when title or release date are missing/unparseable', async () => {
    const page = await fixture('volume-12');
    const result = mapVolume({
      ...page,
      wikitext: '{{Volume Box|jname=伝説は始まった|jrelease=TBA}}',
    });
    expect(result?.entity.properties['released_at']).toBeUndefined();
    expect(result?.warnings.some((w) => w.includes('unparseable JP release date'))).toBe(true);
    expect(result?.warnings.some((w) => w.includes('title translation missing'))).toBe(true);
  });

  it('is routed by detectKind', async () => {
    const page = await fixture('volume-12');
    expect(detectKind(page.wikitext)).toEqual({ kind: 'volume' });
  });
});
