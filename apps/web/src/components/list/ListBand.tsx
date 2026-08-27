/**
 * The listing's header band (`design/v2/Liste.dc.html`).
 *
 * A LIST band, not an entity one: it sits lower, carries no
 * illustration, and its colour is a single tinted wash rather than the
 * home page's four-layer field. Overline, 34px title, a count line
 * that says whose count it is, sort chips on the right, view tabs
 * along the bottom edge.
 */
import { type CSSProperties, type ReactElement } from 'react';
import { entityTint } from '../../lib/entity-tint';

export type SortOption = {
  readonly id: string;
  readonly label: string;
};

export function ListBand(
  { type, overline, title, lead, sorts, sort, onSort, tabs, tab, onTab }: {
    readonly type: string;
    readonly overline: string;
    readonly title: string;
    readonly lead: string;
    readonly sorts: readonly SortOption[];
    readonly sort: string;
    readonly onSort: (id: string) => void;
    readonly tabs: readonly SortOption[];
    readonly tab: string;
    readonly onTab: (id: string) => void;
  },
): ReactElement {
  // The wash is the TYPE's own chord (ADR-103), so every listing is a
  // different colour without a palette per type being written anywhere.
  const tint = entityTint(`${type}:index`);
  return (
    <div
      className='relative overflow-hidden border-b border-line px-5 pt-6 lg:px-10'
      style={tint.vars as CSSProperties}
    >
      <div
        aria-hidden
        className='absolute inset-0 opacity-13'
        style={{
          background:
            'linear-gradient(100deg, var(--art-bg), var(--art-ink) 70%, var(--tint-accent))',
        }}
      />
      <div className='relative mx-auto w-full max-w-[1440px]'>
        <div className='flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end lg:gap-8'>
          <div className='min-w-0'>
            <p className='label-xs text-muted'>{overline}</p>
            <h1 className='display mt-1 text-[clamp(1.75rem,3.4vw,2.125rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-fg'>
              {title}
            </h1>
            <p className='mt-1.5 text-[13.5px] text-[color:var(--color-muted)]'>{lead}</p>
          </div>
          {sorts.length > 1 && (
            <div className='flex flex-wrap items-center gap-2.25 pb-1'>
              {sorts.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  on={option.id === sort}
                  onClick={() => onSort(option.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className='relative mt-5 flex gap-5.5'>
          {tabs.map((option) => (
            <button
              key={option.id}
              type='button'
              onClick={() => onTab(option.id)}
              className={`cursor-pointer border-0 bg-transparent pb-2.75 text-[12.5px] transition-colors duration-150 ${
                option.id === tab
                  ? 'font-semibold text-fg shadow-[inset_0_-2px_0_var(--color-gold)]'
                  : 'text-faint hover:text-fg'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The plate's pill: 11.5px, fully rounded, gold when active. */
export function Chip(
  { label, count, on, onClick }: {
    readonly label: string;
    readonly count?: number;
    readonly on: boolean;
    readonly onClick: () => void;
  },
): ReactElement {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-2.75 py-1.25 text-[11.5px] transition-colors duration-150 ${
        on
          ? 'border-gold bg-gold/10 text-gold'
          : 'border-line-strong text-[color:var(--color-muted)] hover:border-gold/45 hover:text-fg'
      }`}
    >
      {label}
      {count !== undefined && <span className='ml-1.5 tabular-nums opacity-60'>{count}</span>}
    </button>
  );
}
