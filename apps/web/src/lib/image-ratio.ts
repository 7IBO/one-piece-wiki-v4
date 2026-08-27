/**
 * Aspect ratios, fixed per KIND OF IMAGE (WEB_APP.md § Image ratios).
 *
 * The maintainer's requirement: « Les images affichées doivent
 * respecter un ratio précis analysé pour chaque type d'image ». The
 * decisive word is *type of image* — a ratio is a property of what the
 * picture IS (a portrait, a cover, an episode still), not of the slot
 * it happens to land in. A 16:9 still cropped into a 3:4 poster frame
 * is not "a portrait", it is a mutilated still.
 *
 * So the ratio is derived, in this order:
 *
 *  1. **The image's own pixels.** The `image` entity type declares
 *     `image_width` / `image_height` (see `data/schemas/entity-types/
 *     image.json`); when both are present that IS the answer, exactly,
 *     with no table to maintain.
 *  2. **The depiction role.** Failing intrinsic dimensions, the `role`
 *     qualifier of the `depicted-by` edge says what the picture is —
 *     and its vocabulary (`depiction-roles`) is authored in the
 *     schema, so the map below is keyed on real schema values rather
 *     than invented ones.
 *  3. **Nothing.** An unknown role, or a role we never classified,
 *     yields null and the caller keeps its own frame (ADR-091
 *     degradation: an unclassified image still renders sanely).
 *
 * Pure data and pure functions — no React, no server, no DOM — so both
 * `server/views.ts` (which attaches the raw facts to `ImageView`) and
 * the components can rely on it, and it is unit-testable on its own.
 */

/** An aspect as its two sides; `w / h` is the number that matters. */
export type Aspect = { readonly w: number; readonly h: number; };

/**
 * The five ratio classes the app draws. Every displayed picture ends
 * up on one of them (or on its own intrinsic ratio, which is finer
 * still). They are named after what they hold, not after where they
 * sit.
 */
export const RATIO_CLASSES = {
  /** People, crews, posters — the databank portrait. */
  portrait: { w: 3, h: 4 },
  /** Volume / book / databook covers — the tankōbon proportion. */
  cover: { w: 2, h: 3 },
  /** Emblems, jolly rogers, icons, connection thumbs. */
  square: { w: 1, h: 1 },
  /** Episode stills, scenes, location views — the screen. */
  plate: { w: 16, h: 9 },
  /** Colour spreads and headers — wider than a screen. */
  banner: { w: 21, h: 9 },
} as const satisfies Readonly<Record<string, Aspect>>;

export type RatioClass = keyof typeof RATIO_CLASSES;

/**
 * Depiction role → ratio class. Keys are values of the schema
 * vocabulary `depiction-roles`; a value absent here (or a role the
 * corpus invents later) simply has no classification, which is the
 * ADR-091 degradation this file must honour rather than guess.
 *
 * The reasoning behind each grouping:
 * - anything framing ONE FIGURE is a portrait (3:4), including the
 *   silhouette, which is a portrait with the ink removed;
 * - a cover is a printed object with its own, taller proportion (2:3);
 * - anything framing a SCENE is a screen (16:9) — a still, an
 *   emotional beat, a place;
 * - a colour spread is a printed double page, wider than a screen;
 * - a group photo, an ability plate and an equipment view are
 *   arrangements around a subject and read squarest of all.
 */
export const ROLE_RATIO_CLASS: Readonly<Record<string, RatioClass>> = {
  primary_portrait: 'portrait',
  secondary_portrait: 'portrait',
  silhouette: 'portrait',
  cover: 'cover',
  scene: 'plate',
  emotional_moment: 'plate',
  location_view: 'plate',
  color_spread: 'banner',
  group_photo: 'square',
  ability_illustration: 'square',
  equipment_view: 'square',
};

/**
 * The facts a displayed image carries about its own shape. Filled by
 * `server/views.ts` from the image entity and the depiction edge; all
 * three fields are routinely null (the corpus has almost no real
 * pictures), which is exactly why every consumer must degrade.
 */
export type ImageShape = {
  readonly width: number | null;
  readonly height: number | null;
  readonly role: string | null;
};

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

/**
 * The aspect an image should be displayed at, or null when nothing
 * about the image says. Intrinsic pixels win over the role: they are
 * the image, the role is a category.
 */
export function imageAspect(shape: ImageShape | null | undefined): Aspect | null {
  if (shape === null || shape === undefined) return null;
  if (isPositive(shape.width) && isPositive(shape.height)) {
    return { w: shape.width, h: shape.height };
  }
  if (shape.role === null) return null;
  const named = ROLE_RATIO_CLASS[shape.role];
  return named === undefined ? null : RATIO_CLASSES[named];
}

/** `aspect-ratio` CSS value — `"3 / 4"`. */
export function aspectCss(aspect: Aspect): string {
  return `${aspect.w} / ${aspect.h}`;
}

/**
 * How far apart two aspects are, as a ratio of the larger to the
 * smaller (1 = identical). Used to decide whether filling a frame
 * would crop the picture out of its own shape.
 */
export function aspectDistance(a: Aspect, b: Aspect): number {
  const ra = a.w / a.h;
  const rb = b.w / b.h;
  return ra > rb ? ra / rb : rb / ra;
}

/**
 * Beyond this much divergence, filling the frame stops being a crop
 * and becomes a different picture (a 16:9 still cropped to 3:4 keeps
 * 42% of its width). 1.15 lets a 3:4 portrait fill a 1:1 thumb — that
 * IS a crop of a portrait, and a legitimate one — while a plate in a
 * poster frame is contained instead.
 */
export const CROP_TOLERANCE = 1.15;

/**
 * `cover` (fill the frame, cropping) or `contain` (fit inside it,
 * letterboxed over the artwork ground) for one image in one frame.
 * Unknown image aspect → `cover`, the historical behaviour.
 */
export function objectFitFor(
  image: Aspect | null,
  frame: Aspect,
): 'cover' | 'contain' {
  if (image === null) return 'cover';
  return aspectDistance(image, frame) <= CROP_TOLERANCE ? 'cover' : 'contain';
}

/**
 * The generated-artwork frame closest to an aspect. The art generator
 * composes FOR a frame (`lib/entity-art.ts`), so when a tile takes an
 * image's own ratio the ground underneath must be composed for the
 * nearest of the shapes the generator knows.
 */
export function artFrameFor(aspect: Aspect): 'portrait' | 'square' | 'wide' {
  const ratio = aspect.w / aspect.h;
  if (ratio <= 0.9) return 'portrait';
  if (ratio >= 1.35) return 'wide';
  return 'square';
}
