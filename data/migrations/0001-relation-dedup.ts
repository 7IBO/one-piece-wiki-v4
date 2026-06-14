import { type Migration, removeRelationType } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-066 — relation dedup pass 3.
 *
 * Removes four redundant relation types:
 * - `appears-in`      — the literal inverse of `features` (now widened); the
 *                       "Appears in" view is the generated inverse.
 * - `mentions`        — a subset of `references` (same targets, narrower source set).
 * - `references-event`— a subset of `references` (events are already `references` targets).
 * - `married-to`      — a subset of `family-of` with `relation_kind: "spouse"`.
 *
 * No entity in `/data/universes/**` currently uses any of these, so this is a
 * no-op on the present corpus; it is kept as the historical record of the
 * removal. Had `married-to` edges existed they would map to `family-of`
 * `{ relation_kind: "spouse" }` (done manually if ever needed — the corpus is empty here).
 */
const migration: Migration = {
  id: '0001-relation-dedup',
  description:
    'Remove duplicate relations appears-in / mentions / references-event / married-to (ADR-066).',
  up: (data) => {
    let next = removeRelationType(data, 'appears-in');
    next = removeRelationType(next, 'mentions');
    next = removeRelationType(next, 'references-event');
    next = removeRelationType(next, 'married-to');
    return next;
  },
};

export default migration;
