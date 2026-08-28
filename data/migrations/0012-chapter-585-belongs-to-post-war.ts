import type { EntityData, Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * Chapter 585 carried TWO arcs: `arc:marineford` and `arc:post-war`.
 *
 * Unlike the East Blue case (see STATE.md), this is not two
 * granularities of the same truth — it is a contradiction, and the
 * source settles it:
 *
 *   arc:marineford  arc_number 22, 65 chapters
 *   arc:post-war    arc_number 23, 19 chapters
 *
 * The arc-edge pass (ADR-119) plans CLOSED ranges opening-chapter
 * first, so if Fandom's Marineford range had covered 585 it would
 * have claimed it before Post-War ever ran. It did not: Post-War got
 * it. The `arc:marineford` edge is a hand-seeded leftover from before
 * the corpus knew where the boundary was.
 *
 * WHAT THIS DROPS: one relation, on one chapter, contradicted by the
 * source that produced its neighbour. Nothing else on 585 is touched.
 */
const CHAPTER = 'manga-chapter:585';
const WRONG = 'arc:marineford';

const migration: Migration = {
  id: '0012-chapter-585-belongs-to-post-war',
  description:
    'Drop the hand-seeded `part-of-arc → arc:marineford` on chapter 585; the source places it in Post-War.',
  up: (data: EntityData): EntityData | null => {
    if ((data as { id?: string; }).id !== CHAPTER) return data;
    const relations = (data as { relations?: readonly { type: string; target: string; }[]; })
      .relations;
    if (relations === undefined) return data;
    const next = relations.filter(
      (relation) => !(relation.type === 'part-of-arc' && relation.target === WRONG),
    );
    return next.length === relations.length ? data : { ...data, relations: next };
  },
};

export default migration;
