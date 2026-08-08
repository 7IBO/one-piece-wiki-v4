/**
 * Inline link to another entity — the atom every relation / source /
 * event reference renders through. Purely presentational: the chip
 * arrives fully resolved (localized name + type label) from the
 * server view models.
 */
import { Link } from '@tanstack/react-router';
import { type JSX } from 'react';
import type { EntityChip } from '../api';

export function EntityChipLink(
  { chip, showType = false }: { readonly chip: EntityChip; readonly showType?: boolean; },
): JSX.Element {
  return (
    <Link
      to='/e/$type/$slug'
      params={{ type: chip.type, slug: chip.slug }}
      className='group inline-flex max-w-full items-baseline gap-1.5'
    >
      <span className='truncate text-sea underline decoration-sea/30 underline-offset-2 transition-colors group-hover:decoration-sea'>
        {chip.name}
      </span>
      {showType
        ? (
          <span className='shrink-0 text-[0.7rem] uppercase tracking-wide text-faint'>
            {chip.typeLabel}
          </span>
        )
        : null}
    </Link>
  );
}
