/**
 * The ONE image surface of the app — every place a picture of an
 * entity can appear (infobox portrait, member rows, cast/crew thumbs)
 * renders through this component, so a broken file can never leave a
 * raw `<img>` frame anywhere.
 *
 * Contract:
 * - The designed ground (a monogram plate: the entity's initial set
 *   in the display serif on a quiet raised-ink ground, hairline
 *   frame — a printer's ornament, not a placeholder) renders FIRST
 *   and stays underneath until a real image is CONFIRMED loaded
 *   (`complete && naturalWidth > 0`).
 * - The `<img>` sits on top at opacity 0 and fades in (~200ms) only
 *   once loaded; on failure it unmounts entirely. Load state is
 *   probed on mount too, so errors/loads that fire before hydration
 *   are never missed.
 * - Aspect ratio is reserved up front (3:4 portrait, 1:1 thumb) so
 *   layout never jumps between fallback and photo. Everything is
 *   square-cornered — photos in print are rectangles.
 *
 * Callers that want NO block at all when no image entity exists
 * (e.g. the infobox) simply don't render the component.
 */
import { type JSX, useState } from 'react';
import type { ImageView } from '../api';

/** First grapheme of the entity name, uppercased — the monogram. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '·').toUpperCase();
}

export type ImageRatio = 'portrait' | 'square';

export function EntityImage(
  { image, name, ratio = 'square', className = '', monogramClassName = 'text-xl' }: {
    readonly image: ImageView | null;
    readonly name: string;
    /** Reserved aspect: `portrait` = 3:4 (infobox), `square` = 1:1 (thumbs). */
    readonly ratio?: ImageRatio;
    readonly className?: string;
    /** Type scale of the monogram initial, matched to the plate size. */
    readonly monogramClassName?: string;
  },
): JSX.Element {
  return (
    <div
      className={`relative isolate shrink-0 overflow-hidden ${
        ratio === 'portrait' ? 'aspect-3/4' : 'aspect-square'
      } ${className}`}
    >
      <div
        aria-hidden
        className='absolute inset-0 grid select-none place-items-center bg-surface ring-1 ring-line ring-inset'
      >
        <span
          className={`font-display font-medium leading-none text-fg/35 ${monogramClassName}`}
        >
          {initialOf(name)}
        </span>
      </div>
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
      className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ease-out ${
        state === 'loaded' ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
