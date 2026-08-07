/**
 * Fandom importer foundation (ADR-079) — parser + mapper tests, all
 * on inline fixtures (the sandbox network policy denies
 * onepiece.fandom.com; refresh fixtures from live responses when a
 * networked environment is available).
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR } from '../../schema-engine/src/paths.ts';
import { mapChapter } from '../src/fandom/chapter.ts';
import { FandomClient } from '../src/fandom/client.ts';
import {
  cleanValue,
  findTemplate,
  parseLooseDate,
  parseLooseNumber,
  parseQrefs,
  parseTemplates,
} from '../src/fandom/wikitext.ts';

const CHAPTER_WIKITEXT = `{{Chapter Box
| chapter = 1044
| jname = 解放の戦士
| rname = Kaihō no Senshi
| ename = The Warrior of Liberation
| date = March 7, 2022
| pages = 17
| volume = 104
}}
'''Chapter 1044''' is titled "The Warrior of Liberation".{{Qref|Chapter=1044}}
Luffy's fruit is revealed as the [[Hito Hito no Mi, Model: Nika]].{{Qref|Chapter=1044|Episode=1071}}
`;

describe('wikitext parser', () => {
  it('parses nested templates and named/positional params', () => {
    const templates = parseTemplates('{{A|x={{B|1}}|two|k=[[a|b]]}}');
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      name: 'A',
      positional: ['two'],
    });
    expect(templates[0]?.named['x']).toBe('{{B|1}}');
    expect(templates[0]?.named['k']).toBe('[[a|b]]');
  });

  it('cleans links, refs and quotes from values', () => {
    expect(cleanValue("'''[[Monkey D. Luffy|Luffy]]'''<ref>x</ref>")).toBe('Luffy');
  });

  it('parses Qref templates into source ids', () => {
    expect(parseQrefs(CHAPTER_WIKITEXT)).toEqual([
      { sourceId: 'manga-chapter:1044' },
      { sourceId: 'manga-chapter:1044' },
      { sourceId: 'anime-episode:1071' },
    ]);
  });

  it('parses loose numbers and dates', () => {
    expect(parseLooseNumber('3,000,000,000')).toBe(3000000000);
    expect(parseLooseNumber('umpteen')).toBeNull();
    expect(parseLooseDate('March 7, 2022')).toBe('2022-03-07');
    expect(parseLooseDate('2022-03-07')).toBe('2022-03-07');
  });

  it('findTemplate matches case-insensitively', () => {
    expect(findTemplate(CHAPTER_WIKITEXT, 'chapter box')?.named['chapter']).toBe('1044');
  });
});

describe('chapter mapper', () => {
  const page = {
    title: 'Chapter 1044',
    pageId: 1,
    wikitext: CHAPTER_WIKITEXT,
    url: 'https://onepiece.fandom.com/wiki/Chapter_1044',
  };

  it('maps the infobox to the corpus file shape', () => {
    const result = mapChapter(page);
    expect(result).not.toBeNull();
    expect(result?.entity).toMatchObject({
      id: 'manga-chapter:1044',
      type: 'manga-chapter',
      slug: 'chapter-1044',
      properties: {
        number: { value: 1044 },
        title_key: { value_key: 'manga-chapter.1044.title' },
        released_at: { value: '2022-03-07', territory: 'jp' },
        page_count: { value: 17 },
      },
    });
    expect(result?.translations.en['manga-chapter.1044.title']).toBe(
      'The Warrior of Liberation',
    );
    expect(result?.entity.relations).toEqual([
      { type: 'part-of-volume', target: 'volume:104' },
    ]);
    // The volume-must-exist caveat is surfaced, not silently assumed.
    expect(result?.warnings.some((w) => w.includes('volume:104'))).toBe(true);
  });

  it('validates against the generated manga-chapter Zod (minus relations to missing entities)', async () => {
    const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as {
      MangaChapterData: { safeParse: (v: unknown) => { success: boolean; error?: unknown; }; };
    };
    const result = mapChapter(page);
    // Validate the entity shape itself; the volume:104 reference is a
    // corpus concern (check:references), not a shape concern.
    const parsed = mod.MangaChapterData.safeParse(result?.entity);
    expect(parsed.success).toBe(true);
  });

  it('returns null without an infobox or ordinal', () => {
    expect(mapChapter({ ...page, wikitext: 'just prose' })).toBeNull();
    expect(
      mapChapter({ ...page, wikitext: '{{Chapter Box|jname=x}}' }),
    ).toBeNull();
  });
});

describe('FandomClient', () => {
  it('builds the parse URL and reads the action=parse envelope via injected fetch', async () => {
    const raw = JSON.stringify({
      parse: { title: 'Chapter 1044', pageid: 42, wikitext: CHAPTER_WIKITEXT },
    });
    let requested = '';
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: ((url: string | URL | Request) => {
        requested = String(url);
        return Promise.resolve(new Response(raw, { status: 200 }));
      }) as typeof fetch,
    });
    const parsed = await client.fetchParse('Chapter 1044');
    expect(requested).toContain('action=parse');
    expect(requested).toContain('prop=wikitext');
    expect(parsed.pageId).toBe(42);
    expect(parsed.url).toBe('https://onepiece.fandom.com/wiki/Chapter_1044');
    expect(parsed.wikitext).toContain('Chapter Box');
  });

  it('surfaces MediaWiki API errors', async () => {
    const raw = JSON.stringify({ error: { code: 'missingtitle', info: 'no such page' } });
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: (() => Promise.resolve(new Response(raw, { status: 200 }))) as typeof fetch,
    });
    await expect(client.fetchParse('Nope')).rejects.toThrow(/missingtitle/);
  });
});
