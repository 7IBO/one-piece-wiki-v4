import { type Migration, removeProperty } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-073 — contract phase of the `volume` expand→migrate→contract (ADR-071).
 *
 * The tankōbon is now a first-class `volume` entity reached through the
 * `part-of-volume` relation (ADR-071, expand phase). The legacy free-text
 * `volume` **string** property on `manga-chapter` / `sbs` is therefore
 * redundant and is removed.
 *
 * No entity in `/data/universes/**` ever set the string property (verified
 * 2026-06-14), so this is a no-op on the present corpus; kept as the
 * historical record (removes the key if present). Any future corpus import
 * must author `volume` entities + `part-of-volume` edges directly.
 */
const migration: Migration = {
  id: '0005-drop-legacy-volume-property',
  description:
    'Remove the legacy free-text `volume` property; tankōbon linkage is the `part-of-volume` relation (ADR-073).',
  up: (data) => removeProperty(data, 'volume'),
};

export default migration;
