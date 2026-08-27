/**
 * First-run invitation to set the spoiler cursor, shown while no
 * `web_progress` cookie exists (WEB_APP.md: absent cookie = no
 * filtering + prominent banner). Dismissal is remembered in its own
 * cookie so SSR renders the right state with no flash.
 */
import { type ReactElement, useState } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

export const BANNER_COOKIE = 'web_progress_seen';

export function FirstRunBanner(): ReactElement | null {
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className='border-t border-line bg-surface'>
      <div className='mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[13px] sm:px-6'>
        <span className='font-semibold text-gold'>{t(locale, 'bannerTitle')}</span>
        <span className='min-w-48 flex-1 text-muted'>{t(locale, 'bannerBody')}</span>
        <button
          type='button'
          onClick={() => {
            // One tiny first-party cookie; see LocaleSwitcher rationale.
            // oxlint-disable-next-line unicorn/no-document-cookie
            document.cookie = `${BANNER_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
            setDismissed(true);
          }}
          className='cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-faint ring-1 ring-line transition-colors duration-150 hover:text-fg'
        >
          {t(locale, 'bannerDismiss')}
        </button>
      </div>
    </div>
  );
}
