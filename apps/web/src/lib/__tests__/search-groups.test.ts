/**
 * The palette's grouping rules — ranking preservation and the
 * counting rule (a chip counts what is on screen, never the corpus).
 */
import { describe, expect, it } from 'bun:test';
import type { SearchResultView } from '../../api';
import { groupByType, visibleResults } from '../search-groups';

function result(id: string, type: string, typeLabel: string): SearchResultView {
  return {
    id,
    type,
    typeLabel,
    slug: id,
    name: id,
    matched: null,
    matchedLabel: null,
    secondary: null,
    tag: null,
    image: null,
  };
}

const ranked: readonly SearchResultView[] = [
  result('gomu-gomu', 'devil-fruit', 'Fruits du Démon'),
  result('luffy', 'character', 'Personnages'),
  result('nika', 'character', 'Personnages'),
  result('hito-hito', 'devil-fruit', 'Fruits du Démon'),
  result('1044', 'manga-chapter', 'Chapitres'),
];

describe('groupByType', () => {
  it('orders groups by where their BEST result ranked', () => {
    // The top hit is a fruit, so "Fruits du Démon" heads the list even
    // though characters contribute more rows.
    expect(groupByType(ranked).map((g) => g.type)).toEqual([
      'devil-fruit',
      'character',
      'manga-chapter',
    ]);
  });

  it('keeps every result and preserves order inside a group', () => {
    const groups = groupByType(ranked);
    expect(groups.flatMap((g) => g.results.map((r) => r.id))).toEqual([
      'gomu-gomu',
      'hito-hito',
      'luffy',
      'nika',
      '1044',
    ]);
  });

  it('counts only what it was given — the gate already ran in SQL', () => {
    // Two of the five were withheld upstream. The chip must read 1,
    // not 2: "how many exist" is exactly the number a spoiler-aware
    // wiki must never print.
    const gated = ranked.filter((r) => r.id === 'gomu-gomu' || r.id === 'luffy');
    const groups = groupByType(gated);
    expect(groups.map((g) => [g.type, g.results.length])).toEqual([
      ['devil-fruit', 1],
      ['character', 1],
    ]);
  });

  it('is empty for no results', () => {
    expect(groupByType([])).toEqual([]);
  });
});

describe('visibleResults', () => {
  it('narrows to one type without reordering', () => {
    expect(visibleResults(ranked, 'character', 24).map((r) => r.id)).toEqual(['luffy', 'nika']);
  });

  it('caps the rendered rows', () => {
    expect(visibleResults(ranked, null, 2).map((r) => r.id)).toEqual(['gomu-gomu', 'luffy']);
  });

  it('returns everything when no chip is active', () => {
    expect(visibleResults(ranked, null, 24)).toHaveLength(5);
  });
});
