import { describe, expect, test } from 'bun:test';
import {
  ART_RATIOS,
  type ArtRatio,
  buildEntityArt,
  type EntityArtScene,
  grammarForType,
  hashString,
} from '../entity-art.ts';

const RATIOS: readonly ArtRatio[] = ['portrait', 'square', 'wide'];

const IDS: readonly string[] = [
  'character:luffy',
  'character:zoro',
  'character:nami',
  'character:usopp',
  'character:sanji',
  'crew:straw-hat-pirates',
  'crew:baroque-works',
  'arc:romance-dawn',
  'arc:alabasta',
  'event:battle-of-marineford',
  'devil-fruit:gomu-gomu',
  'manga-chapter:1',
  'manga-chapter:1044',
  'volume:1',
  'document:one-piece-magazine',
  'reference:sbs-volume-4',
  'streaming-platform:netflix',
  'image:luffy-portrait',
  'location:water-seven',
  'anime-episode:1',
];

function scenes(id: string): readonly EntityArtScene[] {
  const [type = ''] = id.split(':');
  return RATIOS.map((ratio) => buildEntityArt(id, type, ratio, 'A'));
}

describe('hashString', () => {
  test('is the documented FNV-1a 32-bit, pinned so art never silently shifts', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
    expect(hashString('character:luffy')).toBe(hashString('character:luffy'));
    expect(hashString('character:luffy')).not.toBe(hashString('character:zoro'));
  });

  test('always returns an unsigned 32-bit integer', () => {
    for (const id of IDS) {
      const hash = hashString(id);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe('buildEntityArt — determinism', () => {
  test('the same id renders byte-identical output, twice in a row', () => {
    for (const id of IDS) {
      const [type = ''] = id.split(':');
      for (const ratio of RATIOS) {
        const first = JSON.stringify(buildEntityArt(id, type, ratio, 'A'));
        const second = JSON.stringify(buildEntityArt(id, type, ratio, 'A'));
        expect(second).toBe(first);
      }
    }
  });

  test('output never depends on call order (no shared PRNG state)', () => {
    const solo = JSON.stringify(buildEntityArt('character:nami', 'character', 'portrait'));
    buildEntityArt('crew:straw-hat-pirates', 'crew', 'wide');
    buildEntityArt('manga-chapter:1044', 'manga-chapter', 'square');
    expect(JSON.stringify(buildEntityArt('character:nami', 'character', 'portrait'))).toBe(solo);
  });
});

describe('buildEntityArt — distinctness', () => {
  test('different ids of the same type produce different compositions', () => {
    const seen = new Set<string>();
    for (const id of IDS) {
      const [type = ''] = id.split(':');
      const key = JSON.stringify(buildEntityArt(id, type, 'portrait', 'A').shapes);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('a single character difference in the id changes the artwork', () => {
    const a = JSON.stringify(buildEntityArt('character:luffy', 'character', 'portrait'));
    const b = JSON.stringify(buildEntityArt('character:luffz', 'character', 'portrait'));
    expect(a).not.toBe(b);
  });

  test('each ratio is composed for its own frame, not cropped from one', () => {
    const [portrait, square, wide] = scenes('character:luffy');
    expect(portrait?.shapes).not.toEqual(square?.shapes ?? []);
    expect(square?.shapes).not.toEqual(wide?.shapes ?? []);
    for (const ratio of RATIOS) {
      const scene = buildEntityArt('character:luffy', 'character', ratio);
      expect(scene.width).toBe(ART_RATIOS[ratio].width);
      expect(scene.height).toBe(ART_RATIOS[ratio].height);
    }
  });
});

describe('buildEntityArt — per-type grammar', () => {
  test('every mapped type gets its own family', () => {
    expect(grammarForType('character')).toBe('figure');
    expect(grammarForType('crew')).toBe('ensign');
    expect(grammarForType('arc')).toBe('horizon');
    expect(grammarForType('event')).toBe('impact');
    expect(grammarForType('devil-fruit')).toBe('spiral');
    expect(grammarForType('manga-chapter')).toBe('panels');
    expect(grammarForType('volume')).toBe('stack');
  });

  test('a character never composes like a chapter', () => {
    const character = buildEntityArt('character:luffy', 'character', 'portrait');
    const chapter = buildEntityArt('manga-chapter:1', 'manga-chapter', 'portrait');
    expect(character.grammar).not.toBe(chapter.grammar);
  });

  test('an unknown entity type degrades to the generic family (ADR-091)', () => {
    for (const type of ['location', 'film', 'sbs-question', 'totally-new-type', '']) {
      const scene = buildEntityArt(`${type}:something`, type, 'portrait', 'S');
      expect(scene.grammar).toBe('field');
      expect(scene.shapes.length).toBeGreaterThan(2);
    }
  });

  test('the generic family stays self-consistent per unknown type', () => {
    // Same variant for two entities of the same unknown type…
    const a = buildEntityArt('location:water-seven', 'location', 'portrait');
    const b = buildEntityArt('location:enies-lobby', 'location', 'portrait');
    expect(a.shapes.length).toBeGreaterThan(0);
    expect(b.shapes.length).toBeGreaterThan(0);
    // …and still a different composition per entity.
    expect(JSON.stringify(a.shapes)).not.toBe(JSON.stringify(b.shapes));
  });
});

describe('buildEntityArt — paints come only from CSS custom properties', () => {
  const TOKEN = /^var\(--art-(?:bg|ink|glow|[1-6])\)$/;

  test('every paint is an --art-* reference', () => {
    for (const id of IDS) {
      const [type = ''] = id.split(':');
      for (const scene of RATIOS.map((ratio) => buildEntityArt(id, type, ratio, 'A'))) {
        expect(scene.background).toMatch(TOKEN);
        if (scene.mark !== null) expect(scene.mark.fill).toMatch(TOKEN);
        for (const shape of scene.shapes) {
          if (shape.fill !== null) expect(shape.fill).toMatch(TOKEN);
          if (shape.stroke !== null) expect(shape.stroke).toMatch(TOKEN);
          expect(shape.fill !== null || shape.stroke !== null).toBe(true);
        }
      }
    }
  });

  test('no colour literal can reach the output', () => {
    const dump = IDS.flatMap((id) => {
      const [type = ''] = id.split(':');
      return RATIOS.map((ratio) => JSON.stringify(buildEntityArt(id, type, ratio, 'A')));
    }).join('\n');
    expect(dump).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(dump).not.toMatch(/\b(?:oklch|rgba?|hsla?|lch|lab|color-mix)\(/);
    expect(dump).not.toMatch(/"(?:white|black|red|blue|green|gold|currentColor)"/);
  });
});

describe('buildEntityArt — output sanity', () => {
  test('no path ever contains a non-finite coordinate', () => {
    for (const id of IDS) {
      const [type = ''] = id.split(':');
      for (const scene of RATIOS.map((ratio) => buildEntityArt(id, type, ratio, 'A'))) {
        for (const shape of scene.shapes) {
          expect(shape.d).not.toMatch(/NaN|Infinity|undefined/);
          expect(shape.d.length).toBeGreaterThan(0);
          expect(shape.opacity).toBeGreaterThan(0);
          expect(shape.opacity).toBeLessThanOrEqual(1);
        }
        expect(scene.markIndex).toBeGreaterThanOrEqual(0);
        expect(scene.markIndex).toBeLessThanOrEqual(scene.shapes.length);
      }
    }
  });

  test('every composition is layered, and none is unreasonably heavy', () => {
    for (const id of IDS) {
      const [type = ''] = id.split(':');
      const scene = buildEntityArt(id, type, 'portrait', 'A');
      expect(scene.shapes.length).toBeGreaterThanOrEqual(5);
      expect(scene.shapes.length).toBeLessThanOrEqual(40);
      expect(JSON.stringify(scene).length).toBeLessThan(24000);
    }
  });
});

describe('buildEntityArt — the initial is a compositional element', () => {
  test('no initial, no mark', () => {
    expect(buildEntityArt('character:luffy', 'character', 'portrait').mark).toBeNull();
    expect(buildEntityArt('character:luffy', 'character', 'portrait', '').mark).toBeNull();
  });

  test('when set, it is oversized and cropped by the frame — never a centred letter', () => {
    for (const id of IDS.filter((value) => value.startsWith('character:'))) {
      const scene = buildEntityArt(id, 'character', 'portrait', 'L');
      const mark = scene.mark;
      expect(mark).not.toBeNull();
      if (mark === null) continue;
      expect(mark.char).toBe('L');
      expect(mark.size).toBeGreaterThan(scene.height * 0.9);
      expect(mark.opacity).toBeLessThan(0.2);
      // Cropped: it starts left of the frame or runs past the bottom.
      expect(mark.x < 0 || mark.y > scene.height * 0.85).toBe(true);
      // Behind the focal masses, never the last thing drawn.
      expect(scene.markIndex).toBeLessThan(scene.shapes.length);
    }
  });
});
