/**
 * Tripwire on the `number` property's lower bound (ADR-116).
 *
 * `min` was 1, which encoded "works are numbered from 1". One Piece
 * disproves it: **Chapter 0** is a real one-shot — the Strong World
 * prologue, Weekly Shonen Jump 2009 — with its own Fandom page. The
 * constraint did not guard against bad data, it rejected a true work,
 * and it took a 398-chapter import down with it.
 *
 * The bound is data, not code, so nothing else would notice it being
 * tightened back: the generated Zod carries no literal for it (the
 * constraint is applied at validation time by `entity-schema.ts`) and
 * `check:compat` does not track value_constraints. Hence this test.
 */
import { describe, expect, it } from 'bun:test';

describe('the `number` property accepts 0', () => {
  it('keeps min at 0 — chapter/episode 0 are real works', async () => {
    const raw = await Bun.file('data/schemas/property-types/number.json').json() as {
      value_constraints?: { min?: number; };
      applies_to_entity_types?: readonly string[];
    };
    expect(raw.value_constraints?.min).toBe(0);
  });

  it('still applies to every ordinal-bearing source type', async () => {
    const raw = await Bun.file('data/schemas/property-types/number.json').json() as {
      applies_to_entity_types?: readonly string[];
    };
    // Widening the bound must not have narrowed the reach: all four
    // types are numbered works and all four can carry a 0.
    expect(raw.applies_to_entity_types).toEqual([
      'manga-chapter',
      'anime-episode',
      'live-action-episode',
      'volume',
    ]);
  });
});
