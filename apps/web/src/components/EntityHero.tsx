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
 * `sequence` drives the ordinal navigation of sequential entities.
 * The hero draws the RAILS itself rather than receiving them as
 * nodes: they carry the band's own border and height, so a caller
 * handing in opaque JSX could not be held to that structure — and the
 * band would be described in two files instead of one.
 *
 * They FRAME the band, full height, one on each edge — `design/v2` Chapitre.dc.html says so in its own words:
 * « entité ordinale : prev/next encadrent le bandeau ». The maintainer
 * had asked for the same thing earlier (« bouton à droite et à gauche
 * pour next et prev »), and this file's own comment recorded it, but
 * the implementation kept stacking two pills ABOVE the band instead.
 *
 * They are laid out as flex siblings of the reading column rather than
 * absolutely positioned, so they take their height from the band and
 * a short band cannot leave them floating.
 *
 * The stage spans `main` (which is full-bleed); its content is laid
 * back into the reading column. Presentation only — every string and
 * every visibility decision arrived resolved from the view model.
 */
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import type { ImageView, SequenceView } from '../api';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';
import { EntityArt } from './EntityArt';
import { useScopeSearch } from './EntityChip';
import { EntityImage, initialOf } from './EntityImage';

export type HeroFigure = 'poster' | 'plate';

export function EntityHero(
  { entityId, entityType, name, image, figure, sequence = null, children }: {
    /** Canonical `type:slug` id — the art seed. */
    readonly entityId: string;
    readonly entityType: string;
    /** Display name; its initial becomes the artwork's cropped mark. */
    readonly name: string;
    /** Display image, when the entity has a visible depiction. */
    readonly image: ImageView | null;
    readonly figure: HeroFigure;
    /** Ordinal position, when the type has one. Null draws no rails. */
    readonly sequence?: SequenceView | null;
    /** Identity block laid beside the figure. */
    readonly children: ReactNode;
  },
): ReactElement {
  const [type = '', slug = ''] = entityId.includes(':')
    ? entityId.split(':', 2)
    : [entityType, entityId];
  return (
    // The plate closes the band with a hairline (`border-bottom: 1px
    // solid #1e222a`). Without it a type that authors no sub-pages —
    // and so renders no tab row — left the hero bleeding into the
    // panels with nothing between them.
    // `height: 258px` sur la planche. `min-h` et non `h`, parce qu'un
    // titre long doit pouvoir pousser le bandeau plutôt que déborder —
    // c'est la seule liberté prise sur cette valeur.
    <div className='relative isolate min-h-[13.5rem] w-full overflow-hidden border-b border-line lg:min-h-[258px]'>
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
          className='hero-front absolute inset-0 size-full opacity-30'
        />
        <div aria-hidden className='hero-scrim-x absolute inset-0' />
        <div aria-hidden className='hero-scrim-y absolute inset-0' />
      </div>

      <div className='relative flex items-stretch'>
        {sequence === null ? null : <SequenceRail step={sequence.prev} side='start' />}
        <div className='page-column flex min-w-0 flex-1 flex-col pb-7 pt-6 lg:pb-8 lg:pt-[34px]'>
          {
            /*
             * TOP-ALIGNED, not bottom-aligned. The plate lays the figure
             * and the identity from `top: 34px` and lets the band end
             * where it ends; bottom-aligning them made a short identity
             * float in the middle of a tall band, which is what stopped
             * this reading like `design/v2`.
             */
          }
          <div className='mt-4 flex flex-col gap-5 lg:mt-0 lg:flex-row lg:items-start lg:gap-[22px]'>
            <EntityImage
              image={image}
              type={type}
              slug={slug}
              name={name}
              ratio={figure === 'plate' ? 'wide' : 'portrait'}
              fit='native'
              // `width: 122px; border-radius: 8px` — la planche cadre
              // une couverture 2:3 à 122px, pas à 168px : c'est ce qui
              // poussait le bandeau 43px trop haut.
              className={`hero-figure shrink-0 rounded-[8px] ring-1 ring-line-strong ${
                figure === 'plate' ? 'w-40 sm:w-52 lg:w-[13.5rem]' : 'w-24 sm:w-28 lg:w-[122px]'
              }`}
            />
            <div className='min-w-0 flex-1 lg:pt-1.5'>{children}</div>
          </div>
        </div>
        {sequence === null ? null : <SequenceRail step={sequence.next} side='end' />}
      </div>
    </div>
  );
}

/**
 * One edge RAIL of an ordinal band — the previous instalment on the
 * left, the next on the right, exactly as `design/v2` frames it:
 * « entité ordinale : prev/next encadrent le bandeau ».
 *
 * Values read from the plate: a 52px column, a 20px chevron over the
 * number at 10px, `gap: 6px`, `color: #79818d`, and a single hairline
 * on the inner edge. A rail with nothing to point at is NOT removed —
 * it keeps its width so the band stays symmetric — but it renders
 * dimmed and inert, which is what the plate draws for chapter 1045
 * sitting beyond the reader.
 */
function SequenceRail(
  { step, side }: {
    readonly step: SequenceView['prev'];
    readonly side: 'start' | 'end';
  },
): ReactElement {
  const locale = useLocale();
  const search = useScopeSearch();
  const edge = side === 'start' ? 'border-r' : 'border-l';
  const shell =
    `relative flex w-11 shrink-0 flex-col items-center justify-center gap-1.5 ${edge} border-line lg:w-[52px]`;
  if (step === null) {
    // Dimmed, not absent: removing it would shift the whole band by
    // 52px between one instalment and the next.
    return <div aria-hidden className={`${shell} text-[color:var(--color-line-strong)]`} />;
  }
  return (
    <Link
      to='/$type/$slug'
      params={{ type: step.chip.type, slug: step.chip.slug }}
      search={search}
      aria-label={`${t(locale, side === 'start' ? 'previous' : 'next')} — ${step.chip.name}`}
      title={step.chip.name}
      className={`${shell} text-faint transition-colors duration-150 hover:text-gold`}
    >
      <span aria-hidden className='text-xl leading-none'>
        {side === 'start' ? '\u2039' : '\u203a'}
      </span>
      <span className='text-[10px] font-semibold tabular-nums'>{step.number}</span>
    </Link>
  );
}
