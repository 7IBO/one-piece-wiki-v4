import type { EntityData, Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * Two entities described one arc.
 *
 * `arc:wano` was hand-seeded early — a stub with a name, a `since` of
 * `manga-chapter:1043`, and no relations. `arc:wano-country` came from
 * the Fandom arc page, carries `arc_number: 31`, and the arc-edge pass
 * (ADR-119) gave it **149 chapters**. Both were real entities; both
 * were the Wano arc.
 *
 * Nothing detected it until a chapter page was actually looked at:
 * chapter 1044 showed "PART OF ARC / WANO COUNTRY" above a ribbon of
 * exactly two chapters, because it carried BOTH edges and the ribbon
 * rendered the one with almost no members. `mergeEntity` was right to
 * union the two relations — it cannot know two ids name the same
 * thing — so the duplicate has to be resolved here, in the data.
 *
 * `arc:wano-country` wins: it is the id the source names, it carries
 * the ordering, and it holds 149 chapters against 3.
 *
 * WHAT THIS DROPS, said plainly: the stub's `since:
 * manga-chapter:1043` on the arc name. That claim was hand-authored
 * and wrong — Wano opens around chapter 909, which is what the 149
 * edges now say. A `since` worth keeping would have to be re-derived,
 * not carried over from a stub that contradicts it.
 */
const OLD = 'arc:wano';
const NEW = 'arc:wano-country';

const migration: Migration = {
  id: '0011-merge-duplicate-wano-arc',
  description:
    'Merge the hand-seeded `arc:wano` stub into `arc:wano-country`, which the source names and which holds 149 chapters.',
  up: (data: EntityData): EntityData | null => {
    // The stub itself goes.
    if ((data as { id?: string; }).id === OLD) return null;

    const relations = (data as { relations?: readonly { type: string; target: string; }[]; })
      .relations;
    if (relations === undefined) return data;
    let touched = false;
    const seen = new Set<string>();
    const next: { type: string; target: string; }[] = [];
    for (const relation of relations) {
      const target = relation.target === OLD ? NEW : relation.target;
      if (target !== relation.target) touched = true;
      // Retargeting can COLLIDE with an edge already pointing at the
      // winner — chapter 1044 carried both — so dedupe on the way out
      // rather than leaving the same arc listed twice.
      const key = `${relation.type} ${target}`;
      if (seen.has(key)) {
        touched = true;
        continue;
      }
      seen.add(key);
      next.push({ ...relation, target });
    }
    return touched ? { ...data, relations: next } : data;
  },
};

export default migration;
