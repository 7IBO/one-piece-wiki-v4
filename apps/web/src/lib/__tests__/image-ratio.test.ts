/**
 * Ratios are fixed per KIND OF IMAGE (WEB_APP.md § Image ratios): the
 * shape comes from what the picture IS — its own pixels first, then
 * its depiction role — never from the slot it lands in. These tests
 * pin the derivation order and, above all, the degradation: an
 * unclassified image must still render.
 */
import { describe, expect, test } from 'bun:test';
import {
  artFrameFor,
  aspectCss,
  aspectDistance,
  imageAspect,
  objectFitFor,
  RATIO_CLASSES,
  ROLE_RATIO_CLASS,
} from '../image-ratio.ts';

const shape = (
  width: number | null,
  height: number | null,
  role: string | null,
): { width: number | null; height: number | null; role: string | null; } => ({
  width,
  height,
  role,
});

describe('imageAspect — what the image IS decides its ratio', () => {
  test('intrinsic pixel dimensions win over everything', () => {
    // A "portrait" that is in fact a wide plate keeps its real shape.
    expect(imageAspect(shape(1920, 1080, 'primary_portrait'))).toEqual({ w: 1920, h: 1080 });
  });

  test('falls back to the depiction role when the pixels are unknown', () => {
    expect(imageAspect(shape(null, null, 'primary_portrait'))).toEqual(RATIO_CLASSES.portrait);
    expect(imageAspect(shape(null, null, 'cover'))).toEqual(RATIO_CLASSES.cover);
    expect(imageAspect(shape(null, null, 'scene'))).toEqual(RATIO_CLASSES.plate);
    expect(imageAspect(shape(null, null, 'color_spread'))).toEqual(RATIO_CLASSES.banner);
    expect(imageAspect(shape(null, null, 'group_photo'))).toEqual(RATIO_CLASSES.square);
  });

  test('an unknown role, a half-declared size or no image yields null', () => {
    // ADR-091 degradation: the caller keeps its own frame.
    expect(imageAspect(shape(null, null, 'role-invented-tomorrow'))).toBeNull();
    expect(imageAspect(shape(1920, null, null))).toBeNull();
    expect(imageAspect(shape(0, 0, null))).toBeNull();
    expect(imageAspect(null)).toBeNull();
    expect(imageAspect(shape(null, null, null))).toBeNull();
  });

  test('every classified role names a real ratio class', () => {
    for (const [role, cls] of Object.entries(ROLE_RATIO_CLASS)) {
      expect(RATIO_CLASSES[cls], role).toBeDefined();
    }
  });
});

describe('objectFitFor — a picture is cropped only within its own shape', () => {
  test('a near-square portrait fills a square thumb (a legitimate crop)', () => {
    expect(objectFitFor(RATIO_CLASSES.portrait, RATIO_CLASSES.portrait)).toBe('cover');
    expect(objectFitFor({ w: 1000, h: 1050 }, RATIO_CLASSES.square)).toBe('cover');
  });

  test('a 16:9 still is CONTAINED in a 3:4 poster frame, never cropped to it', () => {
    expect(objectFitFor(RATIO_CLASSES.plate, RATIO_CLASSES.portrait)).toBe('contain');
    expect(objectFitFor(RATIO_CLASSES.banner, RATIO_CLASSES.square)).toBe('contain');
  });

  test('an image of unknown shape keeps the historical cover behaviour', () => {
    expect(objectFitFor(null, RATIO_CLASSES.portrait)).toBe('cover');
  });
});

describe('helpers', () => {
  test('aspectCss emits a CSS aspect-ratio value', () => {
    expect(aspectCss(RATIO_CLASSES.portrait)).toBe('3 / 4');
  });

  test('aspectDistance is symmetric and 1 for identical shapes', () => {
    expect(aspectDistance(RATIO_CLASSES.plate, RATIO_CLASSES.plate)).toBe(1);
    expect(aspectDistance({ w: 4, h: 3 }, { w: 3, h: 4 }))
      .toBeCloseTo(aspectDistance({ w: 3, h: 4 }, { w: 4, h: 3 }), 10);
  });

  test('artFrameFor picks the generator frame closest to an aspect', () => {
    expect(artFrameFor(RATIO_CLASSES.portrait)).toBe('portrait');
    expect(artFrameFor(RATIO_CLASSES.cover)).toBe('portrait');
    expect(artFrameFor(RATIO_CLASSES.square)).toBe('square');
    expect(artFrameFor(RATIO_CLASSES.plate)).toBe('wide');
    expect(artFrameFor(RATIO_CLASSES.banner)).toBe('wide');
  });
});
