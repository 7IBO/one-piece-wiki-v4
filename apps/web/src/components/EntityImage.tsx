/**
 * The ONE image surface of the app — every place a picture of an
 * entity can appear (page portrait, poster cards, connection-row
 * thumbs) renders through this component, so a broken file can never
 * leave a raw `<img>` frame anywhere.
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
 * - Aspect ratio is reserved up front (3:4 portrait, 1:1 thumb) so
 *   layout never jumps between art and photo. Radius comes from the
 *   caller's className (`rounded-md`…) via `rounded-[inherit]`.
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
import { EntityArt } from './EntityArt';

/** First grapheme of the entity name, uppercased — the artwork's mark. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '·').toUpperCase();
}

export type ImageRatio = 'portrait' | 'square';

export function EntityImage(
  { image, type, slug, name, ratio = 'square', className = '' }: {
    readonly image: ImageView | null;
    /** Entity type id — selects the artwork's visual family. */
    readonly type: string;
    /** Entity slug — with the type, the `type:slug` art seed. */
    readonly slug: string;
    readonly name: string;
    /** Reserved aspect: `portrait` = 3:4 (posters), `square` = 1:1 (thumbs). */
    readonly ratio?: ImageRatio;
    readonly className?: string;
  },
): JSX.Element {
  const entityId = `${type}:${slug}`;
  return (
    <div
      style={entityTint(entityId).vars as CSSProperties}
      className={`relative isolate shrink-0 overflow-hidden ${
        ratio === 'portrait' ? 'aspect-3/4' : 'aspect-square'
      } ${className}`}
    >
      <EntityArt
        entityId={entityId}
        entityType={type}
        ratio={ratio}
        initial={initialOf(name)}
        className='absolute inset-0 size-full rounded-[inherit]'
      />
      {image !== null ? <Photo key={image.url} image={image} /> : null}
    </div>
  );
}

type LoadState = 'pending' | 'loaded' | 'failed';

/**
 * The actual `<img>`, keyed by URL. Invisible until the browser
 * confirms real pixels; removed from the DOM on failure. The mount
 * probe covers loads/errors that resolved before React hydrated.
 */
function Photo({ image }: { readonly image: ImageView; }): JSX.Element | null {
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
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
      className={`absolute inset-0 size-full rounded-[inherit] object-cover transition-opacity duration-200 ease-out ${
        state === 'loaded' ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
