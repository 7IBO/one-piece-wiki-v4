import { type Migration, removeProperty } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-068 — drop the manual `canonicity` property.
 *
 * Entity-level canonicity is the **derived** `primary_canon_scope`
 * (CANON_MODEL.md): the strongest `canon_scope` among an entity's values /
 * introducing source. The hand-set `canonicity` (enum `canonicity-tiers`) on
 * `devil-fruit` / `technique` duplicated that, so it and its vocabulary are
 * removed.
 *
 * No entity in `/data/universes/**` set `canonicity`, so this is a no-op on the
 * present corpus; kept as the historical record (removes the key if present).
 */
const migration: Migration = {
  id: '0003-drop-canonicity',
  description:
    'Remove the manual `canonicity` property; entity canonicity derives from canon_scope (ADR-068).',
  up: (data) => removeProperty(data, 'canonicity'),
};

export default migration;
