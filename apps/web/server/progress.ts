/**
 * Spoiler-gating primitives (WEB_APP.md § "Spoiler gating"). The
 * reader's progression is a per-axis cursor stored in the
 * `web_progress` cookie as JSON (`{"manga": 1044, "anime": 1071}`).
 * Absent cookie = no filtering (wiki default).
 *
 * Visibility rule (v1): a source anchor `manga-chapter:N` /
 * `anime-episode:N` with numeric N is visible iff N <= the matching
 * cursor axis. Anchors with no cursor on their axis, non-numeric
 * anchors and anchors on other source types (film, sbs…) stay visible
 * — a documented v1 limitation, not an accident.
 *
 * The axis ids are a presentation-layer binding to well-known source
 * types (ADR-091): unknown types degrade to "visible".
 */

export type ProgressCursor = {
  readonly manga: number | null;
  readonly anime: number | null;
};

export const EMPTY_CURSOR: ProgressCursor = { manga: null, anime: null };

/** Source entity types bound to cursor axes (presentation binding). */
const AXIS_BY_SOURCE_TYPE: Readonly<Record<string, keyof ProgressCursor>> = {
  'manga-chapter': 'manga',
  'anime-episode': 'anime',
};

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
  if (limit === null) return true;
  const rest = sourceId.slice(colon + 1);
  if (!/^\d+$/.test(rest)) return true;
  return Number(rest) <= limit;
}
