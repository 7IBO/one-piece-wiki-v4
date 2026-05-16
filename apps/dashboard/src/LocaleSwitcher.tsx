/**
 * Tiny EN / FR toggle that sits in the dashboard header. Drives the
 * `useLocale()` reactive value app-wide — chrome labels, enum
 * displays, source titles, the active translation field, the
 * navigator entity-type sidebar labels, all of them switch live.
 *
 * Renders as two segmented chips so the current locale is obvious at
 * a glance (no extra dropdown click to discover what's set).
 */
import { type JSX } from 'react';
import { type Locale, SUPPORTED_LOCALES, useLocale, useSetLocale } from './form/locale';

const LABELS: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
};

export function LocaleSwitcher(): JSX.Element {
  const current = useLocale();
  const setLocale = useSetLocale();
  return (
    <div
      className='border-input inline-flex overflow-hidden rounded-[3px] border'
      role='group'
      aria-label='Interface language'
    >
      {SUPPORTED_LOCALES.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type='button'
            onClick={() => setLocale(loc)}
            aria-pressed={active}
            className={`h-7 px-2.5 font-mono text-[11px] uppercase transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
