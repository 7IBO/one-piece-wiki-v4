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
import { readOrdinalTitle } from './ordinal-title.ts';
import {
  cleanValue,
  findTemplate,
  parseLooseDate,
  parseLooseNumber,
  unwrapRuby,
} from './wikitext.ts';

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
  /**
   * i18n sidecars — merged into the matching translation files on
   * emit. `ja` and `ja-latn` are DATA locales (ADR-095): they are
   * never rendered as UI text, but the fiche shows them and the
   * search index carries them, so a reader can find a chapter by its
   * Japanese title and still read the page in their own language.
   */
  readonly translations: {
    readonly en: Record<string, string>;
    readonly ja?: Record<string, string>;
    readonly 'ja-latn'?: Record<string, string>;
  };
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
  'jname',
  'date',
  'reldate',
  'release',
  'pages',
  'page',
  'volume',
  'vol',
  'anime',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const MANGA_CHAPTER_SCHEMA_VERSION = 1;

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
  const titleVerdict = readOrdinalTitle('Chapter', page.title);
  // A parenthesised variant ("Chapter 1 (Digital Colored)") carries the
  // same ordinal in its infobox — letting it fall through would
  // overwrite the real chapter. See ordinal-title.ts.
  if (titleVerdict.kind === 'variant') return null;
  const numberRaw = titleVerdict.kind === 'canonical'
    ? String(titleVerdict.ordinal)
    : get('chapter', 'number');
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

  const key = `manga-chapter.${number}.title`;
  const enTitle = get('ename', 'title', 'extitle', 'etitle');
  if (enTitle !== undefined) translations[key] = cleanValue(enTitle);
  else warnings.push('no English title in infobox — title translation missing');

  // A ROMANISATION IS NOT AN ENGLISH TITLE. `rname` used to be the
  // fallback for the `en` file, which put « Furisosogu Tsuisō no
  // Awayuki » where readers expect « A Light Snow of Reminiscence
  // Falls ». It has its own locale now (ADR-095) and the survey shows
  // it filled at 100%, so nothing is lost by keeping the two apart.
  const romaji = get('rname', 'romanji', 'romaji');
  const jaLatn: Record<string, string> = {};
  if (romaji !== undefined) jaLatn[key] = cleanValue(romaji);

  // `jname` is filled at 100% too, but shaped as a template:
  // `{{Ruby|MONSTER TIME|モンスター タイム}}`. `cleanValue` drops
  // templates wholesale, so reading it naively turns a full column
  // into an empty one.
  const ja: Record<string, string> = {};
  const jnameRaw = get('jname');
  if (jnameRaw !== undefined) {
    const plain = jnameRaw.includes('{{') ? unwrapRuby(jnameRaw) : cleanValue(jnameRaw);
    if (plain !== null && plain !== '') ja[key] = plain;
    else warnings.push(`unreadable Japanese title: "${jnameRaw.slice(0, 60)}"`);
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
  // `vol`, not `volume`: the real param is the short one, so the long
  // spelling read nothing and 1193 imported chapters carried exactly
  // one `part-of-volume`. Both are accepted now.
  const volumeRaw = get('vol', 'volume');
  if (volumeRaw !== undefined) {
    const volume = parseLooseNumber(cleanValue(volumeRaw));
    // A TANKŌBON IS NUMBERED FROM 1. A parsed 0 is a placeholder or a
    // failed parse wearing a number, not a volume — and it produced
    // `manga-chapter:0 → volume:0` on the Strong World prologue, a
    // one-shot that belongs to no volume at all. Note the asymmetry
    // with `number`: chapter 0 IS legitimate (ADR-116), which is why
    // the property accepts it. The guard belongs to the volume
    // ordinal, not to zeros in general.
    if (volume !== null && volume >= 1) {
      relations.push({ type: 'part-of-volume', target: `volume:${volume}` });
      warnings.push(
        `part-of-volume targets volume:${volume} — the volume entity must exist before merge`,
      );
    } else {
      warnings.push(
        `no usable volume in "${cleanValue(volumeRaw)}" — part-of-volume not emitted`,
      );
    }
  }

  // `anime` reads "Episode 280" — the adaptation edge, and the only
  // manga→anime link the corpus can get from an infobox. The arc
  // ranges that would give the rest are computed at template
  // expansion and absent from the wikitext (ADR-119).
  const animeRaw = get('anime');
  if (animeRaw !== undefined) {
    const episode = parseLooseNumber(cleanValue(animeRaw).replace(/^\s*Episodes?\s*/i, ''));
    // Episodes are numbered from 1 too — same guard, same reason.
    if (episode !== null && episode >= 1) {
      relations.push({ type: 'adapted-by', target: `anime-episode:${episode}` });
      warnings.push(
        `adapted-by targets anime-episode:${episode} — the episode entity must exist before merge`,
      );
    } else {
      warnings.push(
        `no usable episode in "${cleanValue(animeRaw)}" — adapted-by not emitted`,
      );
    }
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
    translations: {
      en: translations,
      ...(Object.keys(ja).length > 0 ? { ja } : {}),
      ...(Object.keys(jaLatn).length > 0 ? { 'ja-latn': jaLatn } : {}),
    },
    warnings,
  };
}
