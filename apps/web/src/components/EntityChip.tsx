/**
 * Inline link to another entity — the atom every relation / source /
 * event reference renders through. Purely presentational: the chip
 * arrives fully resolved (localized name + type label) from the
 * server view models. Inline references read as accent links (the
 * one interactive hue of the app). When the surrounding page carries
 * a canon-scope context (`ScopeContext`, set by the entity page from
 * the server-computed `propagateScope`), every chip link propagates
 * it as the `?scope=` search param.
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
      <span className='truncate font-medium text-accent transition-colors duration-150 group-hover:text-accent-hover'>
        {chip.name}
      </span>
      {showType
        ? (
          <span className='label-xs shrink-0'>
            {chip.typeLabel}
          </span>
        )
        : null}
    </Link>
  );
}
