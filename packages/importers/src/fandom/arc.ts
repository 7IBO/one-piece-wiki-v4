/**
 * Fandom "Arc Box" → `arc` entity mapper (ADR-109).
 *
 * The survey (70 transclusions, 40 pages sampled — mostly cover-story
 * arcs, which is what that category holds) shows a box built almost
 * entirely of NAVIGATION: `prev`/`next` (+ their `… anime` and
 * `conc anime` variants) and the `chapter`/`vol`/`episode` ranges.
 * None of it is an arc-side fact in our model:
 *
 *  - arc ordering is `arc_number`, not a prev/next pair of edges (no
 *    such relation exists, and adding one would be a second home for
 *    the ordering — ADR-098/099);
 *  - the chapter/episode membership edge is `part-of-arc`, whose
 *    canonical direction is chapter → arc (ADR-033), so it belongs on
 *    the chapter files.
 *
 * What the mapper emits: the arc name in `en` + the `ja`/`ja-latn`
 * data locales (ADR-095), `arc_subtype` from the box's `type` enum,
 * and a `since` anchor derived from the first chapter of the range.
 */
import {
  type BoxMapContext,
  entityIdFor,
  IMAGE_PARAMS,
  isPlaceholderName,
  matchVocabularyIn,
  paramReader,
  PRESENTATION_PARAMS,
  readJapaneseName,
  slugify,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { cleanValue, findTemplate } from './wikitext.ts';

export type ArcMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'arc';
    readonly schema_version: number;
    readonly slug: string;
    readonly canonical_name_key: string;
    readonly properties: Record<string, unknown>;
    readonly relations: readonly Record<string, unknown>[];
  };
  readonly translations: {
    readonly en: Record<string, string>;
    readonly ja?: Record<string, string>;
    readonly 'ja-latn'?: Record<string, string>;
  };
  readonly warnings: readonly string[];
};

/** Infobox template names this mapper recognises (ADR-092 analyzer). */
export const ARC_INFOBOX_NAMES: readonly string[] = [
  'Arc Box',
  'Arcbox',
  'Infobox arc',
];

/** Params read by {@link mapArc} — keep in sync with `get(...)`. */
export const ARC_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'type',
  'chapter',
  'chap',
  'vol',
  'episode',
  'ep',
  'prev',
  'next',
  'prev anime',
  'next anime',
  'conc anime',
  'date',
];

/** Params seen and DELIBERATELY not mapped (presentation / ADR-107 images). */
export const ARC_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const ARC_SCHEMA_VERSION = 1;

/**
 * Fandom's `type` shorthand → `arc-subtypes` value id. The survey
 * found exactly two values in 40 sampled pages ("Cover", "Filler");
 * neither is spelled the way the vocabulary labels them, so the
 * source-specific spelling is declared here (the mapper is the
 * adapter layer, cf. the character mapper's status patterns) and the
 * vocabulary index is consulted for anything else.
 */
const ARC_TYPE_ALIASES: Readonly<Record<string, string>> = {
  cover: 'cover_story',
  filler: 'filler',
};

/** "Wano Country Arc" → "Wano Country" (the corpus stores the bare name). */
export function stripArcSuffix(title: string): string {
  return title.replace(/\s+Arc$/i, '').trim();
}

/** First ordinal of a range param ("424-427 and 486-490, 7 …" → 424). */
function firstOrdinal(raw: string): number | null {
  const m = /\d+/.exec(cleanValue(raw));
  return m === null ? null : Number(m[0]);
}

export function mapArc(page: ParsedPage, ctx: BoxMapContext = {}): ArcMapResult | null {
  const box = findTemplate(page.wikitext, ...ARC_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];

  const enName = stripArcSuffix(cleanValue(get('name') ?? page.title));
  const slug = slugify(enName);
  // A template placeholder is not a thing (see isPlaceholderName).
  if (slug === '' || isPlaceholderName(enName)) return null;
  const id = entityIdFor('arc', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  // The Arc Box carries no `first`; the range's opening chapter is
  // the only deterministic anchor, and it is flagged as derived.
  const rangeRaw = get('chapter', 'chap');
  const startChapter = rangeRaw === undefined ? null : firstOrdinal(rangeRaw);
  const debut = startChapter === null ? null : `manga-chapter:${startChapter}`;
  if (debut === null) {
    warnings.push('no chapter range to anchor `since` — name emitted without since');
  } else {
    warnings.push(
      `since ${debut} derived from the chapter range "${cleanValue(rangeRaw!)}" — verify`,
    );
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `arc.${base}.name.common`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, name_type: 'common', ...since }],
  };

  const typeRaw = get('type');
  if (typeRaw !== undefined) {
    const alias = ARC_TYPE_ALIASES[cleanValue(typeRaw).toLowerCase()];
    const subtypes = ctx.vocabularies?.get('arc-subtypes');
    const hit = alias
      ?? (subtypes === undefined ? null : matchVocabularyIn(subtypes, typeRaw)?.value)
      ?? null;
    if (hit === null) {
      warnings.push(`unmapped arc type "${cleanValue(typeRaw)}" — arc_subtype not emitted`);
    } else {
      properties['arc_subtype'] = { value: hit };
    }
  }

  const elsewhere: readonly (readonly [string, string])[] = [
    ['chapter', 'the part-of-arc edge is stored on each manga-chapter (chapter → arc, ADR-033)'],
    ['vol', 'volume membership is derived from the chapters (part-of-volume)'],
    ['episode', 'the part-of-arc edge is stored on each anime-episode (episode → arc)'],
    ['ep', 'the part-of-arc edge is stored on each anime-episode (episode → arc)'],
    ['prev', 'arc ordering is the arc_number property, not a prev/next relation'],
    ['next', 'arc ordering is the arc_number property, not a prev/next relation'],
    ['prev anime', 'anime-order navigation — arc_number carries a single canonical order'],
    ['next anime', 'anime-order navigation — arc_number carries a single canonical order'],
    ['conc anime', 'concurrent anime arc — no relation models arc concurrency'],
    ['date', 'the arc schema has no broadcast/publication date-range property'],
  ];
  for (const [param, note] of elsewhere) {
    const raw = get(param);
    if (raw !== undefined) warnings.push(`${param}: "${cleanValue(raw)}" — ${note}`);
  }
  const enameRaw = get('ename');
  if (enameRaw !== undefined) {
    warnings.push(
      `ename variants "${cleanValue(enameRaw)}" — the name property has no translation-variant `
        + 'qualifier; not emitted',
    );
  }
  warnings.push('arc_number not in the Arc Box — set it manually to order the arc');

  const translations = {
    en,
    ...(Object.keys(ja).length > 0 ? { ja } : {}),
    ...(Object.keys(jaLatn).length > 0 ? { 'ja-latn': jaLatn } : {}),
  };

  return {
    entity: {
      id,
      type: 'arc',
      schema_version: ARC_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [],
    },
    translations,
    warnings,
  };
}
