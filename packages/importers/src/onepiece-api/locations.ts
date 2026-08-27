/**
 * api-onepiece `locates` → `location` entity mapper (ADR-101).
 *
 * Typical record: { id, name, sea, affiliation }.
 *  - `sea` matches against the `location-regions` vocabulary ("East
 *    Blue" → east_blue) via the injected vocabulary index;
 *  - `affiliation` (e.g. "World Government") has no deterministic
 *    relation home from a bare string — it stays a warning for the
 *    human pass, never a guessed edge.
 */
import {
  type CandidateEntity,
  type CandidateTranslations,
  cleanString,
  collectGaps,
  emitName,
  localizedField,
  type LocalizedRecordPair,
  type MappedCandidate,
  type MapperContext,
  matchVocabulary,
  pairField,
  slugify,
} from './common.ts';

/** API fields the mapper reads — the rest lands in the gap report. */
export const LOCATION_HANDLED_FIELDS: readonly string[] = [
  'id',
  'name',
  'sea',
  'affiliation',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const LOCATION_SCHEMA_VERSION = 1;

export function mapLocation(
  pair: LocalizedRecordPair,
  ctx: MapperContext = {},
): MappedCandidate | null {
  const name = localizedField(pair, 'name');
  if (name.en === null && name.fr === null) return null;
  const enName = name.en ?? name.fr!;
  const slug = slugify(enName);
  if (slug === '') return null;

  const warnings: string[] = [];
  const id = `location:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'location',
    schema_version: LOCATION_SCHEMA_VERSION,
    slug,
    canonical_name_key: `location.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enName, name.fr);

  const sea = localizedField(pair, 'sea');
  const seaRaw = sea.en ?? sea.fr;
  if (seaRaw !== null) {
    const region = matchVocabulary(ctx, 'location-regions', seaRaw)
      ?? matchVocabulary(ctx, 'location-regions', slugify(seaRaw).replace(/-/g, '_'));
    if (region !== null) {
      // `region` is non-historical — single value object, no entry bag.
      entity.properties['region'] = { value: region };
    } else {
      warnings.push(`${id}: sea "${seaRaw}" has no location-regions match — human pass`);
    }
  }

  const affiliation = cleanString(pairField(pair, 'affiliation'));
  if (affiliation !== null) {
    warnings.push(
      `${id}: affiliation "${affiliation}" needs a human-modelled relation (no deterministic home)`,
    );
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, LOCATION_HANDLED_FIELDS),
    unanchored: [],
    informational: [],
    warnings,
  };
}
