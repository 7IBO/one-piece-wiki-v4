/**
 * Image slot with a guaranteed graceful fallback: when the view-model
 * carries no visible image, or the file fails to load (the current
 * corpus stores placeholder URLs), a typographic block with the
 * entity's initial renders instead — never a broken image icon.
 */
import { type JSX, useState } from 'react';
import type { ImageView } from '../api';

function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '?').toUpperCase();
}

export function EntityImage({ image, name, className = '', initialClassName = 'text-5xl' }: {
  readonly image: ImageView | null;
  readonly name: string;
  readonly className?: string;
  readonly initialClassName?: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (image === null || failed) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center bg-panel-2 font-display font-semibold text-faint select-none ${initialClassName} ${className}`}
      >
        {initialOf(name)}
      </div>
    );
  }
  return (
    <img
      src={image.url}
      alt={image.alt}
      loading='lazy'
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
