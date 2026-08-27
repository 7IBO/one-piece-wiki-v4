/**
 * Enriching a manga chapter from its RENDERED infobox (ADR-119's
 * second substrate, now applied to chapters).
 *
 * ## Why this exists
 *
 * The wikitext chapter mapper reads `vol`, `anime` and the release
 * date and emits almost nothing. Measured on the corpus after a full
 * category crawl of 1193 chapters:
 *
 * | field         | from wikitext |
 * |---------------|---------------|
 * | `part-of-volume` |     1 / 1193 |
 * | `adapted-by`     |     0 / 1193 |
 * | `released_at`    |    10 / 1193 (all hand-seeded, none imported) |
 * | `page_count`     |   251 / 1193 |
 *
 * The same five pages fetched with `prop=text` carry every one of
 * them, on all five. It is the arc-range finding again: the values
 * are computed at template-expansion time and `prop=wikitext` can
 * never see them. So the chapter substrate is the rendered page.
 *
 * Everything below was written against `__tests__/fixtures/rendered/
 * Chapter_*.infobox.html` — SLICES of real captures, never authored.
 */
import { parseRenderedInfobox } from './rendered-box.ts';
import { parseLooseDate, parseLooseNumber } from './wikitext.ts';

export type ChapterEnrichment = {
  /** The chapter the infobox says it is — the join key. */
  readonly number: number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly relations: readonly { readonly type: string; readonly target: string; }[];
  readonly translations: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly warnings: readonly string[];
};

/**
 * A rendered date carries a footnote marker: "March 28, 2022 [ref]".
 * The marker is apparatus, not part of the date, and `new Date` reads
 * the whole string — so it must go before parsing, not after.
 */
function readDate(raw: string): string | null {
  return parseLooseDate(raw.replace(/\[\s*ref\s*\]/gi, '').trim());
}

/**
 * Episode numbers named by the `anime` field.
 *
 * The field is a run of adaptations with page ranges, and chapter 1
 * is the case that shapes the rule:
 *
 *   "We Are! (p. 1, 49-51) Episode 4 (p. 6-47) Episode 504 (p. 48-53)
 *    Episode of Luffy (p. 4-47) Episode of East Blue (p. 4-53)
 *    Episode 878 (p. 4-21, 27-53)"
 *
 * Three of those six are NOT episodes: an opening theme and two TV
 * specials. Matching `Episode <digits>` excludes them by construction
 * rather than by a list of exceptions to maintain — "Episode of
 * Luffy" has no number, so it cannot be mistaken for one.
 */
export function parseAdaptedEpisodes(raw: string): readonly number[] {
  const out: number[] = [];
  for (const match of raw.matchAll(/\bEpisode\s+(\d+)\b/gi)) {
    const value = Number(match[1]);
    // Episodes are numbered from 1; a 0 here is a parse artefact.
    if (value >= 1 && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * The Japanese title as rendered. A ruby annotation flattens to
 * `BASE （ FURIGANA ）` in the html — the reading is a pronunciation
 * aid, not part of the title, so it is dropped the same way
 * `unwrapRuby` drops it on the wikitext side.
 */
export function stripFurigana(raw: string): string {
  return raw.replace(/\s*（[^）]*）\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Read one rendered chapter page. Returns null when the page carries
 * no chapter infobox or no usable ordinal — there is nothing to join
 * an enrichment to without one.
 */
export function enrichChapterFromRendered(html: string): ChapterEnrichment | null {
  const box = parseRenderedInfobox(html);
  const chapterRaw = box.get('chapter');
  if (chapterRaw === undefined) return null;
  const number = parseLooseNumber(chapterRaw);
  // Chapter 0 IS legitimate (ADR-116, the Strong World prologue), so
  // the guard is on `null`, not on falsiness.
  if (number === null) return null;

  const properties: Record<string, unknown> = {};
  const relations: { type: string; target: string; }[] = [];
  const en: Record<string, string> = {};
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const warnings: string[] = [];

  const volumeRaw = box.get('vol');
  if (volumeRaw !== undefined) {
    const volume = parseLooseNumber(volumeRaw);
    // A tankōbon is numbered from 1 — same guard as the wikitext
    // mapper, same reason (chapter 0 belongs to no volume).
    if (volume !== null && volume >= 1) {
      relations.push({ type: 'part-of-volume', target: `volume:${volume}` });
    } else warnings.push(`no usable volume in "${volumeRaw}" — part-of-volume not emitted`);
  }

  const pageRaw = box.get('page');
  if (pageRaw !== undefined) {
    const pages = parseLooseNumber(pageRaw);
    if (pages !== null && pages >= 1) properties['page_count'] = { value: pages };
    else warnings.push(`no usable page count in "${pageRaw}"`);
  }

  const dateRaw = box.get('date2');
  if (dateRaw !== undefined) {
    const date = readDate(dateRaw);
    // The date is the JAPANESE serialisation in Weekly Shōnen Jump —
    // `date2` sits next to `jump`, which names the issue.
    if (date !== null) properties['released_at'] = { value: date, territory: 'jp' };
    else warnings.push(`unparseable release date: "${dateRaw}"`);
  }

  const animeRaw = box.get('anime');
  if (animeRaw !== undefined) {
    const episodes = parseAdaptedEpisodes(animeRaw);
    for (const episode of episodes) {
      relations.push({ type: 'adapted-by', target: `anime-episode:${episode}` });
    }
    if (episodes.length === 0) warnings.push(`no episode number in anime field: "${animeRaw}"`);
  }

  const key = `manga-chapter.${number}.title`;
  const ename = box.get('ename')?.trim();
  if (ename !== undefined && ename !== '') en[key] = ename;
  const jname = box.get('jname');
  if (jname !== undefined) {
    const stripped = stripFurigana(jname);
    if (stripped !== '') ja[key] = stripped;
  }
  const rname = box.get('rname')?.trim();
  if (rname !== undefined && rname !== '') jaLatn[key] = rname;

  const translations: Record<string, Record<string, string>> = {};
  if (Object.keys(en).length > 0) translations['en'] = en;
  if (Object.keys(ja).length > 0) translations['ja'] = ja;
  if (Object.keys(jaLatn).length > 0) translations['ja-latn'] = jaLatn;

  return { number, properties, relations, translations, warnings };
}

/**
 * Is this stored chapter title a SEED rather than a translation?
 *
 * `stageToLocal` merges translations with "existing keys win", and
 * that rule is right: an import must never clobber a human
 * translation. But it cannot tell a human translation from a
 * placeholder the project seeded itself, and 9 chapters were stuck
 * with `"Chapter 1044"` while their neighbours carried real titles.
 *
 * The seed has one shape and only one — the literal word `Chapter`
 * followed by the chapter's own number. Anything else is somebody's
 * work and is left alone, including a real title that happens to
 * start with the word.
 */
export function isSeededChapterTitle(number: number, stored: string): boolean {
  return stored.trim().toLowerCase() === `chapter ${number}`;
}
