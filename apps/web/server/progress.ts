/**
 * Spoiler-gating primitives (WEB_APP.md § "Spoiler gating"). The
 * reader's progression is a per-axis cursor stored in the
 * `web_progress` cookie as JSON (`{"manga": 1044, "anime": 1071}`).
 * Absent cookie = no filtering (wiki default).
 *
 * Visibility rule: a source anchor `manga-chapter:N` /
 * `anime-episode:N` with numeric N is visible iff N <= the matching
 * cursor axis. Non-numeric anchors and anchors on source types that
 * are not axes (film, sbs…) stay visible — they are unfilterable.
 *
 * **An axis the reader left EMPTY counts as zero, as soon as they set
 * another one.** Declaring a position is declaring your whole
 * position: a reader who says « manga chapter 100 » and nothing about
 * the anime has not told us where they are in the anime, and the old
 * rule answered that by showing them everything — episode 1071's title
 * is « Luffy's Peak - Attained! Gear 5 », handed to someone at chapter
 * 100. That is the one promise this site makes, failing in the most
 * visible way possible.
 *
 * A reader who has set NOTHING is a different case and keeps the wiki
 * default: nothing is filtered, because they have not asked to be
 * protected and an empty site would be the wrong welcome.
 *
 * The axis ids are a presentation-layer binding to well-known source
 * types (ADR-091): unknown types degrade to "visible".
 */

export type ProgressCursor = {
  readonly manga: number | null;
  readonly anime: number | null;
};

export const EMPTY_CURSOR: ProgressCursor = { manga: null, anime: null };

/**
 * The cursor axes, each bound to the SOURCE ENTITY TYPE whose ordinals
 * it counts (a presentation binding, ADR-091 — a source type absent
 * from this list is simply unfilterable, hence visible).
 *
 * This is the single declaration of the binding: the lookup below is
 * derived from it, and so is the search index's SQL gate predicate
 * (`server/search-sql.ts`), so adding an axis never means editing a
 * hand-written SQL string.
 */
export const CURSOR_AXES: readonly {
  readonly axis: keyof ProgressCursor;
  readonly sourceType: string;
}[] = [
  { axis: 'manga', sourceType: 'manga-chapter' },
  { axis: 'anime', sourceType: 'anime-episode' },
];

/** Source entity types bound to cursor axes (presentation binding). */
const AXIS_BY_SOURCE_TYPE: Readonly<Record<string, keyof ProgressCursor>> = Object.fromEntries(
  CURSOR_AXES.map((entry) => [entry.sourceType, entry.axis]),
);

function toChapterNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 0 ? n : null;
}

/** True when at least one axis is set — i.e. filtering applies. */
export function cursorActive(cursor: ProgressCursor): boolean {
  return cursor.manga !== null || cursor.anime !== null;
}

/**
 * Parse the raw `web_progress` cookie value. Tolerant by design: any
 * malformed payload yields the empty cursor (no filtering) rather
 * than an error — a bad cookie must never take the site down.
 */
export function parseProgressCookie(raw: string | null | undefined): ProgressCursor {
  if (raw === null || raw === undefined || raw === '') return EMPTY_CURSOR;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Not URI-encoded — use as-is.
  }
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (parsed === null || typeof parsed !== 'object') return EMPTY_CURSOR;
    const record = parsed as Record<string, unknown>;
    return {
      manga: toChapterNumber(record['manga']),
      anime: toChapterNumber(record['anime']),
    };
  } catch {
    return EMPTY_CURSOR;
  }
}

/**
 * Is a relation's END (`until` anchor) knowledge the reader has?
 * Spoiler rule for memberships (WEB_APP.md): a departure anchored
 * beyond the cursor must render as if it never happened — the member
 * shows as CURRENT until the reader reaches the departure source.
 * `null` until = the relation never ended. No cursor = wiki default,
 * everything (including departures) is visible.
 */
export function isDepartureVisible(
  untilSource: string | null,
  cursor: ProgressCursor,
): boolean {
  return untilSource !== null && isSourceVisible(untilSource, cursor);
}

/**
 * Is a source anchor (`manga-chapter:1044`, `anime-episode:12`, …)
 * within the reader's progression? `null`/`undefined` anchors are
 * always visible (no `since` = timeless value).
 */
export function isSourceVisible(
  sourceId: string | null | undefined,
  cursor: ProgressCursor,
): boolean {
  if (sourceId === null || sourceId === undefined) return true;
  const colon = sourceId.indexOf(':');
  if (colon === -1) return true;
  const axis = AXIS_BY_SOURCE_TYPE[sourceId.slice(0, colon)];
  if (axis === undefined) return true;
  const limit = cursor[axis];
  // Axe vide : invisible dès qu'une position est déclarée ailleurs,
  // visible tant qu'aucune ne l'est.
  if (limit === null) return !cursorActive(cursor);
  const rest = sourceId.slice(colon + 1);
  if (!/^\d+$/.test(rest)) return true;
  return Number(rest) <= limit;
}
