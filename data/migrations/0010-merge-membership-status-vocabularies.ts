import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-099 — single-home pass 2, vocabulary merge (audit V4,
 * `/docs/audits/2026-08-09-catalogue-redundancy.md`).
 *
 * `loyalty-statuses` (member-of) and `membership-statuses`
 * (member-state-of) were two drifting vocabularies for one concept —
 * the state of a membership. They are merged into ONE
 * `membership-statuses` vocabulary (founder, member, honorary,
 * observer, undercover, former_member, defected, traitor, erased);
 * `member-of.loyalty_status` now points at it and `loyalty-statuses`
 * is deleted.
 *
 * Data transform: the spelling `founding_member` (old
 * membership-statuses) unifies to `founder` on any relation qualifier
 * (`loyalty_status` / `membership_status`). The dropped values are
 * ASSERTED unused (0 uses verified 2026-08-09):
 * - `presumed_dead_member` — the epistemic model's job
 *   (`status: presumed_dead` on the member).
 * - `allied` — an `ally-of` edge (already removed by 0008; re-checked
 *   here because the value is now gone from the merged vocabulary).
 */
const STATUS_QUALIFIERS = ['loyalty_status', 'membership_status'] as const;
const DROPPED_VALUES = ['presumed_dead_member', 'allied'] as const;

const migration: Migration = {
  id: '0010-merge-membership-status-vocabularies',
  description:
    'Unify membership-status qualifier spellings (founding_member -> founder) and assert the dropped values (presumed_dead_member, allied) are unused (ADR-099).',
  up: (data) => {
    const relations = data['relations'];
    if (!Array.isArray(relations)) return data;

    let needsRewrite = false;
    for (const rel of relations) {
      if (rel === null || typeof rel !== 'object' || Array.isArray(rel)) continue;
      const qualifiers = (rel as Record<string, unknown>)['qualifiers'];
      if (qualifiers === null || typeof qualifiers !== 'object' || Array.isArray(qualifiers)) {
        continue;
      }
      for (const qualifier of STATUS_QUALIFIERS) {
        const value = (qualifiers as Record<string, unknown>)[qualifier];
        if (typeof value !== 'string') continue;
        if ((DROPPED_VALUES as readonly string[]).includes(value)) {
          throw new Error(
            `${
              String(data['id'])
            }: qualifier "${qualifier}" uses removed membership-status value "${value}" — re-home it (presumed_dead_member -> member status: presumed_dead; allied -> ally-of edge) before migrating (ADR-099).`,
          );
        }
        if (value === 'founding_member') needsRewrite = true;
      }
    }
    if (!needsRewrite) return data;

    const cloned = structuredClone(data);
    for (const rel of cloned['relations'] as unknown[]) {
      if (rel === null || typeof rel !== 'object' || Array.isArray(rel)) continue;
      const qualifiers = (rel as Record<string, unknown>)['qualifiers'];
      if (qualifiers === null || typeof qualifiers !== 'object' || Array.isArray(qualifiers)) {
        continue;
      }
      for (const qualifier of STATUS_QUALIFIERS) {
        if ((qualifiers as Record<string, unknown>)[qualifier] === 'founding_member') {
          (qualifiers as Record<string, unknown>)[qualifier] = 'founder';
        }
      }
    }
    return cloned;
  },
};

export default migration;
