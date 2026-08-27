/**
 * The collapsed window of `ShowMoreList`. Extracted as a pure
 * function because that is the whole of the decision — which slice
 * gets painted — and it had a wrong answer for positional lists.
 */
import { describe, expect, test } from 'bun:test';
import { collapsedStart } from '../show-more-window.ts';

describe('collapsedStart', () => {
  test('with no anchor the window starts at the head', () => {
    expect(collapsedStart(undefined, 40, 149)).toBe(0);
  });

  test('centres on the anchor when it sits past the window', () => {
    // Chapter 1044 is index 135 of Wano's 149. Head-slicing painted
    // 909–944 and hid the reader's own chapter.
    expect(collapsedStart(135, 40, 149)).toBe(109);
  });

  test('never runs past the end', () => {
    // The last item: the window backs off rather than overshooting.
    expect(collapsedStart(148, 40, 149)).toBe(109);
  });

  test('never runs before the head', () => {
    expect(collapsedStart(2, 40, 149)).toBe(0);
  });

  test('a list shorter than the window stays at the head', () => {
    expect(collapsedStart(3, 40, 5)).toBe(0);
  });

  test('the anchor is always inside the painted window', () => {
    for (const total of [5, 41, 149, 1193]) {
      for (const anchor of [0, 1, Math.floor(total / 2), total - 2, total - 1]) {
        if (anchor < 0) continue;
        const start = collapsedStart(anchor, 40, total);
        expect(start).toBeLessThanOrEqual(anchor);
        expect(anchor).toBeLessThan(start + 40);
      }
    }
  });
});
