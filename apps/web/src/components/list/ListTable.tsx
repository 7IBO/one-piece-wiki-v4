/**
 * The listing's « Tableau » view.
 *
 * The plate offers three tabs — Grille, Tableau, Chronologie. Two of
 * them are honest with the data the corpus has: the grid is artwork,
 * the table is the SAME entities as rows, with the facet values the
 * rail already derived from the schema as columns. Nothing here names
 * a property; the columns ARE the facets, so a type with different
 * enum properties gets different columns with no code change.
 *
 * Chronologie is not shipped. It only means anything for a type that
 * declares an ordinal AND carries dates, and the corpus has dates on
 * ten chapters out of twelve hundred. A tab that renders an empty axis
 * is worse than a tab that is not there.
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { EntityListItem, FacetView } from '../../api';

export function ListTable(
  { type, items, facets }: {
    readonly type: string;
    readonly items: readonly EntityListItem[];
    readonly facets: readonly FacetView[];
  },
): ReactElement {
  return (
    // Wide tables scroll in their OWN box; the page never scrolls
    // sideways.
    <div className='overflow-x-auto'>
      <table className='w-full min-w-140 border-collapse text-[13px]'>
        <thead>
          <tr className='border-b border-line text-left'>
            <th className='label-xs py-2 pr-4 font-normal text-muted'>#</th>
            <th className='label-xs py-2 pr-4 font-normal text-muted'>—</th>
            {facets.map((facet) => (
              <th key={facet.id} className='label-xs py-2 pr-4 font-normal text-muted'>
                {facet.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.slug} className='border-b border-[color:#191c23]'>
              <td className='py-2 pr-4 tabular-nums text-muted'>{item.ordinal ?? ''}</td>
              <td className='py-2 pr-4'>
                <Link
                  to='/$type/$slug'
                  params={{ type, slug: item.slug }}
                  className='font-semibold text-fg no-underline transition-colors duration-150 hover:text-gold'
                >
                  {item.name}
                </Link>
                {item.secondary !== null && (
                  <span className='ml-2 text-[color:var(--color-muted)]'>{item.secondary}</span>
                )}
              </td>
              {facets.map((facet) => (
                <td key={facet.id} className='py-2 pr-4 text-[color:var(--color-muted)]'>
                  {labelFor(facet, item.facets[facet.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The facet's own label for a raw value — never the raw value. */
function labelFor(facet: FacetView, value: string | undefined): string {
  if (value === undefined) return '';
  return facet.options.find((o) => o.value === value)?.label ?? value;
}
