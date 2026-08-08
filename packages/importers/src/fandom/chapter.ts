/**
 * Fandom "Chapter Box" → `manga-chapter` entity mapper (ADR-079).
 *
 * Deterministic infobox extraction only — no AI in this path. The
 * output mirrors the corpus file shape (cf.
 * `data/universes/one-piece/entities/manga-chapter/1044.json`):
 * non-historical properties are single `{ value }` / `{ value_key }`
 * objects; the EN title lands in a translations sidecar keyed
 * `manga-chapter.<n>.title`.
 *
 * Provenance: the emitted PR carries the page URL + the `import`
 * label; per-value `review_status` stamping is reserved for the
 * AI-extraction path (identity/capability facts) per the ingest rule
 * — infobox scalars are reviewed wholesale in the admin queue.
 *
 * Unknown/unparseable fields become `warnings`, never guesses.
 */
import type { ParsedPage } from './client.ts';
import { cleanValue, findTemplate, parseLooseDate, parseLooseNumber } from './wikitext.ts';

export type ChapterEntity = {
  readonly id: string;
  readonly type: 'manga-chapter';
  readonly schema_version: number;
  readonly slug: string;
  readonly properties: Record<string, unknown>;
  readonly relations: readonly Record<string, unknown>[];
};

export type ChapterMapResult = {
  readonly entity: ChapterEntity;
  /** i18n sidecar — merged into the EN translation file on emit. */
  readonly translations: { readonly en: Record<string, string>; };
  /** Fields the parser saw but could not map deterministically. */
  readonly warnings: readonly string[];
};

/** Infobox template names this mapper recognises (ADR-092 analyzer). */
export const CHAPTER_INFOBOX_NAMES: readonly string[] = [
  'Chapter Box',
  'Chapterbox',
  'Infobox chapter',
];

/**
 * Infobox params the mapper reads — mapped to properties/relations or
 * deliberately surfaced as warnings. Consumed by the `fandom:analyze`
 * field-inventory report (ADR-092); keep in sync with the `get(...)`
 * calls in {@link mapChapter}.
 */
export const CHAPTER_HANDLED_PARAMS: readonly string[] = [
  'chapter',
  'number',
  'ename',
  'title',
  'extitle',
  'etitle',
  'rname',
  'romanji',
  'romaji',
  'date',
  'reldate',
  'release',
  'pages',
  'page',
  'volume',
];

/** Current manga-chapter schema_version — keep in sync with the type. */
export const MANGA_CHAPTER_SCHEMA_VERSION = 6;

export function mapChapter(page: ParsedPage): ChapterMapResult | null {
  const box = findTemplate(page.wikitext, ...CHAPTER_INFOBOX_NAMES);
  if (box === null) return null;

  const warnings: string[] = [];
  const get = (...keys: readonly string[]): string | undefined => {
    for (const k of keys) {
      const v = box.named[k];
      if (v !== undefined && v.trim() !== '') return v;
    }
    return undefined;
  };

  // The REAL Chapter Box (verified against the live API, 2026-06-14)
  // carries NO chapter-number param — the ordinal lives in the page
  // title ("Chapter 1044"). The infobox params are kept as fallback
  // for oddly-titled pages.
  const fromTitle = /^Chapter\s+(\d+)$/i.exec(page.title.trim());
  const numberRaw = fromTitle?.[1] ?? get('chapter', 'number');
  const number = numberRaw === undefined ? null : parseLooseNumber(numberRaw);
  if (number === null) {
    // Without the ordinal there is no id/slug — not mappable.
    return null;
  }

  const properties: Record<string, unknown> = {
    number: { value: number },
    title_key: { value_key: `manga-chapter.${number}.title` },
  };
  const translations: Record<string, string> = {};

  const enTitle = get('ename', 'title', 'extitle', 'etitle');
  const romaji = get('rname', 'romanji', 'romaji');
  const title = enTitle ?? romaji;
  if (title !== undefined) {
    translations[`manga-chapter.${number}.title`] = cleanValue(title);
  } else {
    warnings.push('no English/romaji title in infobox — title translation missing');
  }

  // The real Chapter Box carries no release date/pages/volume — those
  // live on the volume pages. Kept as best-effort for pages that do
  // declare them; `released_at` is optional (schema v7) so the entity
  // imports without it — the warning routes the gap to the volume-page
  // mapper / AI pass instead of blocking the whole batch.
  const dateRaw = get('date', 'reldate', 'release');
  if (dateRaw !== undefined) {
    const iso = parseLooseDate(dateRaw);
    if (iso !== null) {
      properties['released_at'] = { value: iso, territory: 'jp' };
    } else warnings.push(`unparseable release date: "${cleanValue(dateRaw)}"`);
  } else {
    warnings.push('no release date in infobox — supply from the volume page or manually');
  }

  const pagesRaw = get('pages', 'page');
  if (pagesRaw !== undefined) {
    const pages = parseLooseNumber(pagesRaw);
    if (pages !== null) properties['page_count'] = { value: pages };
    else warnings.push(`unparseable page count: "${cleanValue(pagesRaw)}"`);
  }

  const relations: Record<string, unknown>[] = [];
  const volumeRaw = get('volume');
  if (volumeRaw !== undefined) {
    const volume = parseLooseNumber(volumeRaw);
    if (volume !== null) {
      relations.push({ type: 'part-of-volume', target: `volume:${volume}` });
      warnings.push(
        `part-of-volume targets volume:${volume} — the volume entity must exist before merge`,
      );
    } else warnings.push(`unparseable volume: "${cleanValue(volumeRaw)}"`);
  }

  return {
    entity: {
      id: `manga-chapter:${number}`,
      type: 'manga-chapter',
      schema_version: MANGA_CHAPTER_SCHEMA_VERSION,
      slug: `chapter-${number}`,
      properties,
      relations,
    },
    translations: { en: translations },
    warnings,
  };
}
