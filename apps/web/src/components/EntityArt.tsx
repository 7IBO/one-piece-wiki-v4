/**
 * Renders the generated artwork of `lib/entity-art` as inline SVG.
 *
 * Presentation only: every coordinate and paint is decided by the
 * generator, this component just maps the scene onto SVG elements. It
 * is a pure function of its props — no state, no effects, no requests —
 * so it renders identically on the server and after hydration, and it
 * reserves no layout of its own (the caller's box owns the aspect).
 *
 * `isolation: isolate` keeps the layers' blend modes inside the tile:
 * without it, a `screen` layer would composite against the page.
 */
import type { ReactElement } from 'react';
import { type ArtRatio, type ArtShape, buildEntityArt } from '../lib/entity-art';

/**
 * Une forme, écrite au plus court.
 *
 * Mesuré : sur `/devil-fruits`, les 60 vignettes pesaient **646 Ko sur
 * 802** — 10,8 Ko par carte. Pas à cause du dessin, mais de ce qui
 * l'entourait : quatre attributs de trait sur des formes SANS trait,
 * un `mix-blend-mode: normal` qui est la valeur par défaut, et des
 * opacités à quinze décimales (`0.422681140312925`).
 *
 * Rien de tout ça n'est visible. Ce qui suit n'omet que des valeurs
 * par défaut et n'arrondit qu'en deçà du pixel — le rendu est
 * identique, à l'octet près du dessin.
 */
function Layer({ shape }: { readonly shape: ArtShape; }): ReactElement {
  const stroked = shape.stroke !== undefined && shape.stroke !== null && shape.strokeWidth > 0;
  return (
    <path
      d={shape.d}
      fill={shape.fill ?? 'none'}
      {
        // Les attributs de trait ne veulent rien dire sans trait, et
        // `stroke` vaut `none` par défaut en SVG.
        ...(stroked
          ? {
            stroke: shape.stroke,
            strokeWidth: shape.strokeWidth,
            strokeLinecap: shape.cap,
            strokeLinejoin: 'round' as const,
          }
          : {})
      }
      {
        // `1` est l'opacité par défaut ; deux décimales suffisent
        // largement à un fond décoratif.
        ...(shape.opacity >= 1 ? {} : { opacity: Math.round(shape.opacity * 100) / 100 })
      }
      {...(shape.blend === 'normal' ? {} : { style: { mixBlendMode: shape.blend } })}
    />
  );
}

export function EntityArt(
  { entityId, entityType, ratio = 'portrait', initial = null, className = '' }: {
    /** Canonical `type:slug` id — the seed. Same id → same artwork. */
    readonly entityId: string;
    /** Entity type id; picks the visual family (unknown → generic). */
    readonly entityType: string;
    readonly ratio?: ArtRatio;
    /** Single grapheme woven into the composition, when the family uses one. */
    readonly initial?: string | null;
    readonly className?: string;
  },
): ReactElement {
  const scene = buildEntityArt(entityId, entityType, ratio, initial ?? undefined);
  const before = scene.shapes.slice(0, scene.markIndex);
  const after = scene.shapes.slice(scene.markIndex);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio='xMidYMid slice'
      className={className}
      style={{ isolation: 'isolate' }}
    >
      <rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.background} />
      {before.map((shape, index) => <Layer key={`b${index}`} shape={shape} />)}
      {scene.mark !== null
        ? (
          <text
            x={scene.mark.x}
            y={scene.mark.y}
            fill={scene.mark.fill}
            opacity={scene.mark.opacity}
            transform={scene.mark.transform ?? undefined}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: `${scene.mark.size}px`,
              fontWeight: 700,
              letterSpacing: '-0.05em',
            }}
          >
            {scene.mark.char}
          </text>
        )
        : null}
      {after.map((shape, index) => <Layer key={`a${index}`} shape={shape} />)}
    </svg>
  );
}
