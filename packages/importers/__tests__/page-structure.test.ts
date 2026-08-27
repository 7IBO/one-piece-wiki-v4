/**
 * Page structure survey: the non-infobox half of a Fandom page —
 * sections, wikitables (rows!) and `{{Qref}}` source citations.
 */
import { describe, expect, it } from 'bun:test';
import {
  aggregateStructures,
  countQrefs,
  parseSections,
  parseWikitables,
  surveyPage,
} from '../src/fandom/page-structure.ts';

const CHAPTER_LIST = `
{| class="wikitable"
! Chapter !! Title !! Release
|-
| 1044 || [[Chapter 1044|Bounty]] || January 4, 2022
|-
| 1045 || Gear 5 || January 17, 2022
|-
| 1046 || The Drums of Liberation || January 24, 2022
|}
`;

describe('parseSections', () => {
  it('reads headings with their level, in document order', () => {
    const wikitext = '== History ==\nprose\n=== Post-Timeskip ===\nmore\n== Abilities ==\n';
    expect(parseSections(wikitext)).toEqual([
      { level: 2, text: 'History' },
      { level: 3, text: 'Post-Timeskip' },
      { level: 2, text: 'Abilities' },
    ]);
  });

  it('strips markup so the same heading aggregates as one', () => {
    expect(parseSections("== ''Abilities'' and [[Haki|Powers]] ==")).toEqual([
      { level: 2, text: 'Abilities and Powers' },
    ]);
  });

  it('ignores unbalanced or empty headings', () => {
    expect(parseSections('== Broken\n==  ==\ntext')).toEqual([]);
  });
});

describe('parseWikitables', () => {
  it('reads column headers and counts data rows, last row included', () => {
    // The last row has no trailing `|-`; a naive counter loses it.
    expect(parseWikitables(CHAPTER_LIST)).toEqual([
      { headers: ['Chapter', 'Title', 'Release'], rows: 3 },
    ]);
  });

  it('handles one-header-per-line tables', () => {
    const wikitext = '{|\n! Episode\n! Air date\n|-\n| 1071 || July 2023\n|}';
    expect(parseWikitables(wikitext)).toEqual([
      { headers: ['Episode', 'Air date'], rows: 1 },
    ]);
  });

  it('counts a nested table as part of its parent, not as a second table', () => {
    const wikitext = '{|\n! A\n|-\n| {|\n! Inner\n|-\n| x\n|}\n|}';
    expect(parseWikitables(wikitext).length).toBe(1);
  });

  it('surveys several tables on one page independently', () => {
    expect(parseWikitables(`${CHAPTER_LIST}\n{|\n! Cast\n|-\n| Mayumi Tanaka\n|}`)).toEqual([
      { headers: ['Chapter', 'Title', 'Release'], rows: 3 },
      { headers: ['Cast'], rows: 1 },
    ]);
  });

  it('returns nothing for a page with no tables', () => {
    expect(parseWikitables('just prose with a [[link]]')).toEqual([]);
  });
});

describe('countQrefs', () => {
  it('counts the per-source citation anchors', () => {
    expect(countQrefs('{{Qref|chap=1|ep=1}} text {{qref|chap=1044}} {{Other}}')).toBe(2);
  });
});

describe('surveyPage + aggregateStructures', () => {
  it('merges per-page surveys into the per-entity-kind picture', () => {
    const a = surveyPage(`== History ==\n{{Qref|chap=1}}\n${CHAPTER_LIST}`);
    const b = surveyPage(`== History ==\n== Trivia ==\n{{Qref|chap=2}}{{Qref|chap=3}}`);

    const agg = aggregateStructures([a, b]);
    expect(agg.pages).toBe(2);
    // "History" is on both pages, "Trivia" on one — that ranking is the
    // point: it says which sections are worth writing a parser for.
    expect(agg.headings).toEqual([
      { text: 'History', pages: 2 },
      { text: 'Trivia', pages: 1 },
    ]);
    expect(agg.tables).toEqual([
      { headers: ['Chapter', 'Title', 'Release'], tables: 1, rows: 3 },
    ]);
    expect(agg.qrefsPerPage).toBe(1.5);
  });

  it('counts a heading once per page even when it repeats', () => {
    const page = surveyPage('== History ==\ntext\n== History ==\nmore');
    expect(aggregateStructures([page]).headings).toEqual([{ text: 'History', pages: 1 }]);
  });

  it('sums rows across pages sharing a table signature', () => {
    const agg = aggregateStructures([surveyPage(CHAPTER_LIST), surveyPage(CHAPTER_LIST)]);
    expect(agg.tables[0]).toEqual({
      headers: ['Chapter', 'Title', 'Release'],
      tables: 2,
      rows: 6,
    });
  });

  it('survives an empty sample without dividing by zero', () => {
    const agg = aggregateStructures([]);
    expect(agg).toEqual({
      pages: 0,
      headings: [],
      tables: [],
      qrefsPerPage: 0,
      wikilinksPerPage: 0,
    });
  });
});
