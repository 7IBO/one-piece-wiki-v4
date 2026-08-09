/**
 * Inline link to another entity — the atom every relation / source /
 * event reference renders through. Purely presentational: the chip
 * arrives fully resolved (localized name + type label) from the
 * server view models. Set like a printed cross-reference: paper text
 * carrying a seal-red underline, inking fully red on hover. When the
 * surrounding page carries a canon-scope context (`ScopeContext`, set
 * by the entity page from the server-computed `propagateScope`),
 * every chip link propagates it as the `?scope=` search param.
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
      to='/$type/$slug'
      params={{ type: chip.type, slug: chip.slug }}
      search={search}
      className='group inline-flex max-w-full items-baseline gap-1.5'
    >
      <span className='truncate text-fg underline decoration-accent/50 underline-offset-3 transition-colors duration-150 group-hover:text-accent group-hover:decoration-accent'>
        {chip.name}
      </span>
      {showType
        ? (
          <span className='shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint'>
            {chip.typeLabel}
          </span>
        )
        : null}
    </Link>
  );
}
