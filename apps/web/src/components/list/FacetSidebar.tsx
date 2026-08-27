/**
 * The listing's 224px filter rail (`design/v2/Liste.dc.html`).
 *
 * The plate says it in a comment on the plate itself: « les filtres
 * viennent du schéma : une facette par propriété énumérée du type,
 * jamais une liste écrite à la main ». That is already true of the
 * data — `buildFacets` in `server/views.ts` derives them from any
 * declared enum property that actually splits the population — so this
 * component knows no property id, and a type with no enum property
 * renders no rail at all.
 *
 * The counts are the reader's, not the wiki's: they were computed
 * server-side against the same cursor that filtered the list, so an
 * entity appearing later is neither listed nor counted. The footnote
 * says so, because a reader who sees "96" must know whose 96 it is.
 */
import { type ReactElement, useState } from 'react';
import type { FacetView } from '../../api';
import { t } from '../../lib/chrome';
import { useLocale } from '../../routes/__root';

/** Options shown before the rail offers to reveal the rest. */
const VISIBLE_OPTIONS = 4;

export function FacetSidebar(
  { facets, selection, onToggle, onReset }: {
    readonly facets: readonly FacetView[];
    readonly selection: Readonly<Record<string, string>>;
    readonly onToggle: (facetId: string, value: string) => void;
    readonly onReset: () => void;
  },
): ReactElement | null {
  const locale = useLocale();
  if (facets.length === 0) return null;
  const active = Object.keys(selection).length > 0;
  return (
    <aside className='w-full shrink-0 lg:w-56'>
      <div className='flex items-baseline justify-between gap-3'>
        <p className='label-xs text-muted'>{t(locale, 'listFilter')}</p>
        {active && (
          <button
            type='button'
            onClick={onReset}
            className='cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-link transition-colors duration-150 hover:text-link-hover'
          >
            {t(locale, 'listReset')}
          </button>
        )}
      </div>
      <div className='mt-4 space-y-5'>
        {facets.map((facet) => (
          <FacetGroup
            key={facet.id}
            facet={facet}
            selected={selection[facet.id] ?? null}
            onToggle={(value) => onToggle(facet.id, value)}
          />
        ))}
      </div>
      <p className='mt-5.5 border-t border-line pt-3.5 text-[11.5px] leading-[1.65] text-muted'>
        {t(locale, 'listProgressNote')}
      </p>
    </aside>
  );
}

function FacetGroup(
  { facet, selected, onToggle }: {
    readonly facet: FacetView;
    readonly selected: string | null;
    readonly onToggle: (value: string) => void;
  },
): ReactElement {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  // The selected option is always shown, even past the fold: a filter
  // you cannot see is a filter you cannot lift.
  const shown = expanded
    ? facet.options
    : facet.options.filter((o, i) => i < VISIBLE_OPTIONS || o.value === selected);
  const hidden = facet.options.length - shown.length;
  return (
    <div>
      <p className='mb-2.25 text-[9px] uppercase tracking-[0.16em] text-muted'>{facet.label}</p>
      {shown.map((option) => (
        <button
          key={option.value}
          type='button'
          onClick={() => onToggle(option.value)}
          className={`flex w-full cursor-pointer justify-between gap-3 border-0 bg-transparent py-1.25 text-left text-[12.5px] transition-colors duration-150 ${
            option.value === selected
              ? 'text-gold'
              : 'text-[color:var(--color-muted)] hover:text-fg'
          }`}
        >
          <span className='min-w-0 truncate'>{option.label}</span>
          <span className='shrink-0 tabular-nums text-muted'>{option.count}</span>
        </button>
      ))}
      {hidden > 0 && (
        <button
          type='button'
          onClick={() => setExpanded(true)}
          className='cursor-pointer border-0 bg-transparent py-1.25 text-left text-[12.5px] text-muted transition-colors duration-150 hover:text-fg'
        >
          + {hidden} {t(locale, 'listMoreOptions')}
        </button>
      )}
    </div>
  );
}
