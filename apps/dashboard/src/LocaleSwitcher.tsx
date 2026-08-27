/**
 * Compact locale Select in the dashboard header. Drives the
 * `useLocale()` reactive value app-wide — chrome labels, enum
 * displays, source titles, the active translation field, the
 * navigator entity-type sidebar labels, all of them switch live.
 *
 * A single small Select (was: two segmented EN/FR chips) — the
 * trigger always shows the current locale, and the dropdown lists
 * the alternatives.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ReactElement } from 'react';
import { type Locale, SUPPORTED_LOCALES, useLocale, useSetLocale, useT } from './form/locale';

const LABELS: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
};

export function LocaleSwitcher(): ReactElement {
  const current = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  return (
    <Select
      value={current}
      onValueChange={(v) => setLocale(v === 'fr' ? 'fr' : 'en')}
    >
      {
        /* `max-sm:h-8!` keeps the header switcher compact on mobile —
          the shared trigger recipe bumps sm-size triggers to h-9 for
          touch, but this one lives in the dense header row. */
      }
      <SelectTrigger
        size='sm'
        aria-label={t('interfaceLanguage')}
        className='max-sm:h-8! font-mono uppercase'
      >
        <SelectValue>{(v: Locale) => LABELS[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent
        className='min-w-24'
        fullWidthMobile={false}
        aria-label={t('interfaceLanguage')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <SelectItem key={loc} value={loc} className='font-mono text-xs uppercase'>
            {LABELS[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
