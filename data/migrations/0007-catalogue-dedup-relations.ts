import { type Migration, removeRelationType } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-098 — catalogue dedup pass, relation removals (audit R1–R4,
 * `/docs/audits/2026-08-09-catalogue-redundancy.md`).
 *
 * - `captained-by` (crew→character) removed: a crew's captain is the
 *   incoming `member-of{role: captain}` edge (ADR-086 materialized
 *   inverses + ADR-097 incoming-edge manager cover read/edit).
 *   **0 edges in the corpus** (verified 2026-08-09) — no-op here.
 * - `pilots` (character→ship) removed: ≡ `member-of{role: helmsman}`
 *   composed with `crewed-by`. **0 edges** — no-op here.
 * - `caused-death-of` (event→character) folded into
 *   `participant{outcome: killed}`: each edge is rewritten to a
 *   `participant` edge with `outcome: "killed"`, merged into an
 *   existing `participant` edge toward the same target when one is
 *   present (existing qualifiers win; only a missing `outcome` is
 *   filled in). The single real edge — `event:battle-of-marineford`
 *   → `character:ace` — sits next to a `participant{outcome: killed}`
 *   for the same target, so it reduces to a pure deletion (the
 *   `--allow-lossy` relation-count drop is exactly this dedup).
 *   The character-side `status: dead` entry is NOT touched: it is the
 *   epistemic surface, not a duplicate.
 * - `part-of-arc.valid_from_types` loses `event` (schema-only change);
 *   defensively, any event-sourced `part-of-arc` edge is rewritten to
 *   `occurs-during-arc` — **0 such edges** (verified 2026-08-09: all
 *   8 `part-of-arc` edges come from manga-chapters) — no-op here.
 */
const migration: Migration = {
  id: '0007-catalogue-dedup-relations',
  description:
    'Remove captained-by / pilots, fold caused-death-of into participant{outcome: killed}, retarget event-sourced part-of-arc to occurs-during-arc (ADR-098).',
  up: (data) => {
    let next = removeRelationType(data, 'captained-by');
    next = removeRelationType(next, 'pilots');

    const relations = next['relations'];
    if (!Array.isArray(relations)) return next;

    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    const needsRewrite = relations.some((rel) => {
      const record = asRecord(rel);
      if (record === null) return false;
      if (record['type'] === 'caused-death-of') return true;
      return record['type'] === 'part-of-arc' && next['type'] === 'event';
    });
    if (!needsRewrite) return next;

    const cloned = structuredClone(next);
    const list = cloned['relations'] as unknown[];
    const rebuilt: unknown[] = [];
    for (const rel of list) {
      const record = asRecord(rel);
      if (record === null) {
        rebuilt.push(rel);
        continue;
      }
      if (record['type'] === 'part-of-arc' && cloned['type'] === 'event') {
        record['type'] = 'occurs-during-arc';
        rebuilt.push(record);
        continue;
      }
      if (record['type'] !== 'caused-death-of') {
        rebuilt.push(record);
        continue;
      }
      // Fold into an existing participant edge toward the same target…
      const existing = rebuilt
        .map(asRecord)
        .find((r) => r !== null && r['type'] === 'participant' && r['target'] === record['target'])
        ?? list
          .map(asRecord)
          .find((r) =>
            r !== null && r['type'] === 'participant' && r['target'] === record['target']
          );
      if (existing !== null && existing !== undefined) {
        const qualifiers = asRecord(existing['qualifiers']) ?? {};
        if (qualifiers['outcome'] === undefined) {
          qualifiers['outcome'] = 'killed';
          existing['qualifiers'] = qualifiers;
        }
        // Drop the caused-death-of edge (pure deletion when the
        // participant edge already carried outcome: killed).
        continue;
      }
      // …or rewrite it into a fresh participant edge.
      const qualifiers = asRecord(record['qualifiers']) ?? {};
      rebuilt.push({
        ...record,
        type: 'participant',
        qualifiers: { ...qualifiers, outcome: 'killed' },
      });
    }
    cloned['relations'] = rebuilt;
    return cloned;
  },
};

export default migration;
