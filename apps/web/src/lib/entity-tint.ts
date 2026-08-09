/**
 * Per-entity colour — the page tint (ADR-103).
 *
 * The corpus has no photography, so the generative art of
 * `lib/entity-art.ts` IS the imagery. On the reference sites the
 * maintainer likes, the chroma of a page comes from its artwork, not
 * from a global UI accent. This module reproduces that relationship
 * from nothing: it hashes the entity id into a colour chord and emits
 * it as CSS custom properties, so Luffy's page and Zoro's page are
 * genuinely different colours without anyone authoring a thing.
 *
 * Contract:
 * - **Deterministic.** Same id → same chord, forever (same FNV-1a hash
 *   family as the art, so tint and artwork always agree). Pure: no
 *   `Math.random`, no `Date`, identical on server and client.
 * - **Readable by construction.** The interactive colour is not
 *   clamped by eye: its lightness is RAISED until its measured WCAG
 *   contrast against the page canvas clears `MIN_ACCENT_CONTRAST`.
 *   The search runs in oklch→sRGB space, so what is measured is what
 *   the browser paints. An unreadable page cannot be produced.
 * - **Scoped.** Emitted as a `style` object of custom properties. The
 *   art tokens (`--art-*`) always apply, so a listing grid is a wall
 *   of individually-coloured artwork; the UI tokens only take effect
 *   inside the `.tinted` scope (see `styles.css`), which the entity
 *   page applies to its body and the chrome never does — navigation
 *   stays stable.
 */
import { hashString } from './entity-art';

// ---------------------------------------------------------------------------
// Colour space — oklch → sRGB → WCAG contrast
//
// Small, exact, dependency-free. Contrast is measured on the CLAMPED
// sRGB triple, i.e. on the pixels the display actually shows, so an
// out-of-gamut chroma can never inflate the number.

export type Oklch = { readonly l: number; readonly c: number; readonly h: number; };

/** Linear-light sRGB components (already clamped to the 0-1 cube). */
function oklchToLinearSrgb(color: Oklch): readonly [number, number, number] {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);
  const l_ = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG 2.1 relative luminance of an oklch colour. */
export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colours (1 → 21). */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function css(color: Oklch): string {
  const round = (value: number, places: number): number => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  };
  return `oklch(${round(color.l, 4)} ${round(color.c, 4)} ${round(color.h, 2)})`;
}

// ---------------------------------------------------------------------------
// The guarantees
//
// `PAGE_CANVAS` mirrors `--color-canvas` in `styles.css`; a unit test
// parses that file and fails if the two ever drift, because every
// contrast promise below is measured against it.

/** The page background every tinted colour is measured against. */
export const PAGE_CANVAS: Oklch = { l: 0.179, c: 0.01, h: 68 };

/** Body-text floor (WCAG AA) for the interactive/accent colour. */
export const MIN_ACCENT_CONTRAST = 4.5;
/** Large-text floor (WCAG AA) for display-sized tinted headings. */
export const MIN_DISPLAY_CONTRAST = 3;

/**
 * Raise lightness until the colour clears `target` against the canvas.
 * Monotonic in L at fixed chroma, so a fixed-step climb is exact
 * enough and — unlike a hand-picked clamp — provably terminates at a
 * readable value for EVERY hue, including the dark blues and violets
 * where a fixed lightness would fail.
 */
function liftToContrast(seed: Oklch, target: number): Oklch {
  let lightness = seed.l;
  for (let step = 0; step < 60; step += 1) {
    const color: Oklch = { l: lightness, c: seed.c, h: seed.h };
    if (contrastRatio(color, PAGE_CANVAS) >= target) return color;
    lightness = Math.min(0.98, lightness + 0.0125);
  }
  return { l: lightness, c: seed.c, h: seed.h };
}

// ---------------------------------------------------------------------------
// The chord

/**
 * Hue offsets of the six art tokens around the entity's base hue, with
 * the lightness/chroma profile of the global wheel preserved — the
 * wheel is re-pointed, not re-invented, so a grid of tinted tiles keeps
 * the rhythm `styles.css` documents.
 */
const ART_WHEEL: readonly { readonly d: number; readonly l: number; readonly c: number; }[] = [
  { d: 0, l: 0.63, c: 0.17 },
  { d: 32, l: 0.73, c: 0.135 },
  { d: -28, l: 0.82, c: 0.108 },
  { d: 168, l: 0.6, c: 0.095 },
  { d: 196, l: 0.54, c: 0.11 },
  { d: -64, l: 0.6, c: 0.135 },
];

export type EntityTint = {
  /** Base hue in degrees — the entity's identity colour. */
  readonly hue: number;
  /** The interactive colour, guaranteed ≥ AA against the canvas. */
  readonly accent: Oklch;
  /** CSS custom properties to spread onto a `style` prop. */
  readonly vars: Readonly<Record<string, string>>;
};

/**
 * The colour chord of one entity.
 *
 * @param entityId Canonical `type:slug` id — the only seed.
 */
export function entityTint(entityId: string): EntityTint {
  // A second hash generation, so an entity's tint and the composition
  // seeded on the same string do not move in lockstep.
  const hue = hashString(`tint|${entityId}`) % 360;
  const accent = liftToContrast({ l: 0.66, c: 0.17, h: hue }, MIN_ACCENT_CONTRAST);
  const accentHover = liftToContrast(
    { l: accent.l + 0.08, c: accent.c, h: accent.h },
    MIN_ACCENT_CONTRAST,
  );
  const wheel = ART_WHEEL.map((stop) => ({ l: stop.l, c: stop.c, h: (hue + stop.d + 360) % 360 }));
  const vars: Record<string, string> = {
    '--tint-hue': String(hue),
    '--tint-accent': css(accent),
    '--tint-accent-hover': css(accentHover),
    // Surfaces: the canvas lightness carrying the entity's hue.
    '--tint-wash': css({ l: 0.253, c: 0.062, h: hue }),
    '--tint-surface': css({ l: 0.222, c: 0.03, h: hue }),
    '--tint-line': `oklch(${accent.l} ${accent.c} ${hue} / 0.22)`,
    '--tint-line-strong': `oklch(${accent.l} ${accent.c} ${hue} / 0.45)`,
    // The artwork's own ground and mass, pulled into the same chord.
    '--art-bg': css({ l: 0.235, c: 0.038, h: hue }),
    '--art-ink': css({ l: 0.145, c: 0.028, h: (hue + 12) % 360 }),
  };
  wheel.forEach((stop, index) => {
    vars[`--art-${index + 1}`] = css(stop);
  });
  return { hue, accent, vars };
}
