/**
 * The per-entity tint (ADR-103, chord set re-authored by ADR-111). The
 * point of these tests is the PROMISE, not the individual swatches:
 * whichever chord an id lands on, the page it produces must be
 * readable, deterministic, and painted only through custom properties.
 *
 * ADR-111 replaced ADR-104's warm band (12°–100°, everything anchored
 * on gold) with a twelve-chord shelf that walks the whole wheel. The
 * band test went with it, and THREE structural tests took its place —
 * they are what stops the shelf from decaying back into the random
 * wheel that failed before:
 *
 *  - every chord's hue is one of the closed `PALETTE_ANCHORS`;
 *  - every colour of a chord sits within `CHORD_HUE_SPREAD` of it;
 *  - every artwork ground obeys `GROUND` — dark and barely chromatic,
 *    so the twelve share one deep-water field.
 *
 * Plus a fourth: the neutral chrome art tokens in `styles.css` ARE one
 * of the authored chords, byte for byte, so an untinted surface can
 * never become an unauthored thirteenth colour.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHORD_HUE_SPREAD,
  CHROME_CHORD_NAME,
  chromeArtTokens,
  contrastRatio,
  entityTint,
  GROUND,
  hueDistance,
  MIN_ACCENT_CONTRAST,
  MIN_DISPLAY_CONTRAST,
  type Oklch,
  PAGE_CANVAS,
  PALETTE_ANCHORS,
  relativeLuminance,
  TINT_CHORDS,
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

/**
 * Enough probes to land on every authored chord many times over, so
 * no test depends on the lucky ids above. (Replaces the old 360-hue
 * sweep: the palette is a curated list now, not a wheel.)
 */
const PROBES: readonly string[] = Array.from({ length: 400 }, (_, i) => `chord-probe:${i}`);

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

// ---------------------------------------------------------------------------
// ADR-111 — the palette is a curated SHELF, not a wheel. These are the
// tests that stop it from decaying back into random colours.

describe('the authored palette is a closed, coherent shelf', () => {
  const every = (chord: (typeof TINT_CHORDS)[number]): readonly Oklch[] => [
    chord.accent,
    chord.wash,
    chord.surface,
    chord.bg,
    chord.ink,
    chord.glow,
    ...chord.stops,
  ];

  test('every chord is anchored on one of the authored hues', () => {
    for (const chord of TINT_CHORDS) {
      expect(PALETTE_ANCHORS, chord.name).toContain(chord.hue);
    }
    // …and the shelf uses each anchor exactly once, so the walk round
    // the wheel has no gap and no doubled rung.
    expect(TINT_CHORDS.map((chord) => chord.hue).sort((a, b) => a - b))
      .toEqual([...PALETTE_ANCHORS].sort((a, b) => a - b));
  });

  test('a chord is ONE colour with its shades, not an assortment', () => {
    for (const chord of TINT_CHORDS) {
      for (const color of every(chord)) {
        expect(hueDistance(color.h, chord.hue), `${chord.name} @ ${color.h}`)
          .toBeLessThanOrEqual(CHORD_HUE_SPREAD);
      }
    }
  });

  test('every ground is a dark, barely chromatic slate — the one shared field', () => {
    for (const chord of TINT_CHORDS) {
      expect(chord.bg.l, chord.name).toBeGreaterThanOrEqual(GROUND.minL);
      expect(chord.bg.l, chord.name).toBeLessThanOrEqual(GROUND.maxL);
      expect(chord.bg.c, chord.name).toBeLessThanOrEqual(GROUND.maxChroma);
      expect(chord.ink.c, chord.name).toBeLessThanOrEqual(GROUND.maxChroma);
    }
  });

  test('the neutral chrome art tokens in styles.css ARE an authored chord', () => {
    const css = readFileSync(resolve(import.meta.dirname, '..', '..', 'styles.css'), 'utf8');
    const declared = new Map(
      [...css.matchAll(/(--art-[a-z0-9-]+):\s*(oklch\([^)]+\))/g)]
        .map((match) => [match[1] ?? '', match[2] ?? ''] as const),
    );
    const expected = chromeArtTokens();
    expect(Object.keys(expected)).toHaveLength(9);
    for (const [token, value] of Object.entries(expected)) {
      expect(declared.get(token), token).toBe(value);
    }
    expect(TINT_CHORDS.some((chord) => chord.name === CHROME_CHORD_NAME)).toBe(true);
  });

  test('straw-hat yellow opens the shelf, and the ocean carries the chrome', () => {
    const first = TINT_CHORDS[0];
    expect(first.name).toBe('paille');
    expect(first.hue).toBeGreaterThanOrEqual(85);
    expect(first.hue).toBeLessThanOrEqual(100);
    // The chrome chord is a blue: the site's resting state is the sea.
    const chrome = TINT_CHORDS.find((chord) => chord.name === CHROME_CHORD_NAME);
    expect(chrome?.hue).toBeGreaterThanOrEqual(200);
    expect(chrome?.hue).toBeLessThanOrEqual(280);
  });

  test('names are unique and the list is big enough to differentiate entities', () => {
    expect(TINT_CHORDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TINT_CHORDS.map((chord) => chord.name)).size).toBe(TINT_CHORDS.length);
  });

  test('every chord carries real value structure — the shelf is not flat', () => {
    for (const chord of TINT_CHORDS) {
      // Ground below the highlight, mass below the ground.
      expect(chord.ink.l).toBeLessThan(chord.bg.l);
      expect(chord.bg.l).toBeLessThan(0.32);
      expect(chord.glow.l).toBeGreaterThan(0.9);
      // The six paints must span light AND dark, whichever triad the
      // generator draws from them.
      const lights = chord.stops.map((stop) => stop.l);
      expect(Math.max(...lights) - Math.min(...lights)).toBeGreaterThanOrEqual(0.4);
    }
  });

  test('the chords differ from each other in value, not only in hue', () => {
    const grounds = TINT_CHORDS.map((chord) => chord.bg.l);
    expect(Math.max(...grounds) - Math.min(...grounds)).toBeGreaterThanOrEqual(0.1);
  });

  test('the shelf really spans the wheel — a wall of pages is not monotone', () => {
    // The failure ADR-111 exists to fix: ten chords inside 88° of hue.
    const hues = TINT_CHORDS.map((chord) => chord.hue).sort((a, b) => a - b);
    const gaps = hues.map((hue, index) =>
      index === 0 ? hue + 360 - (hues[hues.length - 1] ?? hue) : hue - (hues[index - 1] ?? hue)
    );
    // No two neighbours closer than 15°, none further than 60°: the
    // walk is even, which is what "curated" means here.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(15);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60);
  });
});

describe('entityTint — determinism', () => {
  test('same id → identical chord, twice in a row', () => {
    for (const id of IDS) {
      expect(JSON.stringify(entityTint(id))).toBe(JSON.stringify(entityTint(id)));
    }
  });

  test('different entities of the same type get different chords', () => {
    const luffy = entityTint('character:monkey-d-luffy');
    const zoro = entityTint('character:roronoa-zoro');
    expect(luffy.chord).not.toBe(zoro.chord);
    expect(luffy.vars['--tint-accent']).not.toBe(zoro.vars['--tint-accent']);
    expect(luffy.vars['--art-1']).not.toBe(zoro.vars['--art-1']);
  });

  test('the hash reaches every authored chord', () => {
    const seen = new Set(PROBES.map((id) => entityTint(id).chord));
    expect(seen.size).toBe(TINT_CHORDS.length);
  });

  test('no shared state: call order never changes a result', () => {
    const solo = JSON.stringify(entityTint('character:nami'));
    entityTint('crew:straw-hat-pirates');
    entityTint('manga-chapter:1044');
    expect(JSON.stringify(entityTint('character:nami'))).toBe(solo);
  });
});

describe('entityTint — readability is guaranteed, not hoped for', () => {
  test('the accent clears WCAG AA body text against the canvas, on EVERY chord', () => {
    for (const id of [...IDS, ...PROBES]) {
      const tint = entityTint(id);
      const ratio = contrastRatio(tint.accent, PAGE_CANVAS);
      expect(ratio).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    }
  });

  test('the hover accent stays at or above the plain accent contrast', () => {
    for (const id of PROBES) {
      const tint = entityTint(id);
      const plain = contrastRatio(parseOklch(tint.vars['--tint-accent'] ?? ''), PAGE_CANVAS);
      const hover = contrastRatio(parseOklch(tint.vars['--tint-accent-hover'] ?? ''), PAGE_CANVAS);
      expect(hover).toBeGreaterThanOrEqual(plain - 0.001);
    }
  });

  test('the hero wash stays dark enough for display type to sit on it', () => {
    const bone: Oklch = { l: 0.965, c: 0.008, h: 240 };
    for (const id of PROBES) {
      const wash = parseOklch(entityTint(id).vars['--tint-wash'] ?? '');
      expect(contrastRatio(bone, wash)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
      // …and the accent still reads against that wash at display sizes.
      const accent = entityTint(id).accent;
      expect(contrastRatio(accent, wash)).toBeGreaterThanOrEqual(MIN_DISPLAY_CONTRAST);
    }
  });

  test('the art ground never drifts light enough to grey out the artwork', () => {
    for (const id of PROBES) {
      const bg = parseOklch(entityTint(id).vars['--art-bg'] ?? '');
      expect(bg.l).toBeLessThan(GROUND.maxL + 0.001);
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
      // The six art paints plus the ground trio are always present, so
      // a tinted subtree never inherits half of the neutral palette.
      for (const token of ['--art-1', '--art-2', '--art-3', '--art-4', '--art-5', '--art-6']) {
        expect(vars[token]).toMatch(/^oklch\(/);
      }
      expect(vars['--art-bg']).toMatch(/^oklch\(/);
      expect(vars['--art-ink']).toMatch(/^oklch\(/);
      expect(vars['--art-glow']).toMatch(/^oklch\(/);
    }
  });

  test('hue is a plain integer degree from the authored shelf', () => {
    for (const id of PROBES) {
      const { hue } = entityTint(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(PALETTE_ANCHORS).toContain(hue);
    }
  });
});
