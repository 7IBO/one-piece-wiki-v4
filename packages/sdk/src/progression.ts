/**
 * User progression and source reachability.
 *
 * Phase 2 ships the linear single-medium version: a progression is
 * keyed by manga chapter number; a source is reachable when its
 * chapter number is <= the progression. Cross-medium reachability
 * (anime episode equivalences, film references) joins the model when
 * those entity types are introduced.
 */
export type Progression = {
  readonly manga_chapter?: number;
};

const CHAPTER_NUMBER_RE = /(\d+)$/;

export function sourceChapterNumber(source: string): number | null {
  const [type, slug = ''] = source.split(':');
  if (type !== 'manga-chapter') return null;
  const match = CHAPTER_NUMBER_RE.exec(slug);
  return match === null ? null : Number(match[1]);
}

export function isReachable(source: string | null | undefined, progression: Progression): boolean {
  if (source === null || source === undefined) return true;
  if (source.startsWith('manga-chapter:')) {
    const num = sourceChapterNumber(source);
    if (num === null) return false;
    const at = progression.manga_chapter ?? Number.POSITIVE_INFINITY;
    return num <= at;
  }
  // Pre-canon sources, events, and other non-chapter refs are reachable
  // once any user progression exists. Refined when those source types
  // gain their own checkpoint logic.
  return true;
}
