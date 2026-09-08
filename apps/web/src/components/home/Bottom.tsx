/**
 * The plate's bottom row.
 *
 * The plate puts a community panel beside the contribution one, with
 * three forum threads and two invented statistics. Neither exists — no
 * entity type, no schema, no ADR — and rendering fabricated rows is the
 * one thing this project cannot afford; the panel had been kept as an
 * empty shell with a « soon » badge. The maintainer has now asked for
 * it to go entirely.
 *
 * So the contribution panel takes the whole row rather than sitting in
 * 7 columns beside a gap: a panel that disappears WIDENS its
 * neighbour, it never leaves a hole (the same rule `Releases` follows
 * when `Crossed` is absent).
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { TypeGroup } from '../../api';
import { t } from '../../lib/chrome';
import { useLocale } from '../../routes/__root';
import { SectionTitle } from './SectionTitle';

export function Contribute(
  { total, groups }: { readonly total: number; readonly groups: readonly TypeGroup[]; },
): ReactElement {
  const locale = useLocale();
  // Real counts only. The plate showed « Sources citées 9 411 » and
  // « À compléter 318 »; neither is computed anywhere yet, so the two
  // largest populations take those rows rather than a made-up figure.
  const biggest = groups
    .flatMap((g) => g.types)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  return (
    <section className='mt-3.5 lg:col-span-12'>
      <SectionTitle>{t(locale, 'homeContribute')}</SectionTitle>
      <div className='mt-3.5 rounded-md border border-line bg-surface px-4 py-3.5'>
        <div className='flex flex-col gap-6.5 lg:flex-row'>
          <div className='min-w-0 flex-1'>
            <p className='text-[13.5px] leading-[1.7] text-[color:var(--color-muted)]'>
              {t(locale, 'homeContributeBody')}
            </p>
            <div className='mt-3.75 flex flex-wrap gap-2.25'>
              <a
                href='https://github.com/7IBO/one-piece-wiki-v4'
                className='rounded-[5px] bg-gold px-4.25 py-2.25 text-[13px] font-semibold text-canvas no-underline transition-opacity duration-150'
              >
                {t(locale, 'contributeEdit')}
              </a>
              <Link
                to='/search'
                search={{ q: '' }}
                className='rounded-[5px] border border-line-strong px-4.25 py-2.25 text-[13px] font-semibold text-fg no-underline transition-colors duration-150'
              >
                {t(locale, 'searchLabel')}
              </Link>
            </div>
          </div>
          <dl className='w-full shrink-0 lg:w-47.5'>
            <Stat label={t(locale, 'entitiesIndexed')} value={total} last={biggest.length === 0} />
            {biggest.map((type, i) => (
              <Stat
                key={type.id}
                label={type.label}
                value={type.count}
                last={i === biggest.length - 1}
              />
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export function Stat(
  { label, value, last }: {
    readonly label: string;
    readonly value: number;
    readonly last: boolean;
  },
): ReactElement {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 text-[13px] ${
        last ? '' : 'border-b border-[color:#191c23]'
      }`}
    >
      <dt className='truncate text-[color:var(--color-muted)]'>{label}</dt>
      <dd className='m-0 tabular-nums text-fg'>{value}</dd>
    </div>
  );
}
