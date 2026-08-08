/**
 * Inline link to another entity — the atom every relation / source /
 * event reference renders through. Purely presentational: the chip
 * arrives fully resolved (localized name + type label) from the
 * server view models. When the surrounding page carries a canon-scope
 * context (`ScopeContext`, set by the entity page from the
 * server-computed `propagateScope`), every chip link propagates it as
 * the `?scope=` search param.
 */
import { Link } from '@tanstack/react-router';
import { createContext, type JSX, useContext } from 'react';
import type { EntityChip } from '../api';

/** Canon scope to carry on outgoing entity links (null = none). */
export const ScopeContext = createContext<string | null>(null);

export function useScopeSearch(): { scope: string; } | Record<string, never> {
  const scope = useContext(ScopeContext);
  return scope === null ? {} : { scope };
}

export function EntityChipLink(
  { chip, showType = false }: { readonly chip: EntityChip; readonly showType?: boolean; },
): JSX.Element {
  const search = useScopeSearch();
  return (
    <Link
      to='/e/$type/$slug'
      params={{ type: chip.type, slug: chip.slug }}
      search={search}
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
