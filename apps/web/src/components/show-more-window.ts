/**
 * First index of `ShowMoreList`'s collapsed window.
 *
 * Without an anchor the window is the head, which is right for an
 * unordered connection list. A POSITIONAL list has a wrong answer the
 * others do not: the arc ribbon on chapter 1044 folded to 909–944 and
 * hid the reader's own chapter — the only cell the ribbon exists to
 * show. With an anchor the window centres on it, clamped so it never
 * runs past either end.
 */
export function collapsedStart(
  anchorIndex: number | undefined,
  limit: number,
  total: number,
): number {
  if (anchorIndex === undefined) return 0;
  const last = Math.max(total - limit, 0);
  return Math.min(Math.max(anchorIndex - Math.floor(limit / 2), 0), last);
}
