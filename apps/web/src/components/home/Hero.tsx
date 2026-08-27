/**
 * The plate's hero: full bleed, 380px, a layered colour field under a
 * scrim, with the reader's position floating at its right.
 *
 * The field is FOUR stacked layers, not one gradient — a warm diagonal
 * at 30%, a teal disc bleeding off the top-left, a soft gold rectangle
 * right of centre, then a vertical scrim landing on the canvas colour.
 * That field is what makes the page read as a cover rather than as a
 * dark admin panel, and it was the single biggest thing the pre-plate
 * version dropped.
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { AxisView, ProgressCursor } from '../../api';
import { t } from '../../lib/chrome';
import { useLocale } from '../../routes/__root';
import { ProgressControl } from '../ProgressControl';

/**
 * The plate's background is four stacked layers, not one gradient:
 * a warm diagonal at 30%, a teal disc bleeding off the top-left, a
 * soft gold rectangle right of centre, then a vertical scrim that
 * lands the whole thing on the canvas colour. Reproduced exactly —
 * this field is what makes the page read as a cover rather than as a
 * dark admin panel, and it was the single biggest thing the earlier
 * version dropped.
 */
export function HeroField(): ReactElement {
  return (
    <div aria-hidden className='absolute inset-0 overflow-hidden'>
      <div
        className='absolute inset-0 opacity-30'
        style={{
          background:
            'linear-gradient(100deg, #101a2e 0%, #1d3a5c 34%, #3f6f8f 62%, #c98a4a 88%, #e8b45c 100%)',
        }}
      />
      <div
        className='absolute left-30 -top-15 size-115 rounded-full opacity-28'
        style={{ background: '#2f6b7a' }}
      />
      <div
        className='absolute right-55 top-10 h-75 w-65 opacity-13'
        style={{ background: '#e8b45c' }}
      />
      <div
        className='absolute inset-0'
        style={{
          background:
            'linear-gradient(180deg, rgba(10,11,14,0.5) 0%, rgba(10,11,14,0.18) 40%, #0a0b0e 100%)',
        }}
      />
    </div>
  );
}

export function Hero(
  { axes, primary, cursor }: {
    readonly axes: readonly AxisView[];
    readonly primary: AxisView | null;
    readonly cursor: ProgressCursor;
  },
): ReactElement {
  const locale = useLocale();
  const reading = axes.length > 0;
  return (
    <section className='relative overflow-hidden border-b border-line lg:h-95'>
      <HeroField />
      <div className='relative mx-auto flex h-full w-full max-w-[1440px] flex-col items-start justify-end gap-10 px-5 pb-14 pt-10 lg:flex-row lg:items-end lg:justify-between lg:px-10'>
        <div className='max-w-160'>
          <p className='label-xs text-muted'>
            {reading && primary !== null
              ? `${t(locale, 'homeAt')} ${primary.label} ${primary.at}`
              : t(locale, 'tagline')}
          </p>
          <h1 className='display mt-2.5 text-[clamp(1.9rem,3.6vw,2.875rem)] font-black leading-[1.04] tracking-[-0.035em] text-fg'>
            {t(locale, reading ? 'homeResumeTitle' : 'homeNoProgressTitle')}
          </h1>
          <p className='mt-3 max-w-160 text-[15px] leading-relaxed text-[color:var(--color-muted)]'>
            {t(locale, reading ? 'homeResumeBody' : 'homeNoProgressBody')}
          </p>
          <div className='mt-5 flex flex-wrap items-center gap-2.5'>
            {primary?.next !== null && primary?.next !== undefined && (
              <Link
                to='/$type/$slug'
                params={{ type: primary.sourceType, slug: primary.next.slug }}
                className='rounded-md bg-gold px-5 py-2.5 text-[13.5px] font-semibold text-canvas no-underline transition-opacity duration-150 hover:opacity-90'
              >
                {t(locale, 'homeContinue')} {primary.label.toLowerCase()} {primary.next.number}
              </Link>
            )}
            <ProgressControl progress={cursor} variant='button' />
          </div>
        </div>
        {reading && <ReadingCard axes={axes} primary={primary} />}
      </div>
    </section>
  );
}

/** « Ta lecture » — 320px, one row per axis, one bar for the primary. */
export function ReadingCard(
  { axes, primary }: { readonly axes: readonly AxisView[]; readonly primary: AxisView | null; },
): ReactElement {
  const locale = useLocale();
  const pct = primary === null || primary.total === 0
    ? 0
    : Math.min(100, Math.round((primary.at / Math.max(primary.total, primary.at)) * 100));
  return (
    <div className='w-full shrink-0 rounded-md border border-line bg-surface/85 px-4 py-3.5 backdrop-blur-sm lg:w-80'>
      <p className='label-xs text-muted'>{t(locale, 'homeReading')}</p>
      <dl className='mt-2.5'>
        {axes.map((axis, i) => (
          <div
            key={axis.sourceType}
            className={`flex items-baseline justify-between gap-3 py-2 text-[13px] ${
              i === axes.length - 1 ? '' : 'border-b border-[color:#191c23]'
            }`}
          >
            <dt className='text-[color:var(--color-muted)]'>{axis.label}</dt>
            <dd className='m-0 tabular-nums text-fg'>
              {axis.at}
              {
                /* The denominator is the CORPUS, and the corpus can lag
                behind a reader who has read further than we have
                imported. `1044 / 602` is nonsense on screen, so the
                floor is the reader's own position. */
              }
              <span className='text-muted'>{' / '}{Math.max(axis.total, axis.at)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className='mt-3 h-1 overflow-hidden rounded-sm bg-line'>
        <div className='h-full rounded-sm bg-gold' style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
