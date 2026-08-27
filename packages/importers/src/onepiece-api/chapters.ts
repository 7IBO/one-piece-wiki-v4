/**
 * api-onepiece `chapters` → `manga-chapter` entity mapper (ADR-101).
 *
 * Typical record: { id, number (or chapter), title, tome: {id, number,
 * …}, release_date, pages }. The ordinal is the identity (`manga-
 * chapter:<n>`, slug `chapter-<n>` — corpus convention); records
 * without a parseable number are not mappable.
 *
 * EN + FR titles land in the per-locale translation sidecars under
 * `manga-chapter.<n>.title`; a `tome` reference becomes the
 * `part-of-volume` edge.
 */
import {
  type CandidateEntity,
  type CandidateTranslations,
  cleanString,
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
export const CHAPTER_HANDLED_FIELDS: readonly string[] = [
  'id',
  'number',
  'chapter',
  'title',
  'name',
  'tome',
  'release_date',
  'pages',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const MANGA_CHAPTER_SCHEMA_VERSION = 1;

export function mapChapter(
  pair: LocalizedRecordPair,
  _ctx: MapperContext = {},
): MappedCandidate | null {
  const number = parseLooseNumber(pairField(pair, 'number', 'chapter'));
  if (number === null || number <= 0) return null;

  const warnings: string[] = [];
  const id = `manga-chapter:${number}`;
  const titleKey = `manga-chapter.${number}.title`;
  const entity: CandidateEntity = {
    id,
    type: 'manga-chapter',
    schema_version: MANGA_CHAPTER_SCHEMA_VERSION,
    slug: `chapter-${number}`,
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

  const released = parseLooseDate(pairField(pair, 'release_date'));
  if (released !== null) {
    entity.properties['released_at'] = { value: released, territory: 'jp' };
  }

  const pages = parseLooseNumber(pairField(pair, 'pages'));
  if (pages !== null && pages > 0) entity.properties['page_count'] = { value: pages };

  const tome = pairField(pair, 'tome');
  const tomeNumber = typeof tome === 'object' && tome !== null
    ? parseLooseNumber((tome as { number?: unknown; }).number)
    : parseLooseNumber(tome);
  if (tomeNumber !== null && tomeNumber > 0) {
    entity.relations.push({ type: 'part-of-volume', target: `volume:${tomeNumber}` });
    warnings.push(
      `${id}: part-of-volume targets volume:${tomeNumber} — the volume entity must exist before merge`,
    );
  } else if (tome !== undefined && cleanString(tome) !== null) {
    warnings.push(`${id}: unparseable tome reference "${String(tome)}" — edge skipped`);
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, CHAPTER_HANDLED_FIELDS),
    unanchored: [],
    informational: [],
    warnings,
  };
}
