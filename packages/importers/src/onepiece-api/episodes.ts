/**
 * api-onepiece `episodes` → `anime-episode` entity mapper (ADR-101).
 *
 * Typical record: { id, number, title, release_date, arc: {id, title,
 * …}, saga: {…} }. The ordinal is the identity (`anime-episode:<n>`).
 * An `arc` reference becomes the `part-of-arc` edge (resolved against
 * existing entities / this sweep's arc candidates); `saga` is implied
 * by the arc chain and therefore reported as informational, not
 * duplicated onto the episode.
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
  resolveOrGuessTarget,
} from './common.ts';

/** API fields the mapper reads — the rest lands in the gap report. */
export const EPISODE_HANDLED_FIELDS: readonly string[] = [
  'id',
  'number',
  'episode',
  'title',
  'name',
  'release_date',
  'arc',
  'saga',
];

/** Current anime-episode schema_version — keep in sync with the type. */
export const ANIME_EPISODE_SCHEMA_VERSION = 6;

export function mapEpisode(
  pair: LocalizedRecordPair,
  ctx: MapperContext = {},
): MappedCandidate | null {
  const number = parseLooseNumber(pairField(pair, 'number', 'episode'));
  if (number === null || number <= 0) return null;

  const warnings: string[] = [];
  const informational: string[] = [];
  const id = `anime-episode:${number}`;
  const titleKey = `anime-episode.${number}.title`;
  const entity: CandidateEntity = {
    id,
    type: 'anime-episode',
    schema_version: ANIME_EPISODE_SCHEMA_VERSION,
    slug: `episode-${number}`,
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

  const arc = pairField(pair, 'arc');
  const arcName = typeof arc === 'object' && arc !== null
    ? cleanString((arc as { title?: unknown; name?: unknown; }).title)
      ?? cleanString((arc as { name?: unknown; }).name)
    : cleanString(arc);
  if (arcName !== null) {
    const target = resolveOrGuessTarget(ctx, arcName, ['arc'], warnings, `${id} part-of-arc`);
    if (target !== null) entity.relations.push({ type: 'part-of-arc', target });
  }

  const saga = pairField(pair, 'saga');
  const sagaName = typeof saga === 'object' && saga !== null
    ? cleanString((saga as { title?: unknown; name?: unknown; }).title)
      ?? cleanString((saga as { name?: unknown; }).name)
    : cleanString(saga);
  if (sagaName !== null) {
    informational.push(
      `${id}: saga "${sagaName}" NOT stored on the episode — saga membership flows through `
        + 'the arc (part-of-arc → part-of-saga)',
    );
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, EPISODE_HANDLED_FIELDS),
    unanchored: [],
    informational,
    warnings,
  };
}
