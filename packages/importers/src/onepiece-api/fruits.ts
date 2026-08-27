/**
 * api-onepiece `fruits` → `devil-fruit` entity mapper (+ URL-only
 * image entity, ADR-101 §2).
 *
 * Typical record: { id, name, roman_name, type, filename }.
 *  - `name` ("Gomu Gomu no Mi") drives the slug; `roman_name` becomes
 *    a `romanized` name entry when it differs;
 *  - `type` maps onto `devil-fruit-classifications` by normalized
 *    spelling ("Paramecia" → paramecia, "Mythical Zoan" →
 *    mythical_zoan); unmatched spellings stay warnings;
 *  - `filename` (an image URL) becomes an `image` ENTITY — URL as-is,
 *    license `unverified-external`, attribution api-onepiece.com — and
 *    a `depicted-by` edge on the fruit. No binary is downloaded.
 */
import {
  AUTO_IMPORTED,
  buildImageCandidate,
  type CandidateEntity,
  type CandidateTranslations,
  cleanString,
  collectGaps,
  emitName,
  type ImageCandidate,
  localizedField,
  type LocalizedRecordPair,
  type MappedCandidate,
  type MapperContext,
  pairField,
  slugify,
} from './common.ts';

/** API fields the mapper reads — the rest lands in the gap report. */
export const FRUIT_HANDLED_FIELDS: readonly string[] = [
  'id',
  'name',
  'roman_name',
  'type',
  'filename',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const DEVIL_FRUIT_SCHEMA_VERSION = 1;

/** `devil-fruit-classifications` ids by normalized API spelling. */
const CLASSIFICATIONS: ReadonlyMap<string, string> = new Map([
  ['paramecia', 'paramecia'],
  ['special paramecia', 'special_paramecia'],
  ['zoan', 'zoan'],
  ['ancient zoan', 'ancient_zoan'],
  ['mythical zoan', 'mythical_zoan'],
  ['zoan mythique', 'mythical_zoan'],
  ['zoan ancien', 'ancient_zoan'],
  ['logia', 'logia'],
  ['smile', 'smile'],
  ['artificial', 'artificial'],
  ['artificiel', 'artificial'],
]);

export function mapFruit(
  pair: LocalizedRecordPair,
  _ctx: MapperContext = {},
): MappedCandidate | null {
  const name = localizedField(pair, 'name');
  if (name.en === null && name.fr === null) return null;
  const enName = name.en ?? name.fr!;
  const slug = slugify(enName);
  if (slug === '') return null;

  const warnings: string[] = [];
  const id = `devil-fruit:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'devil-fruit',
    schema_version: DEVIL_FRUIT_SCHEMA_VERSION,
    slug,
    canonical_name_key: `devil-fruit.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enName, name.fr);

  const roman = cleanString(pairField(pair, 'roman_name'));
  if (roman !== null && slugify(roman) !== slug) {
    const romanKey = `devil-fruit.${slug}.name.romanized`;
    (entity.properties['name'] as Record<string, unknown>[]).push({
      value_key: romanKey,
      name_type: 'romanized',
      ...AUTO_IMPORTED,
    });
    translations.en[romanKey] = roman;
    translations.fr[romanKey] = roman;
  }

  const typeRaw = localizedField(pair, 'type');
  const typeText = typeRaw.en ?? typeRaw.fr;
  if (typeText !== null) {
    const classification = CLASSIFICATIONS.get(typeText.trim().toLowerCase())
      ?? CLASSIFICATIONS.get(slugify(typeText).replace(/-/g, ' '))
      ?? null;
    if (classification !== null) {
      entity.properties['classification'] = [{ value: classification, ...AUTO_IMPORTED }];
    } else {
      warnings.push(`${id}: unmapped fruit type "${typeText}" — classification omitted`);
    }
  }

  // filename = the fruit's image URL — URL-only ingestion (ADR-101).
  const images: ImageCandidate[] = [];
  const imageUrl = cleanString(pairField(pair, 'filename'));
  if (imageUrl !== null) {
    const image = buildImageCandidate(
      entity,
      { en: enName, fr: name.fr },
      imageUrl,
      'primary_portrait',
    );
    if (image !== null) images.push(image);
    else warnings.push(`${id}: image URL "${imageUrl}" skipped (not http(s) or unknown format)`);
  }

  return {
    entity,
    translations,
    images,
    gaps: collectGaps(pair, FRUIT_HANDLED_FIELDS),
    unanchored: [],
    informational: [],
    warnings,
  };
}
