/**
 * api-onepiece `tomes` → `volume` entity mapper (ADR-101).
 *
 * Typical record: { id, number (or tome), title, japan_release_date,
 * french_release_date, chapters? }. The ordinal is the identity
 * (`volume:<n>`, slug `volume-<n>` — corpus convention).
 *
 * The JP release date maps to `released_at` (territory jp); the FR
 * release is reported as informational (the corpus models extra
 * territories through dedicated entries a human adds after review).
 */
import {
  type CandidateEntity,
  type CandidateTranslations,
  collectGaps,
  localizedField,
  type LocalizedRecordPair,
  type MappedCandidate,
  type MapperContext,
  pairField,
  parseLooseDate,
  parseLooseNumber,
} from './common.ts';

/** API fields the mapper reads — the rest lands in the gap report. */
export const VOLUME_HANDLED_FIELDS: readonly string[] = [
  'id',
  'number',
  'tome',
  'title',
  'name',
  'release_date',
  'japan_release_date',
  'french_release_date',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const VOLUME_SCHEMA_VERSION = 1;

export function mapVolume(
  pair: LocalizedRecordPair,
  _ctx: MapperContext = {},
): MappedCandidate | null {
  const number = parseLooseNumber(pairField(pair, 'number', 'tome'));
  if (number === null || number <= 0) return null;

  const warnings: string[] = [];
  const informational: string[] = [];
  const id = `volume:${number}`;
  const titleKey = `volume.${number}.title`;
  const entity: CandidateEntity = {
    id,
    type: 'volume',
    schema_version: VOLUME_SCHEMA_VERSION,
    slug: `volume-${number}`,
    properties: {
      number: { value: number },
      title_key: { value_key: titleKey },
    },
    relations: [],
  };

  const translations: CandidateTranslations = { en: {}, fr: {} };
  const title = localizedField(pair, 'title', 'name');
  if (title.en !== null) translations.en[titleKey] = title.en;
  if (title.fr !== null) translations.fr[titleKey] = title.fr;
  if (title.en === null && title.fr === null) {
    warnings.push(`${id}: no title in either locale — title translation missing`);
  }

  const released = parseLooseDate(pairField(pair, 'japan_release_date', 'release_date'));
  if (released !== null) {
    entity.properties['released_at'] = { value: released, territory: 'jp' };
  }
  const frenchRelease = parseLooseDate(pairField(pair, 'french_release_date'));
  if (frenchRelease !== null) {
    informational.push(
      `${id}: French release ${frenchRelease} NOT stored — add a released_at entry `
        + '(territory fr) after review if wanted',
    );
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, VOLUME_HANDLED_FIELDS),
    unanchored: [],
    informational,
    warnings,
  };
}
