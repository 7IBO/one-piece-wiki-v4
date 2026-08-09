/**
 * api-onepiece `sagas` → `saga` and `arcs` → `arc` entity mappers
 * (ADR-101).
 *
 * Typical saga record: { id, title, saga_number, saga_chapitre,
 * saga_volume, saga_episode } — the chapter/volume/episode RANGES have
 * no property home (membership is modelled edge-wise: chapter →
 * part-of-arc → part-of-saga), so they are reported as informational,
 * never silently dropped.
 *
 * Typical arc record: { id, title, saga: {id, title, …} } — the saga
 * reference becomes the `part-of-saga` edge.
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
  pairField,
  parseLooseNumber,
  resolveOrGuessTarget,
  slugify,
} from './common.ts';

/** Saga API fields the mapper reads — the rest → gap report. */
export const SAGA_HANDLED_FIELDS: readonly string[] = [
  'id',
  'title',
  'name',
  'saga_number',
  'saga_chapitre',
  'saga_volume',
  'saga_episode',
];

/** Arc API fields the mapper reads — the rest → gap report. */
export const ARC_HANDLED_FIELDS: readonly string[] = [
  'id',
  'title',
  'name',
  'saga',
];

/** Current saga schema_version — keep in sync with the type. */
export const SAGA_SCHEMA_VERSION = 2;
/** Current arc schema_version — keep in sync with the type. */
export const ARC_SCHEMA_VERSION = 4;

export function mapSaga(
  pair: LocalizedRecordPair,
  _ctx: MapperContext = {},
): MappedCandidate | null {
  const title = localizedField(pair, 'title', 'name');
  if (title.en === null && title.fr === null) return null;
  const enTitle = title.en ?? title.fr!;
  const slug = slugify(enTitle);
  if (slug === '') return null;

  const informational: string[] = [];
  const id = `saga:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'saga',
    schema_version: SAGA_SCHEMA_VERSION,
    slug,
    canonical_name_key: `saga.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enTitle, title.fr);

  const sagaNumber = parseLooseNumber(pairField(pair, 'saga_number'));
  if (sagaNumber !== null && sagaNumber > 0) {
    entity.properties['saga_number'] = { value: sagaNumber };
  }

  // Chapter/volume/episode ranges: membership is edge-modelled — the
  // ranges are review context, not storage.
  for (
    const [field, label] of [
      ['saga_chapitre', 'chapter range'],
      ['saga_volume', 'volume range'],
      ['saga_episode', 'episode range'],
    ] as const
  ) {
    const range = cleanString(pairField(pair, field));
    if (range !== null) {
      informational.push(
        `${id}: ${label} "${range}" NOT stored — membership flows through part-of-arc/`
          + 'part-of-saga edges',
      );
    }
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, SAGA_HANDLED_FIELDS),
    unanchored: [],
    informational,
    warnings: [],
  };
}

export function mapArc(
  pair: LocalizedRecordPair,
  ctx: MapperContext = {},
): MappedCandidate | null {
  const title = localizedField(pair, 'title', 'name');
  if (title.en === null && title.fr === null) return null;
  const enTitle = title.en ?? title.fr!;
  const slug = slugify(enTitle);
  if (slug === '') return null;

  const warnings: string[] = [];
  const id = `arc:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'arc',
    schema_version: ARC_SCHEMA_VERSION,
    slug,
    canonical_name_key: `arc.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enTitle, title.fr);

  const saga = pairField(pair, 'saga');
  const sagaName = typeof saga === 'object' && saga !== null
    ? cleanString((saga as { title?: unknown; name?: unknown; }).title)
      ?? cleanString((saga as { name?: unknown; }).name)
    : cleanString(saga);
  if (sagaName !== null) {
    const target = resolveOrGuessTarget(ctx, sagaName, ['saga'], warnings, `${id} part-of-saga`);
    if (target !== null) entity.relations.push({ type: 'part-of-saga', target });
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, ARC_HANDLED_FIELDS),
    unanchored: [],
    informational: [],
    warnings,
  };
}
