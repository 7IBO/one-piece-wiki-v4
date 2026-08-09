/**
 * api-onepiece `boats` → `ship` entity mapper (ADR-101).
 *
 * Typical record: { id, name, type, roman_name, description,
 * crew: {id, name, …} }.
 *  - `type` matches EXACTLY (case-insensitive) against the
 *    `ship-types` vocabulary labels/ids; fuzzy spellings stay warnings;
 *  - `crew` becomes a `crewed-by` edge to the crew (resolved against
 *    existing entities / this sweep's candidates).
 */
import {
  AUTO_IMPORTED,
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
export const BOAT_HANDLED_FIELDS: readonly string[] = [
  'id',
  'name',
  'roman_name',
  'type',
  'crew',
];

/** Current ship schema_version — keep in sync with the type. */
export const SHIP_SCHEMA_VERSION = 4;

export function mapBoat(
  pair: LocalizedRecordPair,
  ctx: MapperContext = {},
): MappedCandidate | null {
  const name = localizedField(pair, 'name');
  if (name.en === null && name.fr === null) return null;
  const enName = name.en ?? name.fr!;
  const slug = slugify(enName);
  if (slug === '') return null;

  const warnings: string[] = [];
  const unanchored: string[] = [];
  const id = `ship:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'ship',
    schema_version: SHIP_SCHEMA_VERSION,
    slug,
    canonical_name_key: `ship.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enName, name.fr);

  const roman = cleanString(pairField(pair, 'roman_name'));
  if (roman !== null && slugify(roman) !== slug) {
    const romanKey = `ship.${slug}.name.romanized`;
    (entity.properties['name'] as Record<string, unknown>[]).push({
      value_key: romanKey,
      name_type: 'romanized',
      ...AUTO_IMPORTED,
    });
    translations.en[romanKey] = roman;
    translations.fr[romanKey] = roman;
  }

  const typeText = localizedField(pair, 'type');
  const shipTypeRaw = typeText.en ?? typeText.fr;
  if (shipTypeRaw !== null) {
    const shipType = matchVocabulary(ctx, 'ship-types', shipTypeRaw)
      ?? matchVocabulary(ctx, 'ship-types', slugify(shipTypeRaw).replace(/-/g, '_'));
    if (shipType !== null) {
      entity.properties['ship_type'] = { value: shipType };
    } else {
      warnings.push(`${id}: ship type "${shipTypeRaw}" has no vocabulary match — human pass`);
    }
  }

  const crewValue = pairField(pair, 'crew');
  const crewName = typeof crewValue === 'object' && crewValue !== null
    ? cleanString((crewValue as { name?: unknown; }).name)
    : cleanString(crewValue);
  if (crewName !== null) {
    const target = ctx.resolveTarget?.(crewName, ['crew']) ?? null;
    if (target !== null) {
      entity.relations.push({ type: 'crewed-by', target });
      unanchored.push(`${id} crewed-by ${target} emitted without since (API carries no anchor)`);
    } else {
      warnings.push(
        `${id}: crew "${crewName}" not found among existing entities or this sweep — `
          + 'crewed-by edge skipped (import the crew first)',
      );
    }
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, BOAT_HANDLED_FIELDS),
    unanchored,
    informational: [],
    warnings,
  };
}
