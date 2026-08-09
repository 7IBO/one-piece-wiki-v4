import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-099 — single-home pass 2, removals (audit R4bis/R6/R7/R8/P1,
 * `/docs/audits/2026-08-09-catalogue-redundancy.md`).
 *
 * Removed from the catalogue, all **0 edges / 0 entries in the corpus**
 * (verified 2026-08-09):
 *
 * - `led-by` (crew/org→character): leadership is a membership function —
 *   `member-of{role: leader|captain}` is the single home (`crew-roles`
 *   gained `leader`).
 * - `captains` (character→ship): ship↔people routes through the crew
 *   (`crewed-by` + member roles).
 * - `introduces-character` (source→character): first appearance is
 *   DERIVED from the earliest `features` edge (ADR-091 presentation /
 *   ADR-034 inference backlog).
 * - `awakening-of` (technique→devil-fruit): vestigial since the ADR-058
 *   transformation model.
 * - `total_bounty` (crew property): derived from active members' latest
 *   visible bounties in the presentation layer; never stored.
 *
 * Like 0008, instead of silently dropping data this migration ASSERTS
 * the zero-usage invariant: replaying against a corpus that DOES use a
 * removed shape fails loudly so the data can be re-homed by hand
 * (led-by/captains → member-of roles; introduces-character → features;
 * awakening-of → transformation + form-of; total_bounty → derived).
 */
const REMOVED_RELATION_TYPES = [
  'led-by',
  'captains',
  'introduces-character',
  'awakening-of',
] as const;

const migration: Migration = {
  id: '0009-single-home-removals',
  description:
    'Assert the removed relation types (led-by, captains, introduces-character, awakening-of) and the removed crew total_bounty property are unused (ADR-099).',
  up: (data) => {
    const relations = data['relations'];
    if (Array.isArray(relations)) {
      for (const rel of relations) {
        if (rel === null || typeof rel !== 'object' || Array.isArray(rel)) continue;
        const type = (rel as Record<string, unknown>)['type'];
        if (
          typeof type === 'string' && (REMOVED_RELATION_TYPES as readonly string[]).includes(type)
        ) {
          throw new Error(
            `${
              String(data['id'])
            }: relation type "${type}" was removed by ADR-099 — re-home the edge (member-of roles / features / transformation model) before migrating.`,
          );
        }
      }
    }

    const properties = data['properties'];
    if (
      properties !== null && typeof properties === 'object' && !Array.isArray(properties)
      && (properties as Record<string, unknown>)['total_bounty'] !== undefined
    ) {
      throw new Error(
        `${
          String(data['id'])
        }: property "total_bounty" was removed by ADR-099 — the crew total is derived from member bounties; delete the entries before migrating.`,
      );
    }

    return data;
  },
};

export default migration;
