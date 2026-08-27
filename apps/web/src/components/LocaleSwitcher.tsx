/**
 * Language switcher. Persists to the `web_locale` cookie — the only
 * store the server can read for SSR first paint — then invalidates the
 * router so every loader refetches localized view models.
 *
 * Shaped as the plate shows it: the CURRENT language, named in its own
 * tongue, with a caret. The earlier `en | fr` toggle put both options
 * on screen permanently, which reads as a setting rather than as a
 * state, and on a two-language site it wastes the segment. Still a
 * ToggleGroup underneath, so keyboard and screen-reader behaviour is
 * unchanged; only the pressed one is rendered, and clicking it moves
 * to the next language.
 */
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { type Locale, SUPPORTED_LOCALES, t } from '../lib/chrome';
import { LOCALE_COOKIE, useLocale } from '../routes/__root';

/** Each language named in its own tongue, as the plate shows it. */
const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  fr: 'Français',
};

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
      className='flex items-center'
    >
      {SUPPORTED_LOCALES.map((value) => {
        // Only the ACTIVE one is rendered: it is the state, and
        // pressing it hands the turn to the next language.
        if (value !== locale) return null;
        const next = SUPPORTED_LOCALES.find((l) => l !== locale) ?? locale;
        return (
          <Toggle
            key={value}
            value={next}
            aria-label={next === 'en' ? 'English' : 'Français'}
            className='flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] text-[color:var(--color-muted)] transition-colors duration-150 hover:text-fg'
          >
            {LANGUAGE_NAMES[value]}
            <span aria-hidden className='text-[9px] text-faint'>▾</span>
          </Toggle>
        );
      })}
    </ToggleGroup>
  );
}
