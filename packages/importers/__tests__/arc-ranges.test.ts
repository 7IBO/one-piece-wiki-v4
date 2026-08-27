/**
 * Planning `part-of-arc` edges from the rendered arc ranges
 * (ADR-119 + ADR-033).
 */
import { describe, expect, it } from 'bun:test';
import { type ArcSpans, findOverlaps, orderArcs, planArcEdges } from '../src/fandom/arc-ranges.ts';

const arabasta: ArcSpans = {
  arcId: 'arc:arabasta',
  page: 'Arabasta Arc',
  chapters: { from: 155, to: 157 },
  episodes: { from: 92, to: 93 },
};
const romanceDawn: ArcSpans = {
  arcId: 'arc:romance-dawn',
  page: 'Romance Dawn Arc',
  chapters: { from: 1, to: 2 },
  episodes: null,
};
/** An anime-only filler arc: episodes, no place on the manga axis. */
const filler: ArcSpans = {
  arcId: 'arc:warship-island',
  page: 'Warship Island Arc',
  chapters: null,
  episodes: { from: 54, to: 55 },
};

describe('orderArcs', () => {
  it('orders by where each arc STARTS in the manga', () => {
    expect(orderArcs([arabasta, romanceDawn])).toEqual([
      { arcId: 'arc:romance-dawn', arcNumber: 1 },
      { arcId: 'arc:arabasta', arcNumber: 2 },
    ]);
  });

  it('gives no number to an arc with no place on that axis', () => {
    // A filler arc genuinely has no manga position. Inventing one
    // would put it between two arcs it never sat between.
    expect(orderArcs([romanceDawn, filler]).map((a) => a.arcId))
      .toEqual(['arc:romance-dawn']);
  });

  it('is deterministic when two arcs open on the same chapter', () => {
    const a = { ...romanceDawn, arcId: 'arc:b' };
    const b = { ...romanceDawn, arcId: 'arc:a' };
    expect(orderArcs([a, b]).map((x) => x.arcId)).toEqual(['arc:a', 'arc:b']);
  });
});

describe('planArcEdges', () => {
  const corpus = {
    chapters: new Set([1, 2, 155, 156]), // 157 not imported yet
    episodes: new Set([92, 93]),
  };

  it('writes an edge only for a source the corpus actually holds', () => {
    // 155-157 is three chapters; the corpus has two of them. A
    // relation pointing at a missing entity is what check:references
    // refuses — rightly, it would claim something the wiki cannot show.
    const edges = planArcEdges([arabasta], corpus);
    expect(edges.map((e) => e.sourceId)).toEqual([
      'manga-chapter:155',
      'manga-chapter:156',
      'anime-episode:92',
      'anime-episode:93',
    ]);
  });

  it('covers both axes from one arc', () => {
    const edges = planArcEdges([arabasta], corpus);
    expect(edges.every((e) => e.arcId === 'arc:arabasta')).toBe(true);
  });

  it('gives a contested chapter to ONE arc, never two', () => {
    // Fandom's own ranges are not disjoint: a cover-story arc can run
    // beside a main one and claim the same chapters.
    const cover = { ...arabasta, arcId: 'arc:cover', chapters: { from: 155, to: 155 } };
    const edges = planArcEdges([arabasta, cover], corpus);
    const forCh155 = edges.filter((e) => e.sourceId === 'manga-chapter:155');
    expect(forCh155).toHaveLength(1);
    expect(forCh155[0]?.arcId).toBe('arc:arabasta');
  });

  it('plans nothing from an arc with no ranges at all', () => {
    expect(planArcEdges([{ ...filler, episodes: null }], corpus)).toEqual([]);
  });
});

describe('findOverlaps', () => {
  it('reports a contested source rather than silently dropping it', () => {
    // The edge planner has to pick one; the run must still say that a
    // choice was made, or a data problem stays invisible.
    const corpus = { chapters: new Set([155]), episodes: new Set<number>() };
    const cover = { ...arabasta, arcId: 'arc:cover', chapters: { from: 155, to: 155 } };
    expect(findOverlaps([arabasta, cover], corpus)).toEqual([
      { sourceId: 'manga-chapter:155', arcIds: ['arc:arabasta', 'arc:cover'] },
    ]);
  });

  it('is silent when the ranges are disjoint', () => {
    const corpus = { chapters: new Set([1, 155]), episodes: new Set<number>() };
    expect(findOverlaps([arabasta, romanceDawn], corpus)).toEqual([]);
  });
});

describe('the ongoing arc — an open range (2026-08-27)', () => {
  // Elbaph renders `1126-`: it has no last chapter because it has not
  // ended. `parseOrdinalRange` used to return null for that, so
  // `arc:elbaph` got 0 edges and chapters 1126-1131 carried no arc at
  // all — the arc a reader is CURRENTLY reading was the one arc the
  // wiki could never place.
  const egghead: ArcSpans = {
    arcId: 'arc:egghead',
    page: 'Egghead Arc',
    chapters: { from: 1058, to: 1125 },
    episodes: null,
  };
  const elbaph: ArcSpans = {
    arcId: 'arc:elbaph',
    page: 'Elbaph Arc',
    chapters: { from: 1126, to: null },
    episodes: null,
  };
  const corpus = {
    chapters: new Set([1058, 1125, 1126, 1128, 1131]),
    episodes: new Set<number>(),
  };

  it('claims every chapter the corpus holds from its start on', () => {
    expect(planArcEdges([elbaph], corpus)).toEqual([
      { sourceId: 'manga-chapter:1126', arcId: 'arc:elbaph' },
      { sourceId: 'manga-chapter:1128', arcId: 'arc:elbaph' },
      { sourceId: 'manga-chapter:1131', arcId: 'arc:elbaph' },
    ]);
  });

  it('invents nothing: a gap in the corpus stays a gap', () => {
    // 1127, 1129 and 1130 are not imported. An open range must not
    // turn "everything after 1126" into edges for chapters that do
    // not exist.
    const edges = planArcEdges([elbaph], corpus);
    expect(edges.map((e) => e.sourceId)).not.toContain('manga-chapter:1127');
  });

  it('LOSES to a closed arc, whatever order the spans arrive in', () => {
    // The load-bearing one. An unbounded claim run first would
    // swallow Egghead's chapters on the "first arc wins" rule.
    for (const spans of [[elbaph, egghead], [egghead, elbaph]]) {
      const byChapter = new Map(
        planArcEdges(spans, corpus).map((e) => [e.sourceId, e.arcId]),
      );
      expect(byChapter.get('manga-chapter:1058')).toBe('arc:egghead');
      expect(byChapter.get('manga-chapter:1125')).toBe('arc:egghead');
      expect(byChapter.get('manga-chapter:1126')).toBe('arc:elbaph');
      expect(byChapter.get('manga-chapter:1131')).toBe('arc:elbaph');
    }
  });

  it('takes its place in the arc ordering like any other', () => {
    expect(orderArcs([elbaph, egghead]).map((a) => a.arcId))
      .toEqual(['arc:egghead', 'arc:elbaph']);
  });

  it('reports a real overlap rather than hiding it', () => {
    const greedy: ArcSpans = { ...elbaph, chapters: { from: 1058, to: null } };
    const clash = findOverlaps([egghead, greedy], corpus);
    expect(clash.map((c) => c.sourceId)).toContain('manga-chapter:1058');
  });
});
