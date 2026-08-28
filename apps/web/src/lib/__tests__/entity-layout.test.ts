/**
 * The ADR-105 invariant: a per-type layout may reorder and re-weight
 * the modules of an entity page, but it can NEVER make one
 * unreachable. `bandsFor()` must therefore always cover every slot —
 * for each authored type AND for a type nobody authored.
 */
import { describe, expect, test } from 'bun:test';
import {
  ALL_SLOTS,
  bandsFor,
  GENERIC_LAYOUT,
  type LayoutBand,
  layoutFor,
  missingSlots,
  type SlotKey,
  slotsOfBand,
} from '../entity-layout.ts';

/** Types with an authored layout — plus a few that have none. */
const AUTHORED: readonly string[] = [
  'character',
  'crew',
  'organization',
  'devil-fruit',
  'arc',
  'saga',
  'volume',
  'manga-chapter',
  'anime-episode',
  'live-action-episode',
  'film',
  'live-action-series',
  'event',
  'document',
  'reference',
  'image',
];

const UNKNOWN: readonly string[] = ['databook', 'theme-song', 'not-a-real-type-at-all'];

// Uses the library's own walker rather than a copy of it: this test
// re-implemented the `split` case and went stale the day a third band
// kind arrived.
function slotsOf(bands: readonly LayoutBand[]): readonly SlotKey[] {
  return bands.flatMap(slotsOfBand);
}

describe('per-type entity layouts (ADR-105)', () => {
  test('every authored type renders every module', () => {
    for (const type of AUTHORED) {
      const rendered = new Set(slotsOf(bandsFor(type)));
      for (const slot of ALL_SLOTS) {
        expect({ type, slot, present: rendered.has(slot) }).toEqual({
          type,
          slot,
          present: true,
        });
      }
    }
  });

  test('an unauthored type degrades to the generic layout, complete', () => {
    for (const type of UNKNOWN) {
      expect(layoutFor(type)).toBe(GENERIC_LAYOUT);
      expect(new Set(slotsOf(bandsFor(type))).size).toBe(ALL_SLOTS.length);
    }
  });

  test('the generic layout names every slot on its own', () => {
    expect(missingSlots(GENERIC_LAYOUT)).toEqual([]);
  });

  test('no slot is rendered twice in one layout', () => {
    for (const type of [...AUTHORED, ...UNKNOWN]) {
      const rendered = slotsOf(bandsFor(type));
      expect(new Set(rendered).size).toBe(rendered.length);
    }
  });

  test('authored layouts differ from one another (each page is its own)', () => {
    const shapes = new Set(
      AUTHORED.map((type) => JSON.stringify(layoutFor(type).bands)),
    );
    // Crew/organization and arc/saga deliberately share a shape; the
    // rest must not all collapse onto one template.
    expect(shapes.size).toBeGreaterThan(6);
  });

  test('every authored type has a hero figure shape', () => {
    for (const type of AUTHORED) {
      expect(['poster', 'plate']).toContain(layoutFor(type).figure);
    }
  });
});
