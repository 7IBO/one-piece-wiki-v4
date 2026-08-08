/**
 * Fandom "Volume Box" → `volume` entity mapper (ADR-079).
 *
 * Deterministic infobox extraction only — no AI in this path. The
 * output mirrors the corpus file shape (cf. the `manga-chapter`
 * corpus style — the volume schema is number + title_key +
 * released_at): non-historical properties are single `{ value }` /
 * `{ value_key }` objects; the EN title lands in a translations
 * sidecar keyed `volume.<n>.title`.
 *
 * CAVEAT — param names are UNVERIFIED against the live API: the
 * sandbox network policy denies onepiece.fandom.com (ADR-079 §6), so
 * the test fixture is SYNTHETIC (modelled on the wiki's "Volume Box"
 * template docs: jname/rname/ename titles, pages, JP/EN release
 * dates, ISBNs, chapters range). Aliases are kept deliberately wide;
 * validate against a live response on the first CI run and tighten.
 *
 * Schema gaps stay warnings, never guesses: the volume entity type
 * has no isbn / page-count / chapter-list property — the chapters
 * range is surfaced so the chapter side can store `part-of-volume`
 * (the direction the corpus uses; cf. the chapter mapper).
 */
import type { ParsedPage } from './client.ts';
import { cleanValue, findTemplate, parseLooseDate, parseLooseNumber } from './wikitext.ts';

export type VolumeEntity = {
  readonly id: string;
  readonly type: 'volume';
  readonly schema_version: number;
  readonly slug: string;
  readonly properties: Record<string, unknown>;
  readonly relations: readonly Record<string, unknown>[];
};

export type VolumeMapResult = {
  readonly entity: VolumeEntity;
  /** i18n sidecar — merged into the EN translation file on emit. */
  readonly translations: { readonly en: Record<string, string>; };
  /** Fields the parser saw but could not map deterministically. */
  readonly warnings: readonly string[];
};

/** Infobox template names this mapper recognises (ADR-092 analyzer). */
export const VOLUME_INFOBOX_NAMES: readonly string[] = [
  'Volume Box',
  'Volumebox',
  'Infobox volume',
];

/**
 * Infobox params the mapper reads — mapped to properties or
 * deliberately surfaced as warnings (isbn/pages/chapters are read and
 * routed to warnings because the volume schema has no home for them).
 * Consumed by the `fandom:analyze` field-inventory report (ADR-092);
 * keep in sync with the `get(...)` calls in {@link mapVolume}.
 */
export const VOLUME_HANDLED_PARAMS: readonly string[] = [
  'volume',
  'number',
  'ename',
  'etitle',
  'title',
  'rname',
  'romanji',
  'romaji',
  'jrelease',
  'release',
  'reldate',
  'date',
  'erelease',
  'engrelease',
  'pages',
  'jisbn',
  'isbn',
  'eisbn',
  'chapters',
  'chapter',
];

/** Current volume schema_version — keep in sync with the type. */
export const VOLUME_SCHEMA_VERSION = 1;

export function mapVolume(page: ParsedPage): VolumeMapResult | null {
  const box = findTemplate(page.wikitext, ...VOLUME_INFOBOX_NAMES);
  if (box === null) return null;

  const warnings: string[] = [];
  const get = (...keys: readonly string[]): string | undefined => {
    for (const k of keys) {
      const v = box.named[k];
      if (v !== undefined && v.trim() !== '') return v;
    }
    return undefined;
  };

  // Like the Chapter Box, the ordinal is expected in the page title
  // ("Volume 12"); the infobox params are kept as fallback for
  // oddly-titled pages.
  const fromTitle = /^Volume\s+(\d+)$/i.exec(page.title.trim());
  const numberRaw = fromTitle?.[1] ?? get('volume', 'number');
  const number = numberRaw === undefined ? null : parseLooseNumber(numberRaw);
  if (number === null) {
    // Without the ordinal there is no id/slug — not mappable.
    return null;
  }

  const properties: Record<string, unknown> = {
    number: { value: number },
    title_key: { value_key: `volume.${number}.title` },
  };
  const translations: Record<string, string> = {};

  const enTitle = get('ename', 'etitle', 'title');
  const romaji = get('rname', 'romanji', 'romaji');
  const title = enTitle ?? romaji;
  if (title !== undefined) {
    translations[`volume.${number}.title`] = cleanValue(title);
  } else {
    warnings.push('no English/romaji title in infobox — title translation missing');
  }

  // JP release only: the volume schema's `released_at` is
  // single-valued, and the JP tankōbon date is the canonical one.
  const jpDateRaw = get('jrelease', 'release', 'reldate', 'date');
  if (jpDateRaw !== undefined) {
    const iso = parseLooseDate(jpDateRaw);
    if (iso !== null) {
      properties['released_at'] = { value: iso, territory: 'jp' };
    } else warnings.push(`unparseable JP release date: "${cleanValue(jpDateRaw)}"`);
  } else {
    warnings.push('no JP release date in infobox — supply manually');
  }
  const enDateRaw = get('erelease', 'engrelease');
  if (enDateRaw !== undefined) {
    warnings.push(
      `EN release "${cleanValue(enDateRaw)}" not emitted — released_at is single-valued (JP wins)`,
    );
  }

  // Schema gaps — surfaced, not invented (DATA_MODEL first).
  for (
    const [param, note] of [
      ['pages', 'page_count does not apply to volume in the schema'],
      ['jisbn', 'no isbn property in the volume schema'],
      ['isbn', 'no isbn property in the volume schema'],
      ['eisbn', 'no isbn property in the volume schema'],
    ] as const
  ) {
    const v = get(param);
    if (v !== undefined) warnings.push(`${param}: "${cleanValue(v)}" — ${note}; not emitted`);
  }

  // The chapter list lives on the CHAPTER side as `part-of-volume`
  // (volume declares no inverse) — surface the range for that pass.
  const chaptersRaw = get('chapters', 'chapter');
  if (chaptersRaw !== undefined) {
    // "[[Chapter 99]]-[[Chapter 107]]" cleans to "Chapter 99-Chapter
    // 107" — the ordinals are the only deterministic content.
    const cleaned = cleanValue(chaptersRaw);
    const ordinals = cleaned.match(/\d+/g);
    if (ordinals !== null && ordinals.length > 0) {
      warnings.push(
        `chapters ${ordinals[0]}–${ordinals[ordinals.length - 1]} — set part-of-volume on those `
          + 'manga-chapter entities (the volume schema stores no chapter list)',
      );
    } else warnings.push(`unparseable chapters range: "${cleaned}"`);
  }

  return {
    entity: {
      id: `volume:${number}`,
      type: 'volume',
      schema_version: VOLUME_SCHEMA_VERSION,
      slug: `volume-${number}`,
      properties,
      relations: [],
    },
    translations: { en: translations },
    warnings,
  };
}
