/**
 * The immersive entity hero (ADR-103) — the page opens ON the artwork.
 *
 * The composition is built for the wide `hero` frame at raised detail
 * (`lib/entity-art.ts`), then stacked three deep so a flat SVG reads as
 * atmosphere rather than as a diagram:
 *   1. a blurred, over-scaled copy — the colour that bleeds to the
 *      edges of the viewport;
 *   2. the composition itself, barely defocused and at partial
 *      opacity, so the hard geometric edges that are correct at tile
 *      scale melt into the blurred layer instead of reading as seams
 *      at 1440 px — depth of field, not a flat SVG;
 *   3. scrims — vertical, dissolving the stage into the canvas so
 *      there is never a visible line where the artwork stops, and
 *      horizontal, weighting only the side the display type sits on.
 *
 * The stage spans `main` (which is full-bleed); the caller's children
 * are laid back into the reading column. Presentation only: it renders
 * what the view model and the generator decide, and holds no state.
 */
import type { JSX, ReactNode } from 'react';
import { EntityArt } from './EntityArt';
import { initialOf } from './EntityImage';

export function EntityHero(
  { entityId, entityType, name, children }: {
    /** Canonical `type:slug` id — the art seed. */
    readonly entityId: string;
    readonly entityType: string;
    /** Display name; its initial becomes the artwork's cropped mark. */
    readonly name: string;
    /** Header content laid over the stage. */
    readonly children: ReactNode;
  },
): JSX.Element {
  return (
    <div className='relative isolate w-full overflow-hidden'>
      <div className='pointer-events-none absolute inset-0 -z-10'>
        <EntityArt
          entityId={entityId}
          entityType={entityType}
          ratio='hero'
          initial={initialOf(name)}
          className='hero-depth absolute inset-0 size-full'
        />
        <EntityArt
          entityId={entityId}
          entityType={entityType}
          ratio='hero'
          initial={initialOf(name)}
          className='hero-front absolute inset-0 size-full opacity-70'
        />
        <div aria-hidden className='hero-scrim-x absolute inset-0' />
        <div aria-hidden className='hero-scrim-y absolute inset-0' />
      </div>
      <div className='page-column flex min-h-[21rem] flex-col justify-end pb-9 pt-20 sm:min-h-[32rem] sm:pb-12 sm:pt-32'>
        {children}
      </div>
    </div>
  );
}
