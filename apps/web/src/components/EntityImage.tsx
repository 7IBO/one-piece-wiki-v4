/**
 * The ONE image surface of the app — every place a picture of an
 * entity can appear (page portrait, poster cards, connection-row
 * thumbs, gallery plates) renders through this component, so a broken
 * file can never leave a raw `<img>` frame anywhere, and so the ratio
 * rules below hold everywhere at once.
 *
 * Contract:
 * - The designed ground renders FIRST and stays underneath until a real
 *   image is CONFIRMED loaded (`complete && naturalWidth > 0`). That
 *   ground is `EntityArt`: a deterministic generative composition keyed
 *   on the entity id (see `lib/entity-art.ts`). The corpus has almost
 *   no pictures, so this is the artwork on screen, not an empty state.
 * - The `<img>` sits on top at opacity 0 and fades in (~200ms) only
 *   once loaded; on failure it unmounts entirely. Load state is
 *   probed on mount too, so errors/loads that fire before hydration
 *   are never missed.
 * - **Aspect is fixed per KIND OF IMAGE** (`lib/image-ratio.ts`,
 *   WEB_APP.md § Image ratios), never guessed from the slot:
 *   - the FRAME reserves an aspect up front so layout never jumps
 *     between art and photo. `ratio` names the slot's own shape (a
 *     card grid stays a card grid); `fit="native"` hands the frame
 *     over to the image's own ratio, which is what a hero figure and a
 *     gallery plate want — there the picture IS the subject;
 *   - the PICTURE inside is only cropped to fill when its own ratio is
 *     close to the frame's. Beyond `CROP_TOLERANCE` it is `contain`ed
 *     over the artwork instead, because cropping a 16:9 still into a
 *     3:4 poster does not produce a portrait, it destroys the still;
 *   - an image whose ratio nothing declares keeps the historical
 *     behaviour (the slot's frame, `object-cover`) — ADR-091
 *     degradation.
 * - Radius comes from the caller's className (`rounded-md`…) via
 *   `rounded-[inherit]`.
 * - The tile carries the entity's own colour chord (ADR-103): the
 *   `--art-*` custom properties are set per tile, so a listing grid is
 *   a wall of individually-coloured artwork rather than one palette
 *   repeated. Only the art tokens are scoped here — the UI tokens are
 *   the entity page's business (`.tinted`), so chrome stays neutral.
 *
 * Callers that want NO block at all when no image entity exists
 * simply don't render the component.
 */
import { type CSSProperties, type JSX, useState } from 'react';
import type { ImageView } from '../api';
import { entityTint } from '../lib/entity-tint';
import {
  artFrameFor,
  type Aspect,
  aspectCss,
  imageAspect,
  objectFitFor,
  RATIO_CLASSES,
} from '../lib/image-ratio';
import { EntityArt } from './EntityArt';

/** First grapheme of the entity name, uppercased — the artwork's mark. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '·').toUpperCase();
}

/** The slot shapes a caller can reserve, in the vocabulary of ratio classes. */
export type ImageRatio = 'portrait' | 'square' | 'wide' | 'cover' | 'banner';

/**
 * Slot name → ratio class. `wide` is kept as the historical alias of
 * the 16:9 `plate`, so every existing call site reads the same.
 */
const FRAME_ASPECT: Readonly<Record<ImageRatio, Aspect>> = {
  portrait: RATIO_CLASSES.portrait,
  square: RATIO_CLASSES.square,
  wide: RATIO_CLASSES.plate,
  cover: RATIO_CLASSES.cover,
  banner: RATIO_CLASSES.banner,
};

/** Art frame to compose the ground for, per slot shape. */
const FRAME_ART: Readonly<Record<ImageRatio, 'portrait' | 'square' | 'wide'>> = {
  portrait: 'portrait',
  square: 'square',
  wide: 'wide',
  cover: 'portrait',
  banner: 'wide',
};

export function EntityImage(
  { image, type, slug, name, ratio = 'square', fit = 'frame', className = '' }: {
    readonly image: ImageView | null;
    /** Entity type id — selects the artwork's visual family. */
    readonly type: string;
    /** Entity slug — with the type, the `type:slug` art seed. */
    readonly slug: string;
    readonly name: string;
    /** The SLOT's own shape, used when the image declares none of its
     *  own (or when `fit` is `frame`): `portrait` 3:4, `square` 1:1,
     *  `wide` 16:9, `cover` 2:3, `banner` 21:9. */
    readonly ratio?: ImageRatio;
    /** `frame` (default): the slot keeps its shape and the picture is
     *  fitted into it. `native`: the frame ADOPTS the image's own
     *  ratio when it has one — for slots where the picture is the
     *  subject rather than a cell of a grid. */
    readonly fit?: 'frame' | 'native';
    readonly className?: string;
  },
): JSX.Element {
  const entityId = `${type}:${slug}`;
  const own = imageAspect(image);
  const native = fit === 'native' && own !== null;
  const frame = native && own !== null ? own : FRAME_ASPECT[ratio];
  const artFrame = native && own !== null ? artFrameFor(own) : FRAME_ART[ratio];
  return (
    <div
      style={{
        ...entityTint(entityId).vars,
        aspectRatio: aspectCss(frame),
      } as CSSProperties}
      className={`relative isolate shrink-0 overflow-hidden ${className}`}
    >
      <EntityArt
        entityId={entityId}
        entityType={type}
        ratio={artFrame}
        initial={initialOf(name)}
        className='absolute inset-0 size-full rounded-[inherit]'
      />
      {image !== null
        ? <Photo key={image.url} image={image} objectFit={objectFitFor(own, frame)} />
        : null}
    </div>
  );
}

type LoadState = 'pending' | 'loaded' | 'failed';

/**
 * The actual `<img>`, keyed by URL. Invisible until the browser
 * confirms real pixels; removed from the DOM on failure. The mount
 * probe covers loads/errors that resolved before React hydrated.
 */
function Photo(
  { image, objectFit }: {
    readonly image: ImageView;
    readonly objectFit: 'cover' | 'contain';
  },
): JSX.Element | null {
  const [state, setState] = useState<LoadState>('pending');
  if (state === 'failed') return null;
  const probe = (el: HTMLImageElement | null): void => {
    if (el === null || !el.complete) return;
    setState(el.naturalWidth > 0 ? 'loaded' : 'failed');
  };
  return (
    <img
      ref={probe}
      src={image.url}
      alt={image.alt}
      loading='lazy'
      decoding='async'
      {...(image.width !== null && image.height !== null
        ? { width: image.width, height: image.height }
        : {})}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
      className={`absolute inset-0 size-full rounded-[inherit] transition-opacity duration-200 ease-out ${
        objectFit === 'cover' ? 'object-cover' : 'object-contain'
      } ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
