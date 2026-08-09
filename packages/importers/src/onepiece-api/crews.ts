/**
 * api-onepiece `crews` → `crew` entity mapper (ADR-101).
 *
 * Typical record: { id, name, status, number, roman_name, total_prime,
 * is_yonko }.
 *
 *  - `total_prime` (the crew's total bounty) is NEVER stored: a crew's
 *    total bounty is DERIVED from its members' bounties (ADR-099 §4).
 *    It is surfaced as an informational report line instead;
 *  - `number` (member count) is likewise derived — informational;
 *  - `status` ("active"/"dissolved") has no crew property home in the
 *    catalogue (disbanded_at is a date) — reported as a gap-style
 *    warning, never guessed into a date;
 *  - `is_yonko` is a title/emperor concept our model expresses through
 *    relations, not a crew flag — reported, not stored.
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
  pairField,
  parseLooseNumber,
  slugify,
} from './common.ts';

/** API fields the mapper reads — the rest lands in the gap report. */
export const CREW_HANDLED_FIELDS: readonly string[] = [
  'id',
  'name',
  'roman_name',
  'status',
  'number',
  'total_prime',
  'is_yonko',
];

/** Current crew schema_version — keep in sync with the type. */
export const CREW_SCHEMA_VERSION = 4;

export function mapCrew(
  pair: LocalizedRecordPair,
  _ctx: MapperContext = {},
): MappedCandidate | null {
  const name = localizedField(pair, 'name');
  if (name.en === null && name.fr === null) return null;
  const enName = name.en ?? name.fr!;
  const slug = slugify(enName);
  if (slug === '') return null;

  const warnings: string[] = [];
  const informational: string[] = [];
  const id = `crew:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'crew',
    schema_version: CREW_SCHEMA_VERSION,
    slug,
    canonical_name_key: `crew.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enName, name.fr);

  const roman = cleanString(pairField(pair, 'roman_name'));
  if (roman !== null && slugify(roman) !== slug) {
    const romanKey = `crew.${slug}.name.romanized`;
    (entity.properties['name'] as Record<string, unknown>[]).push({
      value_key: romanKey,
      name_type: 'romanized',
      ...AUTO_IMPORTED,
    });
    translations.en[romanKey] = roman;
    translations.fr[romanKey] = roman;
  }

  // Derived facts — reported, never stored (ADR-099 §4).
  const totalPrime = parseLooseNumber(pairField(pair, 'total_prime'));
  if (totalPrime !== null) {
    informational.push(
      `${id}: total_prime ${totalPrime.toLocaleString('en')} NOT stored — a crew's total `
        + 'bounty is derived from its members (ADR-099)',
    );
  }
  const memberCount = parseLooseNumber(pairField(pair, 'number'));
  if (memberCount !== null) {
    informational.push(
      `${id}: member count ${memberCount} NOT stored — derived from member-of edges`,
    );
  }
  const status = cleanString(pairField(pair, 'status'));
  if (status !== null) {
    warnings.push(
      `${id}: crew status "${status}" has no property home (crew models disbanded_at dates) `
        + '— supply disbanded_at manually if the crew is dissolved',
    );
  }
  const isYonko = pairField(pair, 'is_yonko');
  if (isYonko === true || isYonko === 'true' || isYonko === 1) {
    informational.push(
      `${id}: is_yonko NOT stored — emperor standing is modelled via relations/titles`,
    );
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, CREW_HANDLED_FIELDS),
    unanchored: [],
    informational,
    warnings,
  };
}
