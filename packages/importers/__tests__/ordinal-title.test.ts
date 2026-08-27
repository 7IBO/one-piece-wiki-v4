/**
 * Ordinal titles and crawl ordering — the two guards added after the
 * 2026-08-07 `Episodes` run imported eight "Special Edited Version"
 * recap pages as `anime-episode:1..8`.
 */
import { describe, expect, it } from 'bun:test';
import { mapChapter } from '../src/fandom/chapter.ts';
import { mapEpisode } from '../src/fandom/episode.ts';
import { orderCrawlQueue, readOrdinalTitle } from '../src/fandom/ordinal-title.ts';
import { mapVolume } from '../src/fandom/volume.ts';

describe('readOrdinalTitle', () => {
  it('accepts the canonical form only', () => {
    expect(readOrdinalTitle('Episode', 'Episode 1071')).toEqual({
      kind: 'canonical',
      ordinal: 1071,
    });
    // Case-insensitive on the noun, tolerant of surrounding whitespace.
    expect(readOrdinalTitle('Chapter', '  chapter 1044 ')).toEqual({
      kind: 'canonical',
      ordinal: 1044,
    });
  });

  it('classifies a parenthesised qualifier as a variant, keeping the ordinal', () => {
    expect(readOrdinalTitle('Episode', 'Episode 1 (Special Edited Version)')).toEqual({
      kind: 'variant',
      ordinal: 1,
      qualifier: 'Special Edited Version',
    });
    expect(readOrdinalTitle('Chapter', 'Chapter 1(Digital Colored)')).toEqual({
      kind: 'variant',
      ordinal: 1,
      qualifier: 'Digital Colored',
    });
  });

  it('leaves anything else to the infobox fallback', () => {
    for (const title of ['Monkey D. Luffy', 'Episode', 'Episodes', 'Episode Guide', 'Volume A']) {
      expect(readOrdinalTitle('Episode', title).kind).toBe('other');
    }
    // A different noun must not match.
    expect(readOrdinalTitle('Episode', 'Chapter 1044').kind).toBe('other');
  });

  it('reads the noun strictly — a plural or a bare noun is not an ordinal', () => {
    expect(readOrdinalTitle('Volume', 'Volume 12').kind).toBe('canonical');
    expect(readOrdinalTitle('Volume', 'Volumes').kind).toBe('other');
    expect(readOrdinalTitle('Volume', 'Volume 12 (Reprint)').kind).toBe('variant');
  });
});

describe('ordinal mappers refuse variant pages', () => {
  const page = (title: string, wikitext: string) => ({ title, pageId: 1, wikitext });

  it('does not let a recap re-edit claim anime-episode:N (the 2026-08-07 regression)', () => {
    // The real page: the Episode Box carries #=1, so before the guard
    // the title regex missed and the infobox fallback produced
    // `anime-episode:1` from a recap special.
    const box = "{{Episode Box|#=1|Translation=I'm Luffy!}}";
    expect(mapEpisode(page('Episode 1 (Special Edited Version)', box))).toBeNull();
    // The canonical page still maps.
    expect(mapEpisode(page('Episode 1', box))?.entity.id).toBe('anime-episode:1');
  });

  it('applies the same rule to chapters and volumes', () => {
    const chapterBox = '{{Chapter Box|chapter=1}}';
    expect(mapChapter(page('Chapter 1 (Digital Colored)', chapterBox))).toBeNull();
    expect(mapChapter(page('Chapter 1', chapterBox))?.entity.id).toBe('manga-chapter:1');

    const volumeBox = '{{Volume Box|volume=12}}';
    expect(mapVolume(page('Volume 12 (Reprint)', volumeBox))).toBeNull();
    expect(mapVolume(page('Volume 12', volumeBox))?.entity.id).toBe('volume:12');
  });
});

describe('orderCrawlQueue', () => {
  it('puts canonical ordinals first, in numeric order, variants last', () => {
    // Deliberately shuffled, and with the string-sort trap (10 < 9).
    const input = [
      'Episode 2 (Special Edited Version)',
      'Episode 10',
      'Episode 1 (Special Edited Version)',
      'Episode 9',
      'Episode 1',
    ];
    expect(orderCrawlQueue(input)).toEqual([
      'Episode 1',
      'Episode 9',
      'Episode 10',
      'Episode 1 (Special Edited Version)',
      'Episode 2 (Special Edited Version)',
    ]);
  });

  it('degrades to alphabetical order for categories with no ordinals', () => {
    expect(orderCrawlQueue(['Zoro', 'Nami', 'Brook'])).toEqual(['Brook', 'Nami', 'Zoro']);
  });

  it('sorts ordinal-bearing titles ahead of plain ones, and is stable and total', () => {
    const input = ['Straw Hat Pirates', 'Chapter 3', 'Going Merry', 'Chapter 1'];
    expect(orderCrawlQueue(input)).toEqual([
      'Chapter 1',
      'Chapter 3',
      'Going Merry',
      'Straw Hat Pirates',
    ]);
    // Ordering the result again is a no-op (idempotent).
    expect(orderCrawlQueue(orderCrawlQueue(input))).toEqual(orderCrawlQueue(input));
  });

  it("leaves the caller's array untouched", () => {
    const input = ['Episode 2', 'Episode 1'];
    orderCrawlQueue(input);
    expect(input).toEqual(['Episode 2', 'Episode 1']);
  });
});
