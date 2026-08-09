/**
 * FR/EN switcher (Base UI ToggleGroup). Persists to the `web_locale`
 * cookie — the only store the server can read for SSR first paint —
 * then invalidates the router so every loader refetches localized
 * view models. Set like the edition line of a gazette: two small-cap
 * text marks split by a hairline, the current edition underlined.
 */
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { useRouter } from '@tanstack/react-router';
import { type JSX } from 'react';
import { type Locale, SUPPORTED_LOCALES, t } from '../lib/chrome';
import { LOCALE_COOKIE, useLocale } from '../routes/__root';

export function LocaleSwitcher(): JSX.Element {
  const router = useRouter();
  const locale = useLocale();

  const apply = (next: Locale): void => {
    if (next === locale) return;
    // One tiny first-party cookie; the async Cookie Store API is not
    // universal and a cookie library is overkill for one write.
    // oxlint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    void router.invalidate();
  };

  return (
    <ToggleGroup
      value={[locale]}
      onValueChange={(groupValue) => {
        const next = groupValue[0];
        if (next === 'en' || next === 'fr') apply(next);
      }}
      aria-label={t(locale, 'languageLabel')}
      className='flex items-center divide-x divide-line-strong'
    >
      {SUPPORTED_LOCALES.map((value) => (
        <Toggle
          key={value}
          value={value}
          aria-label={value === 'en' ? 'English' : 'Français'}
          className='overline-label cursor-pointer px-2 py-1 transition-colors duration-150 hover:text-fg data-[pressed]:text-fg data-[pressed]:underline data-[pressed]:decoration-accent data-[pressed]:decoration-2 data-[pressed]:underline-offset-4'
        >
          {value}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
