/**
 * « CETTE PAGE EST INCOMPLÈTE » — the panel of `design/v2`'s
 * `Mineur.dc.html`, and the plates' answer to a thin entity.
 *
 * The design decides something here that is worth stating: a sparse
 * page does NOT render as a page with holes. It names the facts it is
 * missing. Six labelled chips are a contribution brief; six empty
 * rows are a dead end, and the reader cannot tell "nobody wrote it"
 * from "the work never says".
 *
 * The list is schema-driven end to end (`missingProperties`): the
 * entity type declares `required` / `recommended`, the view model
 * subtracts what the entity carries, and nothing here knows the name
 * of a single property.
 */
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import type { LabelledValue } from '../api';
import { type Locale, t } from '../lib/chrome';

export function IncompletePanel(
  { missing, typeLabel, type, slug, locale }: {
    readonly missing: readonly LabelledValue[];
    readonly typeLabel: string;
    readonly type: string;
    readonly slug: string;
    readonly locale: Locale;
  },
): ReactElement | null {
  if (missing.length === 0) return null;
  return (
    <section className='panel'>
      <h2 className='label-xs mb-2'>{t(locale, 'incompleteTitle')}</h2>
      <p className='max-w-[70ch] text-[13.5px] leading-relaxed text-fg'>
        {t(locale, missing.length === 1 ? 'incompleteBodyOne' : 'incompleteBody')
          .replace('#', String(missing.length))
          .replace('@', typeLabel.toLocaleLowerCase(locale))}
      </p>
      <ul className='mt-3 flex flex-wrap gap-[7px]'>
        {missing.map((item) => (
          <li
            key={item.value}
            className='rounded-[3px] px-[9px] py-1 text-[11px] text-muted ring-1 ring-line-strong'
          >
            {item.label}
          </li>
        ))}
      </ul>
      <div className='mt-4 flex flex-wrap items-center gap-x-4 gap-y-2'>
        <Link
          to='/e/$type/$slug'
          params={{ type, slug }}
          className='rounded-md bg-gold px-3.5 py-2 text-[13px] font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
        >
          {t(locale, 'incompleteCta')}
        </Link>
        <p className='text-xs text-faint'>{t(locale, 'incompleteNote')}</p>
      </div>
    </section>
  );
}
