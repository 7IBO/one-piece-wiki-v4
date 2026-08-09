/**
 * The per-entity tint (ADR-103). The point of these tests is the
 * PROMISE, not the palette: whatever hue an id lands on, the page it
 * produces must be readable, deterministic, and paint only through
 * custom properties.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  contrastRatio,
  entityTint,
  MIN_ACCENT_CONTRAST,
  MIN_DISPLAY_CONTRAST,
  type Oklch,
  PAGE_CANVAS,
  relativeLuminance,
} from '../entity-tint.ts';

const IDS: readonly string[] = [
  'character:monkey-d-luffy',
  'character:roronoa-zoro',
  'character:nami',
  'character:sanji',
  'character:usopp',
  'crew:straw-hat-pirates',
  'arc:wano-country',
  'manga-chapter:1044',
  'devil-fruit:gomu-gomu',
  'event:battle-of-marineford',
  'volume:1',
  'location:water-seven',
  '',
];

/** Every hue on the wheel, so no test depends on the lucky ids above. */
const ALL_HUES: readonly string[] = Array.from({ length: 360 }, (_, i) => `hue-probe:${i}`);

function parseOklch(value: string): Oklch {
  const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (match === null) throw new Error(`not an oklch colour: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

describe('colour space', () => {
  test('relative luminance matches known sRGB anchors', () => {
    // oklch(1 0 h) is white, oklch(0 0 h) is black.
    expect(relativeLuminance({ l: 1, c: 0, h: 0 })).toBeCloseTo(1, 2);
    expect(relativeLuminance({ l: 0, c: 0, h: 0 })).toBeCloseTo(0, 4);
  });

  test('contrast ratio is symmetric and bounded by 21', () => {
    const white: Oklch = { l: 1, c: 0, h: 0 };
    const black: Oklch = { l: 0, c: 0, h: 0 };
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});

describe('the canvas constant tracks styles.css', () => {
  test('--color-canvas in the stylesheet is what contrast is measured against', () => {
    const css = readFileSync(resolve(import.meta.dirname, '..', '..', 'styles.css'), 'utf8');
    const declared = /--color-canvas:\s*(oklch\([^)]+\))/.exec(css);
    expect(declared).not.toBeNull();
    const parsed = parseOklch(declared?.[1] ?? '');
    expect(parsed.l).toBeCloseTo(PAGE_CANVAS.l, 3);
    expect(parsed.c).toBeCloseTo(PAGE_CANVAS.c, 3);
    expect(parsed.h).toBeCloseTo(PAGE_CANVAS.h, 1);
  });
});

describe('entityTint — determinism', () => {
  test('same id → identical chord, twice in a row', () => {
    for (const id of IDS) {
      expect(JSON.stringify(entityTint(id))).toBe(JSON.stringify(entityTint(id)));
    }
  });

  test('different entities of the same type get different hues', () => {
    const luffy = entityTint('character:monkey-d-luffy');
    const zoro = entityTint('character:roronoa-zoro');
    expect(luffy.hue).not.toBe(zoro.hue);
    expect(luffy.vars['--tint-accent']).not.toBe(zoro.vars['--tint-accent']);
    expect(luffy.vars['--art-1']).not.toBe(zoro.vars['--art-1']);
  });

  test('no shared state: call order never changes a result', () => {
    const solo = JSON.stringify(entityTint('character:nami'));
    entityTint('crew:straw-hat-pirates');
    entityTint('manga-chapter:1044');
    expect(JSON.stringify(entityTint('character:nami'))).toBe(solo);
  });
});

describe('entityTint — readability is guaranteed, not hoped for', () => {
  test('the accent clears WCAG AA body text against the canvas, on EVERY hue', () => {
    for (const id of [...IDS, ...ALL_HUES]) {
      const tint = entityTint(id);
      const ratio = contrastRatio(tint.accent, PAGE_CANVAS);
      expect(ratio).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    }
  });

  test('the hover accent stays at or above the plain accent contrast', () => {
    for (const id of ALL_HUES) {
      const tint = entityTint(id);
      const plain = contrastRatio(parseOklch(tint.vars['--tint-accent'] ?? ''), PAGE_CANVAS);
      const hover = contrastRatio(parseOklch(tint.vars['--tint-accent-hover'] ?? ''), PAGE_CANVAS);
      expect(hover).toBeGreaterThanOrEqual(plain - 0.001);
    }
  });

  test('the hero wash stays dark enough for display type to sit on it', () => {
    const bone: Oklch = { l: 0.938, c: 0.012, h: 85 };
    for (const id of ALL_HUES) {
      const wash = parseOklch(entityTint(id).vars['--tint-wash'] ?? '');
      expect(contrastRatio(bone, wash)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
      // …and the accent still reads against that wash at display sizes.
      const accent = entityTint(id).accent;
      expect(contrastRatio(accent, wash)).toBeGreaterThanOrEqual(MIN_DISPLAY_CONTRAST);
    }
  });

  test('the art ground never drifts light enough to grey out the artwork', () => {
    for (const id of ALL_HUES) {
      const bg = parseOklch(entityTint(id).vars['--art-bg'] ?? '');
      expect(bg.l).toBeLessThan(0.32);
      const ink = parseOklch(entityTint(id).vars['--art-ink'] ?? '');
      expect(ink.l).toBeLessThan(bg.l);
    }
  });
});

describe('entityTint — output shape', () => {
  test('every var is a custom property carrying a colour or a number', () => {
    for (const id of IDS) {
      const { vars } = entityTint(id);
      for (const [name, value] of Object.entries(vars)) {
        expect(name.startsWith('--')).toBe(true);
        expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(value).not.toMatch(/\b(?:rgba?|hsla?)\(/);
      }
      // The six art hues plus the ground pair are always present, so a
      // tinted subtree never inherits half of the global wheel.
      for (const token of ['--art-1', '--art-2', '--art-3', '--art-4', '--art-5', '--art-6']) {
        expect(vars[token]).toMatch(/^oklch\(/);
      }
      expect(vars['--art-bg']).toMatch(/^oklch\(/);
      expect(vars['--art-ink']).toMatch(/^oklch\(/);
    }
  });

  test('hue is a plain integer degree', () => {
    for (const id of ALL_HUES) {
      const { hue } = entityTint(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
