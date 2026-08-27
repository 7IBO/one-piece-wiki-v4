/**
 * Fandom importer foundation (ADR-079) — parser + mapper tests on
 * REAL API responses (fixtures captured by the maintainer,
 * 2026-06-14; sandbox network policy denies onepiece.fandom.com so
 * they cannot be refreshed from here).
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR } from '../../schema-engine/src/paths.ts';
import { isPlaceholderName } from '../src/fandom/box.ts';
import { mapChapter } from '../src/fandom/chapter.ts';
import type { ParsedPage } from '../src/fandom/client.ts';
import { FandomClient } from '../src/fandom/client.ts';
import { mapEpisode } from '../src/fandom/episode.ts';
import {
  cleanValue,
  parseLooseDate,
  parseLooseNumber,
  parseQrefs,
  parseTemplates,
} from '../src/fandom/wikitext.ts';

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

describe('wikitext parser', () => {
  it('parses nested templates and named/positional params', () => {
    const templates = parseTemplates('{{A|x={{B|1}}|two|k=[[a|b]]}}');
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: 'A', positional: ['two'] });
    expect(templates[0]?.named['x']).toBe('{{B|1}}');
    expect(templates[0]?.named['k']).toBe('[[a|b]]');
  });

  it('cleans links, refs and quotes from values', () => {
    expect(cleanValue("'''[[Monkey D. Luffy|Luffy]]'''<ref>x</ref>")).toBe('Luffy');
  });

  it('refuses to build an entity from a template placeholder', () => {
    // A live `Devil Fruits` crawl produced `character:n-a` — a
    // character literally called "N/A", with a bounty of 220, a height
    // of 180 and a birthday, every field read off empty template
    // slots. Only a `bounty` step constraint stopped it reaching the
    // corpus. A wrong entity is worse than a missing one: nothing
    // downstream can tell it from a real page.
    expect(isPlaceholderName('N/A')).toBe(true);
    expect(isPlaceholderName('n/a')).toBe(true);
    expect(isPlaceholderName('N.A.')).toBe(true);
    expect(isPlaceholderName('  Unknown  ')).toBe(true);
    expect(isPlaceholderName('TBA')).toBe(true);
    expect(isPlaceholderName('none')).toBe(true);
    expect(isPlaceholderName('')).toBe(true);
    // Real names must survive, including ones that merely contain a
    // placeholder word.
    expect(isPlaceholderName('Monkey D. Luffy')).toBe(false);
    expect(isPlaceholderName('Nami')).toBe(false);
    expect(isPlaceholderName('None Other Than Zoro')).toBe(false);
    expect(isPlaceholderName('Nana')).toBe(false);
  });

  it('unwraps <nowiki>, keeping what it protects', () => {
    // A real defect, caught on the episode crawl: 41 of 400 titles
    // reached the corpus reading `We are Friends<nowiki>!!</nowiki>`.
    // `<nowiki>` is an escape — the tags go, the text stays.
    expect(cleanValue('We are Friends<nowiki>!!</nowiki>')).toBe('We are Friends!!');
    expect(cleanValue('Chance of Survival: 0%<nowiki>!!</nowiki> Chopper vs Priest Ohm'))
      .toBe('Chance of Survival: 0%!! Chopper vs Priest Ohm');
    // Self-closing and stray closing tags must not survive either.
    expect(cleanValue('A<nowiki/>B')).toBe('AB');
    expect(cleanValue('A</nowiki>B')).toBe('AB');
  });

  it('parses REAL Qref params (chap/ep/sbs/vol) from the Luffy page', async () => {
    const page = await fixture('luffy-excerpt');
    const ids = parseQrefs(page.wikitext).map((q) => q.sourceId);
    expect(ids).toContain('manga-chapter:455');
    expect(ids).toContain('anime-episode:349');
    expect(ids).toContain('manga-chapter:1');
    expect(ids).toContain('anime-episode:4');
    expect(ids).toContain('sbs:volume-37');
    expect(ids).toContain('volume:33');
    // `name=`-only backrefs must NOT emit ids.
    expect(ids.filter((i) => i.includes('undefined'))).toHaveLength(0);
  });

  it('parses loose numbers and dates', () => {
    expect(parseLooseNumber('3,000,000,000')).toBe(3000000000);
    expect(parseLooseNumber('umpteen')).toBeNull();
    expect(parseLooseDate('August 5, 2023')).toBe('2023-08-05');
    expect(parseLooseDate('2022-03-07')).toBe('2022-03-07');
  });
});

describe('chapter mapper (real Chapter Box)', () => {
  it('takes the ordinal from the page title and the title from ename', async () => {
    const page = await fixture('chapter-1044');
    const result = mapChapter(page);
    expect(result).not.toBeNull();
    expect(result?.entity).toMatchObject({
      id: 'manga-chapter:1044',
      type: 'manga-chapter',
      slug: 'chapter-1044',
      properties: {
        number: { value: 1044 },
        title_key: { value_key: 'manga-chapter.1044.title' },
      },
    });
    expect(result?.translations.en['manga-chapter.1044.title']).toBe(
      'Warrior of Liberation',
    );
    // The real infobox has no release date — surfaced, not guessed.
    expect(result?.warnings.some((w) => w.includes('release date'))).toBe(true);
    expect(result?.entity.properties['released_at']).toBeUndefined();
  });

  it('passes the generated Zod gate without released_at (optional since v7), warning kept', async () => {
    const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as {
      MangaChapterData: { safeParse: (v: unknown) => { success: boolean; }; };
    };
    const page = await fixture('chapter-1044');
    const result = mapChapter(page);
    // The real Chapter Box has no release date — the entity must still
    // import (ADR-082); the gap is routed to a warning, not a failure.
    expect(mod.MangaChapterData.safeParse(result?.entity).success).toBe(true);
    expect(result?.warnings.some((w) => w.includes('no release date'))).toBe(true);
    const supplemented = {
      ...result?.entity,
      properties: {
        ...result?.entity.properties,
        released_at: { value: '2022-03-07', territory: 'jp' },
      },
    };
    expect(mod.MangaChapterData.safeParse(supplemented).success).toBe(true);
  });

  it('returns null without an infobox or ordinal', async () => {
    const page = await fixture('chapter-1044');
    expect(mapChapter({ ...page, wikitext: 'just prose' })).toBeNull();
    expect(
      mapChapter({ ...page, title: 'Weird page', wikitext: '{{Chapter Box|jname=x}}' }),
    ).toBeNull();
  });
});

describe('episode mapper (real Episode Box)', () => {
  it('maps # ordinal, Translation title, and surfaces staff as warnings', async () => {
    const page = await fixture('episode-1071');
    const result = mapEpisode(page);
    expect(result).not.toBeNull();
    expect(result?.entity).toMatchObject({
      id: 'anime-episode:1071',
      slug: 'episode-1071',
      properties: {
        number: { value: 1071 },
        title_key: { value_key: 'anime-episode.1071.title' },
      },
    });
    expect(result?.translations.en['anime-episode.1071.title']).toBe(
      "Luffy's Peak - Attained! Gear 5",
    );
    expect(result?.warnings.some((w) => w.startsWith('staff Screen'))).toBe(true);
    // Viewership share must NOT be mapped as tv_rating.
    expect(result?.entity.properties['tv_rating']).toBeUndefined();
  });
});

describe('FandomClient', () => {
  it('builds the parse URL and reads the action=parse envelope via injected fetch', async () => {
    const raw = JSON.stringify({
      parse: { title: 'Chapter 1044', pageid: 42, wikitext: '{{Chapter Box|ename=X}}' },
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
    expect(parsed.pageId).toBe(42);
    expect(parsed.url).toBe('https://onepiece.fandom.com/wiki/Chapter_1044');
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

describe('cleanValue strips inline presentation tags (2026-08-27)', () => {
  it('keeps the text a <s> struck it through', () => {
    // Chapter 597's real title. It reached the home page as literal
    // angle brackets, exactly like the `<nowiki>!!</nowiki>` leak.
    expect(cleanValue('<s>3D</s>2Y')).toBe('3D2Y');
  });

  it('handles attributes and the other inline tags', () => {
    expect(cleanValue('<span class="x">A</span> <b>B</b> <sup>2</sup>')).toBe('A B 2');
  });

  it('leaves an UNEXPECTED tag visible rather than swallowing it', () => {
    // The list is closed on purpose: a tag nobody anticipated should
    // surface in review, not disappear into a plausible-looking title.
    expect(cleanValue('<blink>A</blink>')).toContain('blink');
  });
});

describe('chapter mapper: the fields it was leaving on the table (2026-08-27)', () => {
  const page = (wikitext: string) => ({
    title: 'Chapter 1044',
    pageId: 1,
    wikitext,
    url: 'https://onepiece.fandom.com/wiki/Chapter_1044',
  });

  it('keeps the romanisation OUT of the English file', () => {
    // `rname` used to be the fallback for `en`, which put
    // "Furisosogu Tsuisō no Awayuki" where readers expect the English
    // title. It has its own data locale now (ADR-095).
    const r = mapChapter(page(
      '{{Chapter Box|title=A Light Snow|rname=Furisosogu Tsuisō no Awayuki}}',
    ));
    expect(r?.translations.en['manga-chapter.1044.title']).toBe('A Light Snow');
    expect(r?.translations['ja-latn']?.['manga-chapter.1044.title'])
      .toBe('Furisosogu Tsuisō no Awayuki');
  });

  it('reads a Japanese title out of its Ruby template', () => {
    // The survey shows `jname` filled at 100% and shaped `template`.
    // `cleanValue` drops templates wholesale, so reading it naively
    // turned a full column into an empty one.
    const r = mapChapter(page(
      '{{Chapter Box|title=Monster Time|jname={{Ruby|MONSTER TIME|モンスター タイム}}}}',
    ));
    expect(r?.translations.ja?.['manga-chapter.1044.title']).toBe('MONSTER TIME');
  });

  it('reads `vol`, not only the long spelling that never existed', () => {
    // The mapper asked for `volume`; the real param is `vol`. That is
    // why 1193 imported chapters carried exactly one part-of-volume.
    const r = mapChapter(page('{{Chapter Box|title=X|vol=103}}'));
    expect(r?.entity.relations).toContainEqual({
      type: 'part-of-volume',
      target: 'volume:103',
    });
  });

  it('turns "Episode 280" into the adaptation edge', () => {
    const r = mapChapter(page('{{Chapter Box|title=X|anime=Episode 280}}'));
    expect(r?.entity.relations).toContainEqual({
      type: 'adapted-by',
      target: 'anime-episode:280',
    });
  });

  it('warns rather than guessing when a field will not parse', () => {
    const r = mapChapter(page('{{Chapter Box|title=X|vol=Straw Hat Theater|anime=none}}'));
    expect(r?.entity.relations).toEqual([]);
    expect(r?.warnings.join(' ')).toContain('no usable volume');
    expect(r?.warnings.join(' ')).toContain('no usable episode');
  });

  it('refuses a volume 0 — tankōbon are numbered from 1', () => {
    // This shipped as `manga-chapter:0 → volume:0` and `check:references`
    // caught it: the Strong World prologue is a one-shot belonging to
    // no volume, and a parsed 0 is a placeholder wearing a number.
    //
    // Note the asymmetry with `number`: chapter 0 IS legitimate
    // (ADR-116), which is why the property accepts it. The guard
    // belongs to the volume ordinal, not to zeros in general.
    const r = mapChapter(page('{{Chapter Box|title=X|vol=0|anime=Episode 0}}'));
    expect(r?.entity.relations).toEqual([]);
    expect(r?.warnings.join(' ')).toContain('no usable volume');
    expect(r?.warnings.join(' ')).toContain('no usable episode');
  });

  it('still accepts chapter 0 itself', () => {
    const zero = mapChapter({
      title: 'Chapter 0',
      pageId: 1,
      wikitext: '{{Chapter Box|title=Strong World}}',
      url: 'https://onepiece.fandom.com/wiki/Chapter_0',
    });
    expect(zero?.entity.id).toBe('manga-chapter:0');
    expect(zero?.entity.properties['number']).toEqual({ value: 0 });
  });
});
