/**
 * Per-entity colour — the page tint (ADR-103, revised by ADR-104).
 *
 * The corpus has no photography, so the generative art of
 * `lib/entity-art.ts` IS the imagery. On the reference sites the
 * maintainer likes, the chroma of a page comes from its artwork, not
 * from a global UI accent. This module reproduces that relationship
 * from nothing: it hashes the entity id into ONE OF A CURATED SET OF
 * CHORDS and emits it as CSS custom properties, so Luffy's page and
 * Zoro's page are genuinely different colours without anyone
 * authoring a thing per entity.
 *
 * Contract:
 * - **Curated, not generated (ADR-104).** The first version mapped the
 *   hash onto the full 360° wheel; the result read as random noise
 *   (a green character next to a cyan one next to a blue one). The
 *   hash now indexes `TINT_CHORDS` — a hand-authored, ordered list of
 *   warm chords anchored on the site's gold. There is no green, cyan,
 *   blue, violet or magenta anywhere in the palette, and a unit test
 *   enforces that band so nobody can reintroduce one.
 * - **Variety comes from VALUE, not from hue.** With a narrow hue band
 *   the chords differentiate by their light/dark structure: some sit
 *   on a near-black ground with a bone highlight, some on a light
 *   ground with dark forms, some are quiet and low-chroma, some are
 *   punchy. That is what keeps a wall of 40 px thumbs from reading as
 *   one repeated brown tile.
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
 *   stays stable, and gold stays the site's constant identity
 *   (wordmark, bounty figures, focus ring) whatever chord a page is on.
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
 * The warm band the WHOLE palette is confined to (oklch hue degrees).
 * Gold sits near 86°, the stamp red near 20°. Anything outside this
 * window — green, cyan, blue, violet, magenta — is out of the design
 * and a unit test rejects it (ADR-104). The upper bound is deliberately
 * tight: past ~100° a mid-chroma yellow starts to read olive on a dark
 * ground, which is exactly the "random green" the maintainer rejected.
 */
export const WARM_BAND = { min: 12, max: 100 } as const;

/**
 * Raise lightness until the colour clears `target` against the canvas.
 * Monotonic in L at fixed chroma, so a fixed-step climb is exact
 * enough and — unlike a hand-picked clamp — provably terminates at a
 * readable value for EVERY chord, including the deep oxbloods where a
 * fixed lightness would fail.
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
// The authored chords (ADR-104)

/** Terse constructor — the table below is read as a swatch book. */
function ok(l: number, c: number, h: number): Oklch {
  return { l, c, h };
}

/** One hand-authored chord: an atmosphere, not just a hue. */
export type TintChord = {
  /** Art-direction name. Never shown to a reader; it labels the table. */
  readonly name: string;
  /** Identity hue in degrees — the chord's place in the warm band. */
  readonly hue: number;
  /** Interactive colour SEED; lifted to AA before it is emitted. */
  readonly accent: Oklch;
  /** Hero wash — the canvas carrying the chord. */
  readonly wash: Oklch;
  /** Raised UI surface inside the tinted scope. */
  readonly surface: Oklch;
  /** Artwork ground. Its lightness is the chord's value structure. */
  readonly bg: Oklch;
  /** Artwork dark mass (silhouettes, gutters). Always below `bg`. */
  readonly ink: Oklch;
  /** Artwork light mass (paper, highlights, hairlines). */
  readonly glow: Oklch;
  /** The six interchangeable art paints. Spread in VALUE, not in hue. */
  readonly stops: readonly [Oklch, Oklch, Oklch, Oklch, Oklch, Oklch];
};

/**
 * The palette of the site — ten chords, gold first, all harmonious
 * with each other because they never leave the warm band.
 *
 * Read the `bg`/`ink`/`glow` triple of each entry as its VALUE
 * STRUCTURE: `ocre` is a near-black ground under a bone highlight,
 * `ambre` is a light ground with dark forms, `terre` is a close-valued
 * whisper, `vermillon` is a mid ground with maximum chroma. Two
 * entities on neighbouring hues still read as different pictures
 * because their light and dark masses are distributed differently.
 *
 * Appending a chord is a pure art-direction act: it must stay inside
 * `WARM_BAND` and keep `ink.l < bg.l < 0.32`, both enforced by tests.
 */
export const TINT_CHORDS: readonly [TintChord, ...TintChord[]] = [
  {
    // The anchor. The site's gold, made into a whole atmosphere.
    name: 'or',
    hue: 86,
    accent: ok(0.78, 0.135, 86),
    wash: ok(0.252, 0.055, 84),
    surface: ok(0.222, 0.03, 84),
    bg: ok(0.238, 0.034, 80),
    ink: ok(0.14, 0.026, 70),
    glow: ok(0.962, 0.038, 92),
    stops: [
      ok(0.83, 0.14, 88),
      ok(0.63, 0.128, 68),
      ok(0.905, 0.078, 95),
      ok(0.46, 0.1, 52),
      ok(0.72, 0.135, 78),
      ok(0.335, 0.062, 44),
    ],
  },
  {
    // Brass: the top of the band. Held at 90° — tarnished brass, and
    // deliberately no higher: at hero scale a large flat field past
    // ~95° starts to look olive. It separates from `or` by VALUE
    // (denser ground, darker paints), not by hue.
    name: 'laiton',
    hue: 90,
    accent: ok(0.765, 0.13, 90),
    wash: ok(0.245, 0.05, 88),
    surface: ok(0.218, 0.028, 88),
    bg: ok(0.222, 0.034, 86),
    ink: ok(0.128, 0.024, 76),
    glow: ok(0.945, 0.045, 92),
    stops: [
      ok(0.8, 0.13, 90),
      ok(0.6, 0.12, 76),
      ok(0.875, 0.09, 94),
      ok(0.44, 0.09, 64),
      ok(0.685, 0.112, 84),
      ok(0.3, 0.054, 56),
    ],
  },
  {
    // Ochre: the highest value contrast of the set — near-black
    // ground, bone highlight. The chord that carves.
    name: 'ocre',
    hue: 72,
    accent: ok(0.735, 0.125, 72),
    wash: ok(0.238, 0.052, 70),
    surface: ok(0.208, 0.028, 70),
    bg: ok(0.196, 0.03, 66),
    ink: ok(0.108, 0.02, 58),
    glow: ok(0.968, 0.03, 86),
    stops: [
      ok(0.78, 0.125, 72),
      ok(0.585, 0.115, 56),
      ok(0.925, 0.062, 84),
      ok(0.415, 0.085, 44),
      ok(0.665, 0.13, 64),
      ok(0.285, 0.055, 38),
    ],
  },
  {
    name: 'cuivre',
    hue: 54,
    accent: ok(0.715, 0.145, 54),
    wash: ok(0.252, 0.062, 52),
    surface: ok(0.222, 0.034, 52),
    bg: ok(0.232, 0.04, 48),
    ink: ok(0.138, 0.028, 38),
    glow: ok(0.95, 0.038, 80),
    stops: [
      ok(0.755, 0.148, 54),
      ok(0.585, 0.145, 38),
      ok(0.885, 0.088, 72),
      ok(0.425, 0.105, 30),
      ok(0.665, 0.155, 46),
      ok(0.315, 0.07, 26),
    ],
  },
  {
    // Saffron: high chroma on a LIGHT ground — reads as a bright tile
    // in a wall of dark ones.
    name: 'safran',
    hue: 66,
    accent: ok(0.755, 0.155, 66),
    wash: ok(0.268, 0.068, 64),
    surface: ok(0.235, 0.036, 64),
    bg: ok(0.282, 0.05, 62),
    ink: ok(0.148, 0.032, 50),
    glow: ok(0.958, 0.048, 84),
    stops: [
      ok(0.795, 0.152, 66),
      ok(0.625, 0.155, 48),
      ok(0.9, 0.095, 80),
      ok(0.455, 0.115, 36),
      ok(0.705, 0.165, 58),
      ok(0.325, 0.075, 30),
    ],
  },
  {
    name: 'orange-brule',
    hue: 44,
    accent: ok(0.695, 0.165, 44),
    wash: ok(0.248, 0.07, 42),
    surface: ok(0.218, 0.038, 42),
    bg: ok(0.208, 0.042, 38),
    ink: ok(0.118, 0.03, 30),
    glow: ok(0.955, 0.042, 76),
    stops: [
      ok(0.735, 0.168, 44),
      ok(0.565, 0.165, 30),
      ok(0.865, 0.1, 64),
      ok(0.4, 0.12, 22),
      ok(0.645, 0.175, 38),
      ok(0.295, 0.075, 20),
    ],
  },
  {
    // Vermillion — the hanko / wanted-poster red, on a mid-light
    // ground so its forms read dark against it.
    name: 'vermillon',
    hue: 30,
    accent: ok(0.665, 0.185, 30),
    wash: ok(0.262, 0.075, 30),
    surface: ok(0.232, 0.042, 30),
    bg: ok(0.292, 0.052, 34),
    ink: ok(0.152, 0.036, 22),
    glow: ok(0.94, 0.048, 68),
    stops: [
      ok(0.7, 0.19, 30),
      ok(0.545, 0.185, 20),
      ok(0.845, 0.105, 54),
      ok(0.395, 0.13, 16),
      ok(0.615, 0.19, 26),
      ok(0.275, 0.08, 14),
    ],
  },
  {
    // Oxblood: the darkest ground of the set. Deep wine, restrained
    // highlight — the chord that broods.
    name: 'sang-de-boeuf',
    hue: 20,
    accent: ok(0.635, 0.185, 20),
    wash: ok(0.235, 0.072, 20),
    surface: ok(0.205, 0.04, 20),
    bg: ok(0.172, 0.038, 18),
    ink: ok(0.094, 0.026, 14),
    glow: ok(0.93, 0.052, 60),
    stops: [
      ok(0.665, 0.19, 20),
      ok(0.52, 0.185, 14),
      ok(0.82, 0.115, 44),
      ok(0.375, 0.135, 12),
      ok(0.585, 0.2, 24),
      ok(0.255, 0.085, 16),
    ],
  },
  {
    // Terre: the quiet chord — the lowest chroma of the set and its
    // closest values, but still unmistakably SEPIA. A desaturated
    // warm is a risk (v5/v7 were called muddy), so it keeps enough
    // chroma to stay a colour and the brightest bone highlight here.
    name: 'terre',
    hue: 40,
    accent: ok(0.725, 0.098, 50),
    wash: ok(0.242, 0.036, 44),
    surface: ok(0.215, 0.024, 44),
    bg: ok(0.215, 0.032, 42),
    ink: ok(0.125, 0.022, 34),
    glow: ok(0.972, 0.026, 84),
    stops: [
      ok(0.755, 0.1, 50),
      ok(0.6, 0.092, 34),
      ok(0.9, 0.062, 72),
      ok(0.445, 0.075, 28),
      ok(0.685, 0.108, 56),
      ok(0.315, 0.052, 24),
    ],
  },
  {
    // Amber: the inverted value structure — the lightest ground of
    // the set, its forms cut dark into it.
    name: 'ambre',
    hue: 80,
    accent: ok(0.795, 0.115, 80),
    wash: ok(0.265, 0.05, 78),
    surface: ok(0.232, 0.028, 78),
    bg: ok(0.305, 0.038, 80),
    ink: ok(0.158, 0.024, 64),
    glow: ok(0.975, 0.03, 88),
    stops: [
      ok(0.86, 0.108, 84),
      ok(0.635, 0.1, 66),
      ok(0.935, 0.055, 90),
      ok(0.475, 0.075, 52),
      ok(0.745, 0.115, 76),
      ok(0.345, 0.048, 44),
    ],
  },
];

export type EntityTint = {
  /** The chord's art-direction name — the palette entry that was picked. */
  readonly chord: string;
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
  // A second hash generation, so an entity's chord and the composition
  // seeded on the same string do not move in lockstep. The salt is not
  // arbitrary: it was chosen among candidates for the flattest spread
  // over the ten chords, and verified against the real corpus — all
  // ten chords are in use across the 37 entities, and the Straw Hats
  // land on four different ones.
  const index = hashString(`tint|gold|${entityId}`) % TINT_CHORDS.length;
  const chord = TINT_CHORDS[index] ?? TINT_CHORDS[0];
  const accent = liftToContrast(chord.accent, MIN_ACCENT_CONTRAST);
  const accentHover = liftToContrast(
    { l: accent.l + 0.08, c: accent.c, h: accent.h },
    MIN_ACCENT_CONTRAST,
  );
  const vars: Record<string, string> = {
    '--tint-hue': String(chord.hue),
    '--tint-accent': css(accent),
    '--tint-accent-hover': css(accentHover),
    // Surfaces: the canvas lightness carrying the entity's chord.
    '--tint-wash': css(chord.wash),
    '--tint-surface': css(chord.surface),
    '--tint-line': `oklch(${accent.l} ${accent.c} ${accent.h} / 0.22)`,
    '--tint-line-strong': `oklch(${accent.l} ${accent.c} ${accent.h} / 0.45)`,
    // The artwork's own ground, mass and highlight — the chord's
    // value structure, which is what makes two warm entities differ.
    '--art-bg': css(chord.bg),
    '--art-ink': css(chord.ink),
    '--art-glow': css(chord.glow),
  };
  chord.stops.forEach((stop, index) => {
    vars[`--art-${index + 1}`] = css(stop);
  });
  return { chord: chord.name, hue: chord.hue, accent, vars };
}
