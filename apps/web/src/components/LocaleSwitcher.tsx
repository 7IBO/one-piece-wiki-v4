/**
 * FR/EN switcher (Base UI ToggleGroup). Persists to the `web_locale`
 * cookie — the only store the server can read for SSR first paint —
 * then invalidates the router so every loader refetches localized
 * view models.
 */
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { type Locale, SUPPORTED_LOCALES, t } from '../lib/chrome';
import { LOCALE_COOKIE, useLocale } from '../routes/__root';

export function LocaleSwitcher(): ReactElement {
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
      className='flex items-center gap-0.5 rounded-md p-0.5 text-xs font-semibold uppercase ring-1 ring-line'
    >
      {SUPPORTED_LOCALES.map((value) => (
        <Toggle
          key={value}
          value={value}
          aria-label={value === 'en' ? 'English' : 'Français'}
          className='cursor-pointer rounded-[5px] px-1.5 py-1 text-faint transition-colors duration-150 hover:text-fg data-[pressed]:bg-surface-2 data-[pressed]:text-fg'
        >
          {value}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
