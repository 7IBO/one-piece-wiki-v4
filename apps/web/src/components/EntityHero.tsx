/**
 * The entity hero (v9) — a backdrop plus a figure, the pattern the
 * maintainer asked for: "une version large opacité faible sur full
 * width, et sur le côté au-dessus, un rectangle de la taille de
 * l'image avec rounded".
 *
 * Two distinct planes, and the distinction is the whole point:
 *   1. **The backdrop** — the entity's generated composition (or its
 *      photo) blown up to the full width of the viewport at LOW
 *      opacity, defocused twice over (a heavily blurred over-scaled
 *      copy for colour bleed, the composition itself barely defocused
 *      so its tile-scale edges melt at 1440 px) and dissolved into the
 *      canvas by two scrims. Atmosphere, not information.
 *   2. **The figure** — the same subject, CRISP, at poster size, in a
 *      rounded frame with a hairline ring, sitting on the side. This
 *      is the object the reader recognises. `figure` picks its shape
 *      per entity type (`lib/entity-layout.ts`): a 3:4 poster for
 *      people, crews, volumes; a 16:9 plate for episodes, arcs and
 *      events, whose subject is a scene rather than a person. That is
 *      the FALLBACK shape: when the picture declares a ratio of its
 *      own (`lib/image-ratio.ts` — intrinsic pixels, else its
 *      depiction role) the figure adopts it, because here the picture
 *      is the subject and must not be cropped into a slot.
 *
 * `nav` holds the ordinal navigation of sequential entities — previous
 * pinned to the left edge of the stage, next to the right edge (the
 * "bouton à droite et à gauche pour next et prev").
 *
 * The stage spans `main` (which is full-bleed); its content is laid
 * back into the reading column. Presentation only — every string and
 * every visibility decision arrived resolved from the view model.
 */
import type { JSX, ReactNode } from 'react';
import type { ImageView } from '../api';
import { EntityArt } from './EntityArt';
import { EntityImage, initialOf } from './EntityImage';

export type HeroFigure = 'poster' | 'plate';

export function EntityHero(
  { entityId, entityType, name, image, figure, nav, children }: {
    /** Canonical `type:slug` id — the art seed. */
    readonly entityId: string;
    readonly entityType: string;
    /** Display name; its initial becomes the artwork's cropped mark. */
    readonly name: string;
    /** Display image, when the entity has a visible depiction. */
    readonly image: ImageView | null;
    readonly figure: HeroFigure;
    /** Prev/next controls of a sequential entity (null when it has none). */
    readonly nav?: ReactNode;
    /** Identity block laid beside the figure. */
    readonly children: ReactNode;
  },
): JSX.Element {
  const [type = '', slug = ''] = entityId.includes(':')
    ? entityId.split(':', 2)
    : [entityType, entityId];
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
          className='hero-front absolute inset-0 size-full opacity-45'
        />
        <div aria-hidden className='hero-scrim-x absolute inset-0' />
        <div aria-hidden className='hero-scrim-y absolute inset-0' />
      </div>

      <div className='page-column relative flex min-h-[17rem] flex-col justify-end pb-8 pt-14 sm:min-h-[24rem] sm:pb-11 sm:pt-20'>
        {nav}
        <div className='mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-7'>
          <EntityImage
            image={image}
            type={type}
            slug={slug}
            name={name}
            ratio={figure === 'plate' ? 'wide' : 'portrait'}
            fit='native'
            className={`hero-figure rounded-xl ring-1 ring-line-strong ${
              figure === 'plate'
                ? 'w-40 sm:w-64 lg:w-80'
                : 'w-28 sm:w-40 lg:w-48'
            }`}
          />
          <div className='min-w-0 flex-1'>{children}</div>
        </div>
      </div>
    </div>
  );
}
