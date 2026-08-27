/**
 * The rendered chapter substrate (ADR-119 applied to chapters).
 *
 * Every fixture here is a SLICE of a page captured by
 * `fandom-render.yml`, cut out of the real response. That is the
 * whole point: the arc mapper's first fixture was invented, and an
 * invented fixture only proves the parser agrees with the invention —
 * which is how an arc import returned 0 relations while looking fine.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  type ChapterEnrichment,
  enrichChapterFromRendered,
  isSeededChapterTitle,
  parseAdaptedEpisodes,
  stripFurigana,
} from '../src/fandom/chapter-rendered.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'rendered');

async function enrich(name: string): Promise<ChapterEnrichment> {
  const html = await Bun.file(join(FIXTURES, `${name}.infobox.html`)).text();
  const result = enrichChapterFromRendered(html);
  if (result === null) throw new Error(`no enrichment for ${name}`);
  return result;
}

describe('enrichChapterFromRendered — real captures', () => {
  it('reads the four fields the wikitext substrate never delivered', async () => {
    // Measured before this existed: part-of-volume 1/1193,
    // adapted-by 0/1193, released_at 10/1193 (all hand-seeded).
    const ch = await enrich('Chapter_1044');
    expect(ch.number).toBe(1044);
    expect(ch.relations).toEqual([
      { type: 'part-of-volume', target: 'volume:103' },
      { type: 'adapted-by', target: 'anime-episode:1071' },
    ]);
    expect(ch.properties).toEqual({
      page_count: { value: 17 },
      released_at: { value: '2022-03-28', territory: 'jp' },
    });
  });

  it('carries the real title in all three locales', async () => {
    const ch = await enrich('Chapter_1044');
    expect(ch.translations['en']).toEqual({
      'manga-chapter.1044.title': 'Warrior of Liberation',
    });
    expect(ch.translations['ja']).toEqual({ 'manga-chapter.1044.title': '解放の戦士' });
    expect(ch.translations['ja-latn']).toEqual({
      'manga-chapter.1044.title': 'Kaihō no Senshi',
    });
  });

  it('emits every episode a chapter was adapted into, not just the first', async () => {
    // 909 spans two episodes: "Episode 890 (p. 2-7) Episode 892 (p. 8-17)".
    const ch = await enrich('Chapter_909');
    expect(ch.relations.filter((r) => r.type === 'adapted-by')).toEqual([
      { type: 'adapted-by', target: 'anime-episode:890' },
      { type: 'adapted-by', target: 'anime-episode:892' },
    ]);
  });

  it('keeps openings and TV specials out of the episode edges', async () => {
    // Chapter 1's anime field names six things; three are not
    // episodes ("We Are!", "Episode of Luffy", "Episode of East Blue").
    const ch = await enrich('Chapter_1');
    expect(ch.relations.filter((r) => r.type === 'adapted-by').map((r) => r.target)).toEqual([
      'anime-episode:4',
      'anime-episode:504',
      'anime-episode:878',
    ]);
    expect(ch.relations).toContainEqual({ type: 'part-of-volume', target: 'volume:1' });
  });

  it('drops the furigana reading from the Japanese title', async () => {
    // Chapter 1 renders its ruby as `BASE （ READING ） —suffix—`.
    const ch = await enrich('Chapter_1');
    expect(ch.translations['ja']?.['manga-chapter.1.title']).toBe('ROMANCE DAWN —冒険の夜明け—');
    expect(ch.translations['en']?.['manga-chapter.1.title']).toBe('Romance Dawn');
  });

  it('strips the footnote marker before parsing the date', async () => {
    // Chapter 1 and 500 render "July 19, 1997 [ref]"; `new Date`
    // reads the whole string and would return Invalid Date.
    const first = await enrich('Chapter_1');
    expect(first.properties['released_at']).toEqual({ value: '1997-07-19', territory: 'jp' });
    const five = await enrich('Chapter_500');
    expect(five.properties['released_at']).toEqual({ value: '2008-05-26', territory: 'jp' });
  });

  it('reads a chapter with no hand-seeded counterpart at all', async () => {
    const ch = await enrich('Chapter_1131');
    expect(ch.number).toBe(1131);
    expect(ch.relations).toContainEqual({ type: 'part-of-volume', target: 'volume:111' });
    expect(ch.properties['released_at']).toEqual({ value: '2024-11-11', territory: 'jp' });
    expect(ch.warnings).toEqual([]);
  });

  it('every fixture yields a volume, a date, a page count and an episode', async () => {
    // The claim that justifies the whole substrate switch: it is not
    // one lucky page.
    for (
      const name of ['Chapter_1', 'Chapter_500', 'Chapter_909', 'Chapter_1044', 'Chapter_1131']
    ) {
      const ch = await enrich(name);
      expect(ch.relations.some((r) => r.type === 'part-of-volume')).toBe(true);
      expect(ch.relations.some((r) => r.type === 'adapted-by')).toBe(true);
      expect(ch.properties['released_at']).toBeDefined();
      expect(ch.properties['page_count']).toBeDefined();
      expect(ch.translations['en']).toBeDefined();
    }
  });

  it('returns null for html carrying no chapter infobox', () => {
    expect(enrichChapterFromRendered('<p>nothing here</p>')).toBeNull();
  });
});

describe('parseAdaptedEpisodes', () => {
  it('ignores a named adaptation with no number', () => {
    expect(parseAdaptedEpisodes('Episode of Luffy (p. 4-47)')).toEqual([]);
  });

  it('does not repeat an episode named twice', () => {
    expect(parseAdaptedEpisodes('Episode 4 (p. 1-2) Episode 4 (p. 9)')).toEqual([4]);
  });

  it('rejects episode 0 — episodes are numbered from 1', () => {
    expect(parseAdaptedEpisodes('Episode 0 (p. 1)')).toEqual([]);
  });
});

describe('stripFurigana', () => {
  it('leaves a title with no reading untouched', () => {
    expect(stripFurigana('解放の戦士')).toBe('解放の戦士');
  });

  it('removes the parenthetical reading and collapses the gap', () => {
    expect(stripFurigana('ROMANCE DAWN （ ロマンスドーン ） —冒険の夜明け—')).toBe(
      'ROMANCE DAWN —冒険の夜明け—',
    );
  });
});

describe('isSeededChapterTitle', () => {
  it('recognises the seed the project wrote for itself', () => {
    expect(isSeededChapterTitle(1044, 'Chapter 1044')).toBe(true);
    expect(isSeededChapterTitle(1044, '  chapter 1044 ')).toBe(true);
  });

  it('leaves a real title alone, including one starting with the word', () => {
    expect(isSeededChapterTitle(1044, 'Warrior of Liberation')).toBe(false);
    expect(isSeededChapterTitle(1044, 'Chapter 1044 of the Saga')).toBe(false);
    // A different chapter's seed is not THIS chapter's seed.
    expect(isSeededChapterTitle(1044, 'Chapter 1045')).toBe(false);
  });
});
