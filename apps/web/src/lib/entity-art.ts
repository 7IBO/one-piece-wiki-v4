/**
 * Generative entity artwork — the designed ground of every image slot.
 *
 * The corpus has (almost) no pictures, so a placeholder is not a
 * fallback here: it IS the picture, on every card, thumb and portrait.
 * This module turns an entity id into a deterministic abstract
 * composition so a wall of tiles reads as art direction rather than as
 * empty state.
 *
 * Contract:
 * - **Deterministic.** The id is hashed (FNV-1a) and every parameter is
 *   drawn from a seeded PRNG. Same id → byte-identical scene, forever.
 *   No `Math.random`, no `Date`, no environment reads: server and
 *   client produce the same markup, so hydration never mismatches.
 * - **Type drives the grammar.** Each entity type maps to a visual
 *   family (a character is a figure, a chapter is a comic page, an arc
 *   is a horizon…), so two types can never be confused. Types WITHOUT a
 *   mapping degrade to the generic `field` family, seeded by the type
 *   name so an unknown type still looks self-consistent and distinct
 *   from its neighbours (ADR-091: bind to well-known ids only where the
 *   unknown case degrades).
 * - **Zero colour literals.** Every paint is a `var(--art-*)` reference
 *   resolved by `styles.css`. Re-skinning the whole system = editing the
 *   nine art tokens there, nothing else.
 * - **Pure data.** This module returns a scene description; the
 *   rendering (SVG) lives in `components/EntityArt.tsx`. No JSX, no
 *   React, no DOM — trivially testable.
 */

// ---------------------------------------------------------------------------
// Scene description

/** Compositing mode of one layer. Kept to the palette-agnostic few. */
export type ArtBlend = 'normal' | 'multiply' | 'screen' | 'soft-light';

/** One drawn layer. Everything is a path, so the renderer stays dumb. */
export type ArtShape = {
  readonly d: string;
  /** `var(--art-*)` reference, or null for stroke-only shapes. */
  readonly fill: string | null;
  /** `var(--art-*)` reference, or null for fill-only shapes. */
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly cap: 'butt' | 'round';
  readonly opacity: number;
  readonly blend: ArtBlend;
};

/**
 * The entity initial used as a COMPOSITIONAL element: oversized and
 * cropped by the frame, never a letter centred in a box.
 */
export type ArtMark = {
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly fill: string;
  readonly opacity: number;
  readonly transform: string | null;
};

export type ArtGrammarId =
  | 'figure'
  | 'ensign'
  | 'horizon'
  | 'impact'
  | 'spiral'
  | 'panels'
  | 'stack'
  | 'folio'
  | 'field';

export type EntityArtScene = {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly grammar: ArtGrammarId;
  readonly shapes: readonly ArtShape[];
  /** The mark, drawn between `shapes[markIndex - 1]` and `shapes[markIndex]`. */
  readonly mark: ArtMark | null;
  readonly markIndex: number;
};

/** Frames the art is composed for. Any ratio works; these are the used ones. */
export const ART_RATIOS = {
  /** Poster tiles and page portraits (3:4, the app's `aspect-3/4`). */
  portrait: { width: 240, height: 320 },
  /** Connection thumbs. */
  square: { width: 280, height: 280 },
  /** Banners / headers. */
  wide: { width: 420, height: 180 },
} as const satisfies Readonly<Record<string, { readonly width: number; readonly height: number; }>>;

export type ArtRatio = keyof typeof ART_RATIOS;

// ---------------------------------------------------------------------------
// Hash + PRNG (inline, no dependency)

/** FNV-1a 32-bit. Stable across engines: same string → same integer. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

type Rng = {
  /** Next value in [0, 1). */
  unit(): number;
  range(min: number, max: number): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  /** Uniform choice. Throws on an empty list (never reachable here). */
  pick<T>(items: readonly T[]): T;
  /** -1 or 1. */
  sign(): number;
};

/** mulberry32 — tiny, fast, well-distributed, fully deterministic. */
function createRng(seed: number): Rng {
  let state = (seed || 0x9e3779b9) >>> 0;
  const unit = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    unit,
    range: (min, max) => min + (max - min) * unit(),
    int: (min, max) => min + Math.floor(unit() * (max - min + 1)),
    chance: (probability) => unit() < probability,
    pick: <T>(items: readonly T[]): T => {
      const chosen = items[Math.floor(unit() * items.length)];
      if (chosen !== undefined) return chosen;
      const first = items[0];
      if (first === undefined) throw new Error('entity-art: cannot pick from an empty list.');
      return first;
    },
    sign: () => (unit() < 0.5 ? -1 : 1),
  };
}

// ---------------------------------------------------------------------------
// Palette — roles, not hues. Every value is a CSS custom property.

/** Number of interchangeable hue tokens declared in `styles.css`. */
const HUE_COUNT = 6;

function hueToken(index: number): string {
  return `var(--art-${(((index % HUE_COUNT) + HUE_COUNT) % HUE_COUNT) + 1})`;
}

/**
 * Roles guarantee a contrast structure whatever the six hues become:
 * `ink` is the dark mass, `glow` the light one, `a/b/c` the chord.
 */
type Palette = {
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly ink: string;
  readonly glow: string;
};

function createPalette(rng: Rng): Palette {
  const base = rng.int(0, HUE_COUNT - 1);
  const step = rng.pick([1, 2, 3, 4] as const);
  return {
    a: hueToken(base),
    b: hueToken(base + step),
    c: hueToken(base + step * 2),
    ink: 'var(--art-ink)',
    glow: 'var(--art-glow)',
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers

type Frame = {
  readonly w: number;
  readonly h: number;
  /** Short side — the scale unit, so nothing stretches with the ratio. */
  readonly s: number;
  readonly diag: number;
};

type Pt = readonly [number, number];
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; };

/** One decimal is plenty at these viewBox sizes and keeps the DOM small. */
function num(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function poly(points: readonly Pt[]): string {
  return `${
    points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${num(pt[0])} ${num(pt[1])}`).join(' ')
  } Z`;
}

function polyline(points: readonly Pt[]): string {
  return points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${num(pt[0])} ${num(pt[1])}`).join(' ');
}

function rectPath(rect: Rect): string {
  return poly([
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ]);
}

function rotate(point: Pt, origin: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  return [
    origin[0] + dx * Math.cos(a) - dy * Math.sin(a),
    origin[1] + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}

function rectCorners(rect: Rect): readonly Pt[] {
  return [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
}

function rotatedRectPath(rect: Rect, deg: number, origin: Pt): string {
  return poly(rectCorners(rect).map((pt) => rotate(pt, origin, deg)));
}

/** Ellipse via two arcs — compact, and `rot` comes free with the A command. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, deg = 0): string {
  const start = rotate([cx + rx, cy], [cx, cy], deg);
  const end = rotate([cx - rx, cy], [cx, cy], deg);
  return `M${num(start[0])} ${num(start[1])} A${num(rx)} ${num(ry)} ${num(deg)} 1 1 ${
    num(end[0])
  } ${num(end[1])} A${num(rx)} ${num(ry)} ${num(deg)} 1 1 ${num(start[0])} ${num(start[1])} Z`;
}

function circlePath(cx: number, cy: number, r: number): string {
  return ellipsePath(cx, cy, r, r, 0);
}

/** A stripe crossing the whole frame at `deg`, offset along its normal. */
function bandPath(f: Frame, deg: number, offset: number, thickness: number): string {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  const cx = f.w / 2 + nx * offset * f.diag * 0.5;
  const cy = f.h / 2 + ny * offset * f.diag * 0.5;
  const len = f.diag;
  const t = thickness / 2;
  return poly([
    [cx + dx * len - nx * t, cy + dy * len - ny * t],
    [cx + dx * len + nx * t, cy + dy * len + ny * t],
    [cx - dx * len + nx * t, cy - dy * len + ny * t],
    [cx - dx * len - nx * t, cy - dy * len - ny * t],
  ]);
}

/** Parallel hairlines across the frame — printed texture, one path. */
function hatchPath(f: Frame, deg: number, spacing: number): string {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  const count = Math.max(4, Math.round(f.diag / spacing));
  const len = f.diag;
  const segments: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const off = (i - (count - 1) / 2) * spacing;
    const cx = f.w / 2 + nx * off;
    const cy = f.h / 2 + ny * off;
    segments.push(
      polyline([[cx - dx * len, cy - dy * len], [cx + dx * len, cy + dy * len]]),
    );
  }
  return segments.join(' ');
}

/**
 * Screentone: dots on a rotated lattice inside a disc, sized by the
 * distance to a light point that sits OUTSIDE the disc — so the tone
 * fades into a crescent instead of ringing the shape. Reads as manga
 * shading, not as an identicon grid. Emitted as ONE path (many
 * subpaths); the cell is floored so the dot count stays bounded (~80)
 * whatever the radius, keeping the DOM small.
 */
function screentonePath(
  cx: number,
  cy: number,
  radius: number,
  cell: number,
  deg: number,
  light: Pt,
): string {
  const step = Math.max(cell, radius / 6);
  const steps = Math.ceil(radius / step);
  const reach = radius * 2.2;
  const parts: string[] = [];
  for (let ix = -steps; ix <= steps; ix += 1) {
    for (let iy = -steps; iy <= steps; iy += 1) {
      const raw: Pt = [cx + ix * step, cy + iy * step];
      const pt = rotate(raw, [cx, cy], deg);
      if (Math.hypot(pt[0] - cx, pt[1] - cy) > radius) continue;
      const toLight = Math.hypot(pt[0] - light[0], pt[1] - light[1]);
      const dot = step * 0.38 * Math.min(1, toLight / reach);
      if (dot < step * 0.14) continue;
      parts.push(circlePath(pt[0], pt[1], dot));
    }
  }
  return parts.join(' ');
}

/**
 * The ground: two flat fields, split by a diagonal, a horizon or a
 * vertical edge. Every family lays one down first so a tile is never
 * mostly raw `--art-bg` — dark holes are what made the wall read as
 * empty state, and a covered ground also guarantees that ink masses
 * stay legible whatever the skin.
 */
function groundShapes(rng: Rng, f: Frame, base: string, second: string): ArtShape[] {
  const shapes: ArtShape[] = [
    filled(rectPath({ x: 0, y: 0, w: f.w, h: f.h }), base, rng.range(0.32, 0.5)),
  ];
  const opacity = rng.range(0.42, 0.68);
  const mode = rng.int(0, 2);
  if (mode === 0) {
    shapes.push(filled(bandPath(f, rng.range(-72, 72), -0.5, f.diag), second, opacity));
  } else if (mode === 1) {
    const y = f.h * rng.range(0.3, 0.7);
    shapes.push(filled(rectPath({ x: 0, y, w: f.w, h: f.h - y }), second, opacity));
  } else {
    const x = f.w * rng.range(0.28, 0.72);
    const from = rng.chance(0.5);
    shapes.push(
      filled(rectPath({ x: from ? 0 : x, y: 0, w: from ? x : f.w - x, h: f.h }), second, opacity),
    );
  }
  return shapes;
}

/** A wavy edge sampled left→right; used for flags, strata, water. */
function waveEdge(
  x0: number,
  x1: number,
  y: number,
  amp: number,
  phase: number,
  cycles: number,
  steps = 16,
): readonly Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push([
      x0 + (x1 - x0) * t,
      y + Math.sin(phase + t * cycles * Math.PI * 2) * amp,
    ]);
  }
  return points;
}

/** Archimedean spiral as a polyline — the devil-fruit signature. */
function spiralPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  turns: number,
  phase: number,
  squash: number,
): string {
  const steps = Math.round(turns * 22);
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = phase + t * turns * Math.PI * 2;
    const r = rInner + (rOuter - rInner) * t;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * squash]);
  }
  return polyline(points);
}

/** Triangle fanning out of a focal point — impact / speed shard. */
function shardPath(focal: Pt, deg: number, spreadDeg: number, length: number): string {
  const a = (deg * Math.PI) / 180;
  const b = ((deg + spreadDeg) * Math.PI) / 180;
  return poly([
    focal,
    [focal[0] + Math.cos(a) * length, focal[1] + Math.sin(a) * length],
    [focal[0] + Math.cos(b) * length, focal[1] + Math.sin(b) * length],
  ]);
}

/** Recursive comic-page subdivision — irregular by construction. */
function splitPanels(rng: Rng, rect: Rect, depth: number, gutter: number, out: Rect[]): void {
  const tooSmall = rect.w < gutter * 5 || rect.h < gutter * 5;
  if (depth <= 0 || tooSmall || (depth < 3 && rng.chance(0.3))) {
    out.push(rect);
    return;
  }
  const horizontal = rect.h > rect.w * 1.15
    ? true
    : rect.w > rect.h * 1.15
    ? false
    : rng.chance(0.5);
  const t = rng.range(0.34, 0.64);
  if (horizontal) {
    const cut = rect.h * t;
    splitPanels(
      rng,
      { x: rect.x, y: rect.y, w: rect.w, h: cut - gutter / 2 },
      depth - 1,
      gutter,
      out,
    );
    splitPanels(
      rng,
      { x: rect.x, y: rect.y + cut + gutter / 2, w: rect.w, h: rect.h - cut - gutter / 2 },
      depth - 1,
      gutter,
      out,
    );
    return;
  }
  const cut = rect.w * t;
  splitPanels(
    rng,
    { x: rect.x, y: rect.y, w: cut - gutter / 2, h: rect.h },
    depth - 1,
    gutter,
    out,
  );
  splitPanels(
    rng,
    { x: rect.x + cut + gutter / 2, y: rect.y, w: rect.w - cut - gutter / 2, h: rect.h },
    depth - 1,
    gutter,
    out,
  );
}

// ---------------------------------------------------------------------------
// Layer constructors

function filled(d: string, fill: string, opacity = 1, blend: ArtBlend = 'normal'): ArtShape {
  return { d, fill, stroke: null, strokeWidth: 0, cap: 'butt', opacity, blend };
}

function stroked(
  d: string,
  stroke: string,
  strokeWidth: number,
  opacity = 1,
  cap: 'butt' | 'round' = 'round',
  blend: ArtBlend = 'normal',
): ArtShape {
  return { d, fill: null, stroke, strokeWidth, cap, opacity, blend };
}

// ---------------------------------------------------------------------------
// Grammars

type GrammarContext = {
  readonly rng: Rng;
  readonly f: Frame;
  readonly p: Palette;
  readonly initial: string | null;
  /** Stable per entity TYPE — keeps the generic family self-consistent. */
  readonly typeSeed: number;
};

type GrammarResult = {
  readonly shapes: readonly ArtShape[];
  readonly mark: ArtMark | null;
  readonly markIndex: number;
};

type Grammar = (ctx: GrammarContext) => GrammarResult;

/**
 * The oversized initial, always cropped by at least one edge and always
 * behind the focal masses. Returns null when there is nothing to set.
 */
function croppedMark(ctx: GrammarContext, fill: string, opacity: number): ArtMark | null {
  const { rng, f, initial } = ctx;
  if (initial === null || initial === '') return null;
  const size = f.h * rng.range(0.95, 1.45);
  const fromLeft = rng.chance(0.55);
  return {
    char: initial,
    x: fromLeft ? -size * rng.range(0.12, 0.26) : f.w - size * rng.range(0.42, 0.6),
    y: f.h * rng.range(0.86, 1.06),
    size,
    fill,
    opacity,
    transform: null,
  };
}

/**
 * `figure` — a presence, never a portrait. Three archetypes (eclipse,
 * cropped profile, column) so ten characters side by side never read as
 * one template stamped ten times — and deliberately NO head-and-
 * shoulders silhouette, which is the universal avatar icon and would
 * put us right back where the monogram tile was.
 */
const figure: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const dir = rng.sign();
  const shapes: ArtShape[] = groundShapes(rng, f, p.c, p.a);
  shapes.push(stroked(hatchPath(f, rng.range(60, 120), f.s * 0.06), p.glow, 1, 0.05, 'butt'));

  const markIndex = shapes.length;
  const archetype = rng.int(0, 2);
  const tone = (cx: number, cy: number, r: number): ArtShape =>
    filled(
      screentonePath(cx, cy, r * 0.99, f.s * 0.03, rng.range(0, 60), [
        cx - r * 0.8 * dir,
        cy - r * 0.75,
      ]),
      p.ink,
      0.3,
    );

  if (archetype === 0) {
    // Eclipse: two masses of the same order, one biting into the other.
    const cx = f.w * rng.range(0.24, 0.76);
    const cy = f.h * rng.range(0.3, 0.56);
    const r = f.s * rng.range(0.42, 0.58);
    shapes.push(filled(circlePath(cx, cy, r), p.a, 0.97));
    shapes.push(tone(cx, cy, r));
    shapes.push(
      filled(
        circlePath(
          cx + r * rng.range(0.55, 0.95) * dir,
          cy + r * rng.range(-0.5, 0.5),
          r * rng.range(0.7, 1.05),
        ),
        p.ink,
        0.9,
      ),
    );
    shapes.push(
      stroked(
        circlePath(cx - r * 0.2 * dir, cy - r * 0.15, r * rng.range(1.1, 1.3)),
        p.glow,
        f.s * 0.012,
        0.4,
      ),
    );
    shapes.push(
      filled(
        bandPath(f, rng.range(-14, 14) + 90, rng.range(-0.7, 0.7), f.s * rng.range(0.03, 0.07)),
        p.b,
        0.9,
      ),
    );
  } else if (archetype === 1) {
    // Cropped profile: one mass mostly outside the frame.
    const cx = f.w * (dir > 0 ? rng.range(0.84, 1.04) : rng.range(-0.04, 0.16));
    const cy = f.h * rng.range(0.28, 0.62);
    const r = f.s * rng.range(0.56, 0.78);
    shapes.push(filled(circlePath(cx, cy, r), p.a, 0.97));
    shapes.push(tone(cx, cy, r));
    shapes.push(
      filled(
        circlePath(
          f.w * rng.range(0.16, 0.5) + (dir > 0 ? 0 : f.w * 0.34),
          f.h * rng.range(0.55, 0.86),
          f.s * rng.range(0.12, 0.22),
        ),
        p.b,
        0.95,
      ),
    );
    shapes.push(
      filled(
        bandPath(f, rng.range(64, 116), rng.range(-0.55, 0.55), f.s * rng.range(0.05, 0.12)),
        p.glow,
        rng.range(0.75, 0.95),
      ),
    );
  } else {
    // Column: a hard vertical field, a disc straddling its edge.
    const slabX = f.w * rng.range(0.06, 0.44);
    const slabW = f.w * rng.range(0.3, 0.5);
    shapes.push(filled(rectPath({ x: slabX, y: 0, w: slabW, h: f.h }), p.b, 0.92));
    const edge = rng.chance(0.5) ? slabX : slabX + slabW;
    const cy = f.h * rng.range(0.24, 0.5);
    const r = f.s * rng.range(0.3, 0.42);
    shapes.push(filled(circlePath(edge, cy, r), p.a, 0.97));
    shapes.push(tone(edge, cy, r));
    const ruleY = f.h * rng.range(0.58, 0.82);
    shapes.push(
      filled(rectPath({ x: 0, y: ruleY, w: f.w, h: f.s * rng.range(0.02, 0.045) }), p.ink, 0.9),
    );
    shapes.push(
      filled(
        rectPath({
          x: f.w * rng.range(0.08, 0.8),
          y: ruleY + f.s * rng.range(0.08, 0.26),
          w: f.s * rng.range(0.08, 0.18),
          h: f.s * rng.range(0.08, 0.18),
        }),
        p.glow,
        0.92,
      ),
    );
  }

  if (rng.chance(0.6)) {
    shapes.push(
      filled(
        circlePath(
          f.w * rng.range(0.08, 0.92),
          f.h * rng.range(0.06, 0.22),
          f.s * rng.range(0.02, 0.04),
        ),
        p.glow,
        0.9,
      ),
    );
  }

  return { shapes, mark: croppedMark(ctx, p.glow, 0.12), markIndex };
};

/**
 * `ensign` — colours flying: a mast, a bold flag cropped by the right
 * edge, and an emblem (disc over crossed bars) that says "this is a
 * group under one sign" without drawing a literal jolly roger.
 */
const ensign: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = groundShapes(rng, f, p.c, p.b);
  shapes.push(stroked(hatchPath(f, 0, f.s * 0.075), p.glow, 1, 0.05, 'butt'));

  const markIndex = shapes.length;

  const mastX = f.w * rng.range(0.1, 0.24);
  const top = f.h * rng.range(0.08, 0.18);
  const depth = f.h * rng.range(0.32, 0.44);
  const amp = f.s * rng.range(0.02, 0.045);
  const phase = rng.range(0, Math.PI * 2);
  const cycles = rng.range(0.7, 1.2);
  const right = f.w * 1.08;
  shapes.push(
    filled(
      poly([
        ...waveEdge(mastX, right, top, amp, phase, cycles),
        ...[...waveEdge(mastX, right, top + depth, amp, phase + 0.8, cycles)].reverse(),
      ]),
      p.a,
      0.97,
    ),
  );

  // The emblem: crossed bars behind a solid disc.
  const emX = mastX + (right - mastX) * rng.range(0.34, 0.58);
  const emY = top + depth * 0.5;
  const emR = depth * rng.range(0.24, 0.34);
  const barW = emR * rng.range(0.3, 0.44);
  for (const deg of [rng.range(34, 56), rng.range(-56, -34)]) {
    shapes.push(
      filled(
        rotatedRectPath({ x: emX - emR * 1.75, y: emY - barW / 2, w: emR * 3.5, h: barW }, deg, [
          emX,
          emY,
        ]),
        p.ink,
        0.92,
      ),
    );
  }
  shapes.push(filled(circlePath(emX, emY, emR), p.glow, 0.96));

  const mastW = f.s * rng.range(0.045, 0.07);
  shapes.push(filled(rectPath({ x: mastX - mastW / 2, y: 0, w: mastW, h: f.h }), p.ink, 0.95));
  shapes.push(
    filled(
      circlePath(mastX, f.h * rng.range(0.03, 0.07), f.s * rng.range(0.03, 0.05)),
      p.glow,
      0.95,
    ),
  );

  // A pennant under the flag, then the sea it all sails on.
  const pTop = top + depth + f.h * rng.range(0.03, 0.09);
  const pDepth = depth * rng.range(0.22, 0.36);
  shapes.push(
    filled(
      poly([
        ...waveEdge(mastX, f.w * rng.range(0.5, 0.78), pTop, amp * 0.6, phase + 1.9, cycles),
        ...[
          ...waveEdge(
            mastX,
            f.w * rng.range(0.5, 0.78),
            pTop + pDepth,
            amp * 0.6,
            phase + 2.6,
            cycles,
          ),
        ].reverse(),
      ]),
      p.b,
      0.9,
    ),
  );

  const seaY = f.h * rng.range(0.86, 0.94);
  const seaPhase = rng.range(0, 6.2);
  shapes.push(
    filled(
      poly([...waveEdge(-2, f.w + 2, seaY, amp * 0.7, seaPhase, rng.range(0.8, 1.6)), [
        f.w + 2,
        f.h + 2,
      ], [-2, f.h + 2]]),
      p.ink,
      0.92,
    ),
  );
  shapes.push(
    filled(
      poly([
        ...waveEdge(-2, f.w + 2, seaY + f.h * 0.06, amp * 0.5, seaPhase + 1.6, rng.range(0.8, 1.6)),
        [f.w + 2, f.h + 2],
        [-2, f.h + 2],
      ]),
      p.a,
      0.85,
    ),
  );

  return { shapes, mark: croppedMark(ctx, p.glow, 0.1), markIndex };
};

/** `horizon` — a place in time: strata, a low sun, a route line. */
const horizon: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = [];

  shapes.push(...groundShapes(rng, f, p.c, p.b));
  shapes.push(stroked(hatchPath(f, 0, f.s * 0.055), p.glow, 1, 0.055, 'butt'));

  const markIndex = shapes.length;

  const sunX = f.w * rng.range(0.48, 0.86);
  const sunY = f.h * rng.range(0.3, 0.48);
  const sunR = f.s * rng.range(0.15, 0.24);
  shapes.push(filled(circlePath(sunX, sunY, sunR), p.b, 0.96));
  shapes.push(stroked(circlePath(sunX, sunY, sunR * rng.range(1.35, 1.75)), p.b, f.s * 0.01, 0.4));

  const peakLeft = rng.chance(0.5);
  const peakX = f.w * (peakLeft ? rng.range(0.06, 0.32) : rng.range(0.68, 0.94));
  const peakY = f.h * rng.range(0.24, 0.42);
  shapes.push(
    filled(
      poly([[peakX, peakY], [peakX + f.s * rng.range(0.16, 0.3), f.h], [
        peakX - f.s * rng.range(0.18, 0.34),
        f.h,
      ]]),
      p.ink,
      0.9,
    ),
  );

  const strata = rng.int(3, 4);
  const startY = f.h * rng.range(0.48, 0.58);
  for (let i = 0; i < strata; i += 1) {
    const y = startY + ((f.h - startY) * i) / strata;
    const amp = f.s * rng.range(0.015, 0.05) * (1 - i / (strata + 1));
    const edge = waveEdge(-2, f.w + 2, y, amp, rng.range(0, 6.2), rng.range(0.6, 1.6));
    const paint = i % 2 === 0 ? p.a : p.ink;
    shapes.push(
      filled(poly([...edge, [f.w + 2, f.h + 2], [-2, f.h + 2]]), paint, 0.45 + (0.5 * i) / strata),
    );
  }

  // A sail on the water: the only figurative note, deliberately small
  // and far off-centre so the frame stays a landscape.
  // …on the opposite side of the frame from the headland, so it never
  // reads as a snowcap sitting on the peak.
  const sailX = f.w * (peakLeft ? rng.range(0.52, 0.92) : rng.range(0.08, 0.48));
  const sailY = startY + (f.h - startY) * rng.range(0.18, 0.5);
  const sailH = f.s * rng.range(0.1, 0.17);
  const sailW = sailH * rng.range(0.5, 0.75);
  shapes.push(
    filled(
      poly([[sailX, sailY - sailH], [sailX + sailW, sailY], [sailX - sailW * 0.5, sailY]]),
      p.glow,
      0.92,
    ),
  );

  return { shapes, mark: null, markIndex };
};

/** `impact` — an event: shards converging on an off-frame focal point. */
const impact: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = [];

  shapes.push(...groundShapes(rng, f, p.c, p.a));

  const markIndex = shapes.length;

  const focal: Pt = [
    f.w * rng.pick([-0.18, -0.1, 1.1, 1.18] as const),
    f.h * rng.range(-0.15, 1.15),
  ];
  const toCentre = (Math.atan2(f.h / 2 - focal[1], f.w / 2 - focal[0]) * 180) / Math.PI;
  const shards = rng.int(9, 13);
  const spread = rng.range(46, 74);
  let angle = toCentre - spread;
  const paints: readonly [string, string, string, string] = [p.b, p.ink, p.a, p.glow];
  for (let i = 0; i < shards; i += 1) {
    const width = ((spread * 2) / shards) * rng.range(0.45, 1.5);
    const paint = paints[i % 4] ?? p.a;
    const opacity = paint === p.glow ? 0.22 : paint === p.ink ? 0.85 : rng.range(0.75, 0.97);
    shapes.push(filled(shardPath(focal, angle, width, f.diag * 1.6), paint, opacity));
    angle += width * rng.range(1.05, 1.6);
  }

  shapes.push(
    filled(
      screentonePath(focal[0], focal[1], f.s * 0.5, f.s * 0.05, rng.range(0, 45), focal),
      p.glow,
      0.26,
    ),
  );

  const cutAngle = rng.range(-26, -8) * rng.sign();
  shapes.push(
    filled(bandPath(f, cutAngle, rng.range(-0.3, 0.3), f.s * rng.range(0.09, 0.17)), p.ink, 0.92),
  );
  shapes.push(
    filled(
      bandPath(f, cutAngle, rng.range(-0.32, 0.32), f.s * rng.range(0.012, 0.022)),
      p.glow,
      0.55,
    ),
  );
  shapes.push(
    filled(
      circlePath(focal[0], focal[1], f.s * rng.range(0.18, 0.32)),
      p.c,
      0.75,
      rng.pick(['screen', 'multiply'] as const),
    ),
  );

  return { shapes, mark: null, markIndex };
};

/** `spiral` — a devil fruit: swirled body, stem, a hard cutting wedge. */
const spiralGrammar: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = [];

  shapes.push(...groundShapes(rng, f, p.c, p.b));
  shapes.push(stroked(hatchPath(f, rng.range(0, 180), f.s * 0.065), p.glow, 1, 0.05, 'butt'));

  const markIndex = shapes.length;

  const cx = f.w * rng.range(0.38, 0.62);
  const cy = f.h * rng.range(0.46, 0.6);
  const rx = f.s * rng.range(0.3, 0.39);
  const ry = rx * rng.range(1.0, 1.28);
  const tilt = rng.range(-22, 22);
  shapes.push(filled(ellipsePath(cx, cy, rx, ry, tilt), p.a, 0.97));
  shapes.push(
    filled(
      screentonePath(cx, cy, Math.min(rx, ry) * 0.96, f.s * 0.05, rng.range(0, 60), [
        cx - rx * 0.9,
        cy - ry * 0.85,
      ]),
      p.ink,
      0.36,
    ),
  );

  const swirlX = cx + rx * rng.range(-0.3, 0.3);
  const swirlY = cy + ry * rng.range(-0.3, 0.2);
  shapes.push(
    stroked(
      spiralPath(
        swirlX,
        swirlY,
        rx * 0.05,
        rx * rng.range(0.72, 0.95),
        rng.range(2.4, 3.6),
        rng.range(0, 6.2),
        rng.range(0.8, 1.15),
      ),
      p.ink,
      f.s * rng.range(0.026, 0.04),
      0.92,
    ),
  );

  const stemDeg = rng.range(-38, 10);
  const stemLen = f.s * rng.range(0.16, 0.26);
  const stemW = f.s * rng.range(0.028, 0.045);
  const stemBase: Pt = [cx + rx * 0.1, cy - ry * 0.92];
  shapes.push(
    filled(
      rotatedRectPath(
        { x: stemBase[0] - stemW / 2, y: stemBase[1] - stemLen, w: stemW, h: stemLen },
        stemDeg,
        stemBase,
      ),
      p.ink,
      0.95,
    ),
  );
  const leafBase: Pt = [stemBase[0] + f.s * 0.02, stemBase[1] - stemLen * 0.55];
  shapes.push(
    filled(
      poly([
        leafBase,
        [leafBase[0] + f.s * rng.range(0.14, 0.24), leafBase[1] - f.s * rng.range(0.02, 0.09)],
        [leafBase[0] + f.s * 0.06, leafBase[1] + f.s * rng.range(0.05, 0.1)],
      ]),
      p.b,
      0.95,
    ),
  );

  // A hard-edged wedge cutting the fruit — the graphic accent that
  // stops the composition from being a symmetrical still life.
  shapes.push(
    filled(
      bandPath(f, rng.range(-72, -22), rng.range(-0.45, 0.45), f.s * rng.range(0.05, 0.11)),
      p.glow,
      rng.range(0.75, 0.95),
    ),
  );
  const seeds = rng.int(2, 4);
  for (let i = 0; i < seeds; i += 1) {
    shapes.push(
      filled(
        circlePath(
          f.w * rng.range(0.05, 0.95),
          f.h * rng.range(0.06, 0.94),
          f.s * rng.range(0.015, 0.032),
        ),
        i % 2 === 0 ? p.glow : p.ink,
        0.75,
      ),
    );
  }

  return { shapes, mark: null, markIndex };
};

/** Shared page machinery for the print family (chapter / volume / doc). */
function pageRect(
  rng: Rng,
  f: Frame,
): { readonly rect: Rect; readonly tilt: number; readonly origin: Pt; } {
  const x = f.w * rng.range(0.07, 0.15);
  const y = f.h * rng.range(0.06, 0.12);
  return {
    rect: { x, y, w: f.w - x * rng.range(1.5, 2.2), h: f.h - y * rng.range(1.5, 2.1) },
    tilt: rng.range(-3.2, 3.2),
    origin: [f.w / 2, f.h / 2],
  };
}

/**
 * What happens INSIDE one comic panel. Everything is generated in the
 * panel's own box then rotated with the page, so nothing can spill over
 * a border (SVG has no clip here, and a clipPath per panel would cost
 * an id and a def for no visual gain).
 */
function panelContent(rng: Rng, cell: Rect, tilt: number, origin: Pt, p: Palette): ArtShape[] {
  const at = (x: number, y: number): Pt => rotate([x, y], origin, tilt);
  const rectIn = (
    x: number,
    y: number,
    w: number,
    h: number,
    paint: string,
    opacity: number,
  ): ArtShape => filled(rotatedRectPath({ x, y, w, h }, tilt, origin), paint, opacity);
  const short = Math.min(cell.w, cell.h);
  const base = rectIn(cell.x, cell.y, cell.w, cell.h, p.ink, rng.range(0.78, 0.92));

  switch (rng.int(0, 5)) {
    case 0:
      return [base];
    case 1: {
      const spot = at(
        cell.x + cell.w * rng.range(0.32, 0.68),
        cell.y + cell.h * rng.range(0.32, 0.68),
      );
      return [
        base,
        filled(
          circlePath(spot[0], spot[1], short * rng.range(0.2, 0.34)),
          rng.chance(0.5) ? p.glow : p.b,
          0.92,
        ),
      ];
    }
    case 2: {
      const cut = cell.h * rng.range(0.4, 0.68);
      return [
        rectIn(cell.x, cell.y, cell.w, cut, p.b, 0.9),
        rectIn(cell.x, cell.y + cut, cell.w, cell.h - cut, p.ink, 0.9),
      ];
    }
    case 3: {
      const spot = at(cell.x + cell.w * 0.5, cell.y + cell.h * 0.5);
      const r = short * 0.44;
      return [
        base,
        filled(
          screentonePath(spot[0], spot[1], r, short * 0.16, rng.range(0, 60), [
            spot[0] - r * 0.9,
            spot[1] - r * 0.8,
          ]),
          p.glow,
          0.75,
        ),
      ];
    }
    case 4:
      return [
        rectIn(cell.x, cell.y, cell.w, cell.h, p.a, 0.92),
        filled(
          poly([
            at(cell.x, cell.y + cell.h),
            at(cell.x + cell.w * rng.range(0.5, 1), cell.y + cell.h),
            at(cell.x, cell.y + cell.h * rng.range(0.2, 0.6)),
          ]),
          p.ink,
          0.9,
        ),
      ];
    default: {
      const bars = rng.int(2, 4);
      const shapes = [base];
      for (let i = 0; i < bars; i += 1) {
        const y = cell.y + (cell.h * (i + rng.range(0.15, 0.6))) / (bars + 0.4);
        shapes.push(
          rectIn(
            cell.x,
            y,
            cell.w * rng.range(0.45, 1),
            cell.h * 0.055,
            p.glow,
            rng.range(0.35, 0.8),
          ),
        );
      }
      return shapes;
    }
  }
}

/** `panels` — a chapter: a comic page, irregular tiers, one inked beat. */
const panels: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = groundShapes(rng, f, p.c, p.b);

  const markIndex = shapes.length;

  const page = pageRect(rng, f);
  const shadow = { ...page.rect, x: page.rect.x + f.s * 0.035, y: page.rect.y + f.s * 0.04 };
  shapes.push(filled(rotatedRectPath(shadow, page.tilt, page.origin), p.ink, 0.55));
  shapes.push(filled(rotatedRectPath(page.rect, page.tilt, page.origin), p.glow, 0.94));

  const gutter = f.s * 0.036;
  const inner: Rect = {
    x: page.rect.x + gutter,
    y: page.rect.y + gutter,
    w: page.rect.w - gutter * 2,
    h: page.rect.h - gutter * 2,
  };
  const cells: Rect[] = [];
  splitPanels(rng, inner, 3, gutter, cells);

  // One panel carries the beat: a full-bleed hue field with a big
  // cropped disc. The others draw from the panel vocabulary.
  const accent = rng.int(0, Math.max(0, cells.length - 1));
  cells.forEach((cell, index) => {
    if (index === accent) {
      shapes.push(filled(rotatedRectPath(cell, page.tilt, page.origin), p.a, 0.95));
      const spot = rotate(
        [cell.x + cell.w * rng.range(0.35, 0.65), cell.y + cell.h * rng.range(0.35, 0.65)],
        page.origin,
        page.tilt,
      );
      shapes.push(
        filled(
          circlePath(spot[0], spot[1], Math.min(cell.w, cell.h) * rng.range(0.26, 0.42)),
          p.glow,
          0.92,
        ),
      );
      return;
    }
    shapes.push(...panelContent(rng, cell, page.tilt, page.origin, p));
  });

  return { shapes, mark: null, markIndex };
};

/** `stack` — a volume: a stack of leaves under a cover with a spine. */
const stack: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = [];

  shapes.push(...groundShapes(rng, f, p.c, p.b));
  shapes.push(stroked(hatchPath(f, rng.range(20, 70), f.s * 0.09), p.glow, 1, 0.06, 'butt'));

  const markIndex = shapes.length;

  const page = pageRect(rng, f);
  const leaves = rng.int(2, 4);
  for (let i = leaves; i > 0; i -= 1) {
    const off = f.s * 0.03 * i;
    shapes.push(
      filled(
        rotatedRectPath(
          { ...page.rect, x: page.rect.x + off, y: page.rect.y + off },
          page.tilt + i * 0.7,
          page.origin,
        ),
        i % 2 === 0 ? p.glow : p.ink,
        i % 2 === 0 ? 0.4 : 0.6,
      ),
    );
  }
  shapes.push(filled(rotatedRectPath(page.rect, page.tilt, page.origin), p.a, 0.97));

  const spineW = page.rect.w * rng.range(0.1, 0.16);
  shapes.push(
    filled(rotatedRectPath({ ...page.rect, w: spineW }, page.tilt, page.origin), p.ink, 0.8),
  );

  const cx = page.rect.x + page.rect.w * rng.range(0.5, 0.78);
  const cy = page.rect.y + page.rect.h * rng.range(0.3, 0.5);
  const r = Math.min(page.rect.w, page.rect.h) * rng.range(0.26, 0.4);
  const spot = rotate([cx, cy], page.origin, page.tilt);
  shapes.push(filled(circlePath(spot[0], spot[1], r), p.b, 0.95));
  shapes.push(
    filled(
      screentonePath(spot[0], spot[1], r * 0.98, f.s * 0.05, rng.range(0, 60), [
        spot[0] - r * 0.85,
        spot[1] - r * 0.8,
      ]),
      p.ink,
      0.35,
    ),
  );

  const barY = page.rect.y + page.rect.h * rng.range(0.68, 0.82);
  const barH = page.rect.h * rng.range(0.05, 0.09);
  shapes.push(
    filled(
      rotatedRectPath(
        {
          x: page.rect.x + spineW + page.rect.w * 0.08,
          y: barY,
          w: page.rect.w * rng.range(0.4, 0.66),
          h: barH,
        },
        page.tilt,
        page.origin,
      ),
      p.glow,
      0.9,
    ),
  );
  shapes.push(
    filled(
      rotatedRectPath(
        {
          x: page.rect.x + spineW + page.rect.w * 0.08,
          y: barY + barH * 1.7,
          w: page.rect.w * rng.range(0.2, 0.36),
          h: barH * 0.45,
        },
        page.tilt,
        page.origin,
      ),
      p.ink,
      0.7,
    ),
  );

  return { shapes, mark: null, markIndex };
};

/** `folio` — a document: a single sheet, rules, margin, a folded corner. */
const folio: Grammar = (ctx) => {
  const { rng, f, p } = ctx;
  const shapes: ArtShape[] = [];

  shapes.push(...groundShapes(rng, f, p.c, p.a));
  shapes.push(stroked(hatchPath(f, rng.range(60, 120), f.s * 0.08), p.glow, 1, 0.05, 'butt'));

  const markIndex = shapes.length;

  const page = pageRect(rng, f);
  shapes.push(
    filled(
      rotatedRectPath(
        { ...page.rect, x: page.rect.x + f.s * 0.03, y: page.rect.y + f.s * 0.035 },
        page.tilt,
        page.origin,
      ),
      p.ink,
      0.5,
    ),
  );
  shapes.push(filled(rotatedRectPath(page.rect, page.tilt, page.origin), p.glow, 0.93));

  const marginX = page.rect.x + page.rect.w * rng.range(0.14, 0.24);
  shapes.push(
    filled(
      rotatedRectPath(
        { x: marginX, y: page.rect.y, w: f.s * 0.012, h: page.rect.h },
        page.tilt,
        page.origin,
      ),
      p.b,
      0.8,
    ),
  );

  const left = marginX + page.rect.w * 0.06;
  const maxW = page.rect.x + page.rect.w * 0.92 - left;
  const headH = page.rect.h * rng.range(0.07, 0.11);
  const headY = page.rect.y + page.rect.h * rng.range(0.1, 0.18);
  shapes.push(
    filled(
      rotatedRectPath(
        { x: left, y: headY, w: maxW * rng.range(0.5, 0.85), h: headH },
        page.tilt,
        page.origin,
      ),
      p.a,
      0.95,
    ),
  );

  const lines = rng.int(6, 11);
  const lineH = page.rect.h * 0.022;
  const gap = (page.rect.y + page.rect.h * 0.9 - (headY + headH * 2)) / lines;
  for (let i = 0; i < lines; i += 1) {
    const w = maxW * rng.range(0.35, 1);
    shapes.push(
      filled(
        rotatedRectPath(
          { x: left, y: headY + headH * 2 + i * gap, w, h: lineH },
          page.tilt,
          page.origin,
        ),
        p.ink,
        rng.range(0.3, 0.55),
      ),
    );
  }

  const foldSize = Math.min(page.rect.w, page.rect.h) * rng.range(0.16, 0.26);
  const corner: Pt = [page.rect.x + page.rect.w, page.rect.y + page.rect.h];
  shapes.push(
    filled(
      poly([
        rotate([corner[0], corner[1] - foldSize], page.origin, page.tilt),
        rotate(corner, page.origin, page.tilt),
        rotate([corner[0] - foldSize, corner[1]], page.origin, page.tilt),
      ]),
      p.b,
      0.9,
    ),
  );

  return { shapes, mark: croppedMark(ctx, p.ink, 0.14), markIndex };
};

/**
 * `field` — the generic family every unknown type degrades to. The
 * variant is picked from the TYPE hash (not the entity hash), so all
 * `location:*` share a look, all `film:*` share another, and neither
 * needs code.
 */
const field: Grammar = (ctx) => {
  const { rng, f, p, typeSeed } = ctx;
  const shapes: ArtShape[] = [];
  const variant = typeSeed % 3;
  const baseAngle = (typeSeed % 5) * 18 - 36;
  const dir = rng.sign();

  shapes.push(...groundShapes(rng, f, p.c, p.b));
  shapes.push(stroked(hatchPath(f, baseAngle + 90, f.s * 0.07), p.glow, 1, 0.06, 'butt'));

  const markIndex = shapes.length;

  if (variant === 0) {
    const big: Rect = {
      x: f.w * rng.range(-0.2, 0.18),
      y: f.h * rng.range(0.1, 0.36),
      w: f.w * rng.range(0.62, 0.95),
      h: f.h * rng.range(0.5, 0.85),
    };
    shapes.push(filled(rotatedRectPath(big, baseAngle * 0.25, [f.w / 2, f.h / 2]), p.a, 0.92));
    shapes.push(
      filled(
        rectPath({
          x: f.w * rng.range(0.42, 0.7),
          y: f.h * rng.range(-0.1, 0.12),
          w: f.w * rng.range(0.3, 0.6),
          h: f.h * rng.range(0.35, 0.7),
        }),
        p.b,
        0.85,
        rng.pick(['multiply', 'screen'] as const),
      ),
    );
    shapes.push(
      filled(rectPath({ x: 0, y: f.h * rng.range(0.6, 0.86), w: f.w, h: f.s * 0.05 }), p.ink, 0.9),
    );
    shapes.push(
      filled(
        rectPath({
          x: f.w * rng.range(0.1, 0.72),
          y: f.h * rng.range(0.12, 0.7),
          w: f.s * rng.range(0.08, 0.16),
          h: f.s * rng.range(0.08, 0.16),
        }),
        p.glow,
        0.92,
      ),
    );
  } else if (variant === 1) {
    const cx = f.w * rng.range(0.28, 0.72);
    const cy = f.h * rng.range(0.3, 0.66);
    const r = f.s * rng.range(0.34, 0.48);
    shapes.push(filled(circlePath(cx, cy, r), p.a, 0.95));
    shapes.push(
      filled(
        circlePath(
          cx + r * rng.range(0.5, 1.1) * dir,
          cy + r * rng.range(-0.6, 0.6),
          r * rng.range(0.55, 0.9),
        ),
        p.b,
        0.85,
        rng.pick(['multiply', 'screen', 'soft-light'] as const),
      ),
    );
    shapes.push(
      filled(
        screentonePath(cx, cy, r * 0.96, f.s * 0.05, rng.range(0, 60), [
          cx - r * 0.85,
          cy - r * 0.8,
        ]),
        p.ink,
        0.35,
      ),
    );
    shapes.push(
      stroked(
        circlePath(cx - r * 0.4 * dir, cy - r * 0.3, r * rng.range(1.2, 1.5)),
        p.glow,
        f.s * 0.012,
        0.35,
      ),
    );
    shapes.push(
      filled(
        bandPath(f, baseAngle, rng.range(-0.4, 0.4), f.s * rng.range(0.04, 0.09)),
        p.ink,
        0.85,
      ),
    );
  } else {
    const ribbons = rng.int(3, 4);
    for (let i = 0; i < ribbons; i += 1) {
      const paint = i % 3 === 0 ? p.a : i % 3 === 1 ? p.b : p.ink;
      shapes.push(
        filled(
          bandPath(
            f,
            baseAngle + rng.range(-4, 4),
            rng.range(-0.55, 0.55),
            f.s * rng.range(0.07, 0.26),
          ),
          paint,
          i % 3 === 2 ? 0.85 : rng.range(0.6, 0.95),
          i === 1 ? rng.pick(['multiply', 'screen'] as const) : 'normal',
        ),
      );
    }
    shapes.push(
      filled(
        circlePath(
          f.w * rng.range(0.15, 0.85),
          f.h * rng.range(0.15, 0.85),
          f.s * rng.range(0.14, 0.24),
        ),
        p.glow,
        0.9,
      ),
    );
    shapes.push(
      filled(bandPath(f, baseAngle + 90, rng.range(-0.5, 0.5), f.s * 0.014), p.glow, 0.5),
    );
  }

  return { shapes, mark: croppedMark(ctx, p.glow, 0.1), markIndex };
};

const GRAMMARS: Readonly<Record<ArtGrammarId, Grammar>> = {
  figure,
  ensign,
  horizon,
  impact,
  spiral: spiralGrammar,
  panels,
  stack,
  folio,
  field,
};

/**
 * Entity type → visual family. ADR-091 exception: binding to well-known
 * type ids is allowed because ANY id missing from this table degrades to
 * the generic `field` grammar. Adding a type never breaks rendering;
 * adding a line here is a pure art-direction upgrade.
 */
const TYPE_GRAMMARS: Readonly<Record<string, ArtGrammarId>> = {
  character: 'figure',
  crew: 'ensign',
  arc: 'horizon',
  event: 'impact',
  'devil-fruit': 'spiral',
  'manga-chapter': 'panels',
  volume: 'stack',
  document: 'folio',
  reference: 'folio',
};

/** The family a type composes in — `field` for anything unmapped. */
export function grammarForType(type: string): ArtGrammarId {
  return TYPE_GRAMMARS[type] ?? 'field';
}

// ---------------------------------------------------------------------------
// Entry point

/**
 * Compose the artwork for one entity.
 *
 * @param id Canonical entity id (`character:luffy`) — the only seed.
 * @param type Entity type id; selects the visual family.
 * @param ratio Frame to compose for.
 * @param initial Optional single grapheme, used as a cropped
 *   compositional mark by the families that support one.
 */
export function buildEntityArt(
  id: string,
  type: string,
  ratio: ArtRatio = 'portrait',
  initial?: string,
): EntityArtScene {
  const { width, height } = ART_RATIOS[ratio];
  const f: Frame = {
    w: width,
    h: height,
    s: Math.min(width, height),
    diag: Math.hypot(width, height),
  };
  // The ratio joins the seed so a portrait and a square of the same
  // entity are composed for their frame instead of being cropped copies.
  const rng = createRng(hashString(`${id}|${ratio}`));
  const grammarId = grammarForType(type);
  const grammar = GRAMMARS[grammarId];
  const palette = createPalette(rng);
  const result = grammar({
    rng,
    f,
    p: palette,
    initial: initial ?? null,
    typeSeed: hashString(type),
  });
  return {
    width,
    height,
    background: 'var(--art-bg)',
    grammar: grammarId,
    shapes: result.shapes,
    mark: result.mark,
    markIndex: result.markIndex,
  };
}
