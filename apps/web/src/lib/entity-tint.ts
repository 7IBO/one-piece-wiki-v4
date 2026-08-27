/**
 * Per-entity colour — the page tint (ADR-103; chord set re-authored by
 * ADR-111, which supersedes ADR-104).
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
 * ## What the chords are (ADR-111)
 *
 * **A shelf of tankōbon spines.** Line the volumes up and they form a
 * rainbow: each one takes its own saturated hue, and Oda re-pigments
 * every colour spread from scratch. That is the real, in-work
 * justification for a per-entity tint — and it is why the previous
 * constraint (ADR-104: every chord inside a 12°–100° warm band,
 * anchored on gold) was wrong. It made every page of the site
 * brown/ochre/amber, and gold/parchment/treasure is the kitsch pirate
 * cliché rather than the colour language of the work.
 *
 * The twelve chords walk the wheel once — `paille` (the straw hat)
 * down through orange, vermillion, garnet, the chapter-642 pink,
 * plum, indigo, the deep sea, sky, lagoon, jade, canopy — in spectral
 * order, so the list reads as a shelf rather than a bag.
 *
 * ## Why it is not "random colours"
 *
 * The earlier free-wheel attempt read as noise because nothing tied
 * the hues together. Three constraints do, and all three are tested:
 *
 * 1. **One ground family.** Every chord's artwork ground is a DARK,
 *    LOW-CHROMA slate ({@link GROUND}); the saturated hue lives in the
 *    paints and the accent, never in the field. A jade page and a
 *    vermillion page are the same deep-water dark with a different
 *    tinge, which is what makes a wall of thumbs cohere.
 * 2. **Chromatic coherence.** Every colour of a chord lies within
 *    {@link CHORD_HUE_SPREAD} of the chord's own hue, so no single
 *    chord is itself a bag of hues.
 * 3. **A closed list of anchors.** The chord hue must be one of
 *    {@link PALETTE_ANCHORS}. The palette is a curated shelf, not a
 *    wheel a hash can land anywhere on.
 *
 * ## The rest of the contract
 *
 * - **Variety comes from VALUE as much as from hue.** Grounds run
 *   0.15 → 0.30 in lightness: some chords sit near-black under a bone
 *   highlight, some on a light ground with dark forms. Two neighbours
 *   on the shelf differ as pictures, not only as hues.
 * - **Deterministic.** Same id → same chord, forever (same FNV-1a hash
 *   family as the art, so tint and artwork always agree). Pure: no
 *   `Math.random`, no `Date`, identical on server and client.
 * - **Readable by construction.** The interactive colour is not
 *   clamped by eye: its lightness is RAISED until its measured WCAG
 *   contrast against the page canvas clears `MIN_ACCENT_CONTRAST`.
 *   The search runs in oklch→sRGB space, so what is measured is what
 *   the browser paints. An unreadable page cannot be produced — and
 *   that matters more now than under ADR-104, since a deep blue at
 *   the same lightness as a yellow is far darker.
 * - **Scoped.** Emitted as a `style` object of custom properties. The
 *   art tokens (`--art-*`) always apply, so a listing grid is a wall
 *   of individually-coloured artwork; the UI tokens only take effect
 *   inside the `.tinted` scope (see `styles.css`), which the entity
 *   page applies to its body and the chrome never does — navigation
 *   stays on the oceanic neutral, and straw-hat yellow stays the
 *   site's constant identity (wordmark, bounty figures, focus ring)
 *   whatever chord a page is on.
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

/**
 * The page background every tinted colour is measured against — the
 * OCEANIC NIGHT of v11 (ADR-111). Deep sea navy, not the warm brown
 * of v8: the ocean and sky are the environmental constant of the work,
 * and a blue-black ground lets a saturated chord of ANY hue sit on it
 * without the page turning into that chord.
 *
 * Mirrors `--color-canvas` in `styles.css`; a unit test parses that
 * file and fails if the two ever drift, because every contrast promise
 * below is measured against it.
 */
export const PAGE_CANVAS: Oklch = { l: 0.150, c: 0.007, h: 271 };

/** Body-text floor (WCAG AA) for the interactive/accent colour. */
export const MIN_ACCENT_CONTRAST = 4.5;
/** Large-text floor (WCAG AA) for display-sized tinted headings. */
export const MIN_DISPLAY_CONTRAST = 3;

/**
 * The closed list of hues a chord may be anchored on (oklch degrees),
 * in shelf order — the walk round the wheel described at the top of
 * this file. A chord whose `hue` is not in this list is not part of
 * the palette, and a unit test rejects it. This is what replaced
 * ADR-104's warm band: the guarantee is no longer "one narrow family
 * of hue" but "a curated shelf, closed and ordered".
 */
export const PALETTE_ANCHORS: readonly number[] = [
  93,
  62,
  30,
  8,
  350,
  320,
  285,
  255,
  228,
  198,
  162,
  135,
];

/**
 * How far any colour of a chord may sit from that chord's own hue
 * (degrees, measured the short way round). A chord is one colour with
 * its shades, never an assortment.
 */
export const CHORD_HUE_SPREAD = 40;

/**
 * The ground family that binds the twelve chords together. Every
 * artwork ground is a dark, LOW-CHROMA slate in this window: the
 * saturated hue belongs to the paints and to the accent, never to the
 * field. Without this a full-wheel palette reads as the "random green
 * next to a cyan" the maintainer rejected.
 */
export const GROUND = { minL: 0.14, maxL: 0.32, maxChroma: 0.055 } as const;

/**
 * Shortest angular distance between two hues, in degrees (0 → 180).
 * Exported because the palette invariants are angular, and a naive
 * subtraction would call 350° and 8° eighteen degrees apart in one
 * direction and three hundred and forty-two in the other.
 */
export function hueDistance(a: number, b: number): number {
  const wrap = (value: number): number => ((value % 360) + 360) % 360;
  const delta = Math.abs(wrap(a) - wrap(b)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

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
// The authored chords (ADR-111)

/** Terse constructor — the table below is read as a swatch book. */
function ok(l: number, c: number, h: number): Oklch {
  return { l, c, h };
}

/** One hand-authored chord: an atmosphere, not just a hue. */
export type TintChord = {
  /** Art-direction name. Never shown to a reader; it labels the table. */
  readonly name: string;
  /** Identity hue in degrees — the chord's place on the shelf. Must
   *  be one of {@link PALETTE_ANCHORS}. */
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
 * The palette of the site — TWELVE chords walking the wheel once, in
 * shelf order, the way a row of tankōbon spines does (ADR-111).
 *
 * Read the `bg`/`ink`/`glow` triple of each entry as its VALUE
 * STRUCTURE, which is half of what separates two chords: `grenat` and
 * `indigo` are near-black grounds under a bone highlight, `feuille`
 * and `mandarine` are light grounds with dark forms cut into them,
 * `vermillon` and `jade` sit between. Two entities on neighbouring
 * hues still read as different pictures because their light and dark
 * masses are distributed differently.
 *
 * Every ground obeys {@link GROUND} — dark and barely chromatic — so
 * the twelve share one deep-water field and the saturation lives in
 * the paints. That is the whole difference between a curated shelf
 * and a random wheel.
 *
 * Appending a chord is a pure art-direction act, and three tests fence
 * it: its hue must be one of {@link PALETTE_ANCHORS}, every colour it
 * declares must sit within {@link CHORD_HUE_SPREAD} of that hue, and
 * its ground must stay inside {@link GROUND}.
 */
export const TINT_CHORDS: readonly [TintChord, ...TintChord[]] = [
  {
    // straw-hat yellow — the identity chord
    name: 'paille',
    hue: 93,
    accent: ok(0.855, 0.15, 93),
    wash: ok(0.2365, 0.062, 93),
    surface: ok(0.222, 0.034, 93),
    bg: ok(0.225, 0.042, 93),
    ink: ok(0.147, 0.0286, 93),
    glow: ok(0.968, 0.036, 99),
    stops: [
      ok(0.89, 0.15, 93),
      ok(0.69, 0.15, 77),
      ok(0.905, 0.072, 107),
      ok(0.425, 0.117, 67),
      ok(0.78, 0.156, 101),
      ok(0.298, 0.069, 60),
    ],
  },
  {
    // Nami's orange / a Grand Line sunset
    name: 'mandarine',
    hue: 62,
    accent: ok(0.8, 0.16, 62),
    wash: ok(0.272, 0.062, 62),
    surface: ok(0.222, 0.034, 62),
    bg: ok(0.272, 0.044, 62),
    ink: ok(0.194, 0.0299, 62),
    glow: ok(0.972, 0.03, 68),
    stops: [
      ok(0.835, 0.16, 62),
      ok(0.635, 0.16, 46),
      ok(0.905, 0.072, 76),
      ok(0.425, 0.1248, 36),
      ok(0.725, 0.1664, 70),
      ok(0.298, 0.0736, 29),
    ],
  },
  {
    // Luffy's vest
    name: 'vermillon',
    hue: 30,
    accent: ok(0.69, 0.19, 30),
    wash: ok(0.2037, 0.062, 30),
    surface: ok(0.222, 0.034, 30),
    bg: ok(0.185, 0.044, 30),
    ink: ok(0.107, 0.0299, 30),
    glow: ok(0.955, 0.034, 36),
    stops: [
      ok(0.725, 0.19, 30),
      ok(0.525, 0.19, 14),
      ok(0.905, 0.072, 44),
      ok(0.425, 0.1482, 4),
      ok(0.615, 0.1976, 38),
      ok(0.298, 0.0874, 357),
    ],
  },
  {
    // Shanks' coat — the darkest ground of the set
    name: 'grenat',
    hue: 8,
    accent: ok(0.66, 0.185, 8),
    wash: ok(0.1766, 0.062, 8),
    surface: ok(0.222, 0.034, 8),
    bg: ok(0.152, 0.04, 8),
    ink: ok(0.074, 0.0272, 8),
    glow: ok(0.948, 0.032, 14),
    stops: [
      ok(0.695, 0.185, 8),
      ok(0.495, 0.185, 352),
      ok(0.905, 0.072, 22),
      ok(0.425, 0.1443, 342),
      ok(0.585, 0.1924, 16),
      ok(0.298, 0.0851, 335),
    ],
  },
  {
    // the chapter-642 colour spread
    name: 'rose',
    hue: 350,
    accent: ok(0.72, 0.165, 350),
    wash: ok(0.2586, 0.062, 350),
    surface: ok(0.222, 0.034, 350),
    bg: ok(0.252, 0.042, 350),
    ink: ok(0.174, 0.0286, 350),
    glow: ok(0.968, 0.028, 356),
    stops: [
      ok(0.755, 0.165, 350),
      ok(0.555, 0.165, 334),
      ok(0.905, 0.072, 4),
      ok(0.425, 0.1287, 324),
      ok(0.645, 0.1716, 358),
      ok(0.298, 0.0759, 317),
    ],
  },
  {
    // dusk over the sea
    name: 'prune',
    hue: 320,
    accent: ok(0.7, 0.165, 320),
    wash: ok(0.2365, 0.062, 320),
    surface: ok(0.222, 0.034, 320),
    bg: ok(0.225, 0.042, 320),
    ink: ok(0.147, 0.0286, 320),
    glow: ok(0.96, 0.03, 326),
    stops: [
      ok(0.735, 0.165, 320),
      ok(0.535, 0.165, 304),
      ok(0.905, 0.072, 334),
      ok(0.425, 0.1287, 294),
      ok(0.625, 0.1716, 328),
      ok(0.298, 0.0759, 287),
    ],
  },
  {
    // the night watch
    name: 'indigo',
    hue: 285,
    accent: ok(0.7, 0.165, 285),
    wash: ok(0.1766, 0.062, 285),
    surface: ok(0.222, 0.034, 285),
    bg: ok(0.152, 0.046, 285),
    ink: ok(0.074, 0.0313, 285),
    glow: ok(0.952, 0.032, 291),
    stops: [
      ok(0.735, 0.165, 285),
      ok(0.535, 0.165, 269),
      ok(0.905, 0.072, 299),
      ok(0.425, 0.1287, 259),
      ok(0.625, 0.1716, 293),
      ok(0.298, 0.0759, 252),
    ],
  },
  {
    // the deep sea — the chord the chrome itself is on
    name: 'outremer',
    hue: 255,
    accent: ok(0.72, 0.155, 255),
    wash: ok(0.2078, 0.062, 255),
    surface: ok(0.222, 0.034, 255),
    bg: ok(0.19, 0.048, 255),
    ink: ok(0.112, 0.0326, 255),
    glow: ok(0.958, 0.03, 261),
    stops: [
      ok(0.755, 0.155, 255),
      ok(0.555, 0.155, 239),
      ok(0.905, 0.072, 269),
      ok(0.425, 0.1209, 229),
      ok(0.645, 0.1612, 263),
      ok(0.298, 0.0713, 222),
    ],
  },
  {
    // sky over the Grand Line
    name: 'azur',
    hue: 228,
    accent: ok(0.76, 0.145, 228),
    wash: ok(0.2611, 0.062, 228),
    surface: ok(0.222, 0.034, 228),
    bg: ok(0.255, 0.044, 228),
    ink: ok(0.177, 0.0299, 228),
    glow: ok(0.972, 0.028, 234),
    stops: [
      ok(0.795, 0.145, 228),
      ok(0.595, 0.145, 212),
      ok(0.905, 0.072, 242),
      ok(0.425, 0.1131, 202),
      ok(0.685, 0.1508, 236),
      ok(0.298, 0.0667, 195),
    ],
  },
  {
    // turquoise shallows
    name: 'lagon',
    hue: 198,
    accent: ok(0.8, 0.13, 198),
    wash: ok(0.2447, 0.062, 198),
    surface: ok(0.222, 0.034, 198),
    bg: ok(0.235, 0.044, 198),
    ink: ok(0.157, 0.0299, 198),
    glow: ok(0.97, 0.03, 204),
    stops: [
      ok(0.835, 0.13, 198),
      ok(0.635, 0.13, 182),
      ok(0.905, 0.072, 212),
      ok(0.425, 0.1014, 172),
      ok(0.725, 0.1352, 206),
      ok(0.298, 0.0598, 165),
    ],
  },
  {
    // Zoro's haramaki / palm shade
    name: 'jade',
    hue: 162,
    accent: ok(0.8, 0.135, 162),
    wash: ok(0.2078, 0.062, 162),
    surface: ok(0.222, 0.034, 162),
    bg: ok(0.19, 0.042, 162),
    ink: ok(0.112, 0.0286, 162),
    glow: ok(0.962, 0.032, 168),
    stops: [
      ok(0.835, 0.135, 162),
      ok(0.635, 0.135, 146),
      ok(0.905, 0.072, 176),
      ok(0.425, 0.1053, 136),
      ok(0.725, 0.1404, 170),
      ok(0.298, 0.0621, 129),
    ],
  },
  {
    // island canopy — the lightest ground of the set
    name: 'feuille',
    hue: 135,
    accent: ok(0.82, 0.14, 135),
    wash: ok(0.2718, 0.062, 135),
    surface: ok(0.222, 0.034, 135),
    bg: ok(0.268, 0.042, 135),
    ink: ok(0.19, 0.0286, 135),
    glow: ok(0.975, 0.03, 141),
    stops: [
      ok(0.855, 0.14, 135),
      ok(0.655, 0.14, 119),
      ok(0.905, 0.072, 149),
      ok(0.425, 0.1092, 109),
      ok(0.745, 0.1456, 143),
      ok(0.298, 0.0644, 102),
    ],
  },
];

/**
 * The chord the NEUTRAL chrome is painted with: the deep sea. It is
 * what `styles.css` declares as the default `--art-*` tokens, so an
 * untinted surface still belongs to the palette instead of being an
 * eleventh, unauthored colour. A unit test parses the stylesheet and
 * fails if the two drift.
 */
export const CHROME_CHORD_NAME = 'outremer';

/** The `--art-*` values `styles.css` must declare, as CSS text. */
export function chromeArtTokens(): Readonly<Record<string, string>> {
  const chord = TINT_CHORDS.find((entry) => entry.name === CHROME_CHORD_NAME) ?? TINT_CHORDS[0];
  const tokens: Record<string, string> = {
    '--art-bg': css(chord.bg),
    '--art-ink': css(chord.ink),
    '--art-glow': css(chord.glow),
  };
  chord.stops.forEach((stop, index) => {
    tokens[`--art-${index + 1}`] = css(stop);
  });
  return tokens;
}

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
  // over the twelve chords against the real corpus — all twelve are in
  // use across the 61 entities (7 max, 3 min), and the five Straw Hats
  // on screen together land on five DIFFERENT chords.
  const index = hashString(`tint|ocean|${entityId}`) % TINT_CHORDS.length;
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
    // value structure, which is half of what makes two entities differ
    // (hue is the other half, ADR-111).
    '--art-bg': css(chord.bg),
    '--art-ink': css(chord.ink),
    '--art-glow': css(chord.glow),
  };
  chord.stops.forEach((stop, index) => {
    vars[`--art-${index + 1}`] = css(stop);
  });
  return { chord: chord.name, hue: chord.hue, accent, vars };
}
