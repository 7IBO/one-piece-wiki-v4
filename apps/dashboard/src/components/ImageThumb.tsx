/**
 * Square image thumbnail with a graceful broken-image fallback. Seed
 * data + manually-typed URLs often point at hosts that don't exist
 * (e.g. `images.onepiece-wiki.example`), and the browser's default
 * broken-image glyph is alarming — we catch the error and show a muted
 * placeholder + the host name so the maintainer knows what's up at a
 * glance.
 *
 * `staging://` placeholders are resolved to the dashboard's signed
 * preview route so unpromoted uploads render too.
 *
 * Shared by the image uploader (form/ImageUpload) and the entity image
 * strip (form/EntityImageStrip); previously the uploader inlined this.
 */
import { cn } from '@/lib/utils';
import { ImagePlus } from 'lucide-react';
import { type JSX, useRef, useState } from 'react';
import { resolveImageUrl } from '../api';

export type ImageThumbProps = {
  readonly src: string;
  /** Screen-reader description. Empty string for decorative thumbnails. */
  readonly alt?: string;
  /** Square edge length in px. Default 64. */
  readonly size?: number;
  readonly className?: string;
};

export function ImageThumb({ src, alt = '', size = 64, className }: ImageThumbProps): JSX.Element {
  const [broken, setBroken] = useState(false);
  // Reset the broken flag when the URL changes so swapping in a new
  // image gives it a fresh chance to load.
  const lastSrc = useRef(src);
  if (lastSrc.current !== src) {
    lastSrc.current = src;
    if (broken) setBroken(false);
  }

  const style = { width: size, height: size } as const;

  if (broken) {
    let host = '?';
    try {
      host = new URL(src).hostname;
    } catch { /* relative URLs etc. */ }
    return (
      <div
        style={style}
        className={cn(
          'bg-muted text-muted-foreground flex shrink-0 flex-col items-center justify-center rounded text-[9px]',
          className,
        )}
        title={`Image unavailable — ${src}`}
      >
        <ImagePlus className='size-4 opacity-50' />
        <span className='max-w-full truncate px-1'>{host}</span>
      </div>
    );
  }

  return (
    <img
      src={resolveImageUrl(src)}
      alt={alt}
      style={style}
      className={cn('shrink-0 rounded object-cover', className)}
      loading='lazy'
      onError={() => setBroken(true)}
    />
  );
}
