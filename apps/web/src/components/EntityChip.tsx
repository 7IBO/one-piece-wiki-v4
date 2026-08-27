/**
 * Inline link to another entity — the atom every relation / source /
 * event reference renders through. Purely presentational: the chip
 * arrives fully resolved (localized name + type label) from the
 * server view models. Inline references read as links in the gold family (the
 * one interactive hue of the app). When the surrounding page carries
 * a canon-scope context (`ScopeContext`, set by the entity page from
 * the server-computed `propagateScope`), every chip link propagates
 * it as the `?scope=` search param.
 *
 * On desktop the chip is also the main carrier of the hover preview
 * (`HoverPreview`): an inline chip is a bare name, which is exactly
 * the link a reader cannot judge without opening it.
 */
import { Link } from '@tanstack/react-router';
import { createContext, type ReactElement, useContext } from 'react';
import type { EntityChip } from '../api';
import { HoverPreview } from './HoverPreview';

/** Canon scope to carry on outgoing entity links (null = none). */
export const ScopeContext = createContext<string | null>(null);

export function useScopeSearch(): { scope: string; } | Record<string, never> {
  const scope = useContext(ScopeContext);
  return scope === null ? {} : { scope };
}

export function EntityChipLink(
  { chip, showType = false, preview = true }: {
    readonly chip: EntityChip;
    readonly showType?: boolean;
    /** Desktop hover preview. On by default — a chip is precisely the
     *  link that carries no picture. Off where a card would be noise
     *  (a page's own hero, a self-reference). */
    readonly preview?: boolean;
  },
): ReactElement {
  const search = useScopeSearch();
  const link = (
    <Link
      to='/$type/$slug'
      params={{ type: chip.type, slug: chip.slug }}
      search={search}
      className='group inline-flex max-w-full items-baseline gap-1.5'
    >
      <span className='truncate font-medium text-link transition-colors duration-150 group-hover:text-link-hover'>
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
  if (!preview) return link;
  return <HoverPreview type={chip.type} slug={chip.slug}>{link}</HoverPreview>;
}
