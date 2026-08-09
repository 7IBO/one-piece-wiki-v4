/**
 * First-run invitation to set the spoiler cursor, shown while no
 * `web_progress` cookie exists (WEB_APP.md: absent cookie = no
 * filtering + prominent banner). Dismissal is remembered in its own
 * cookie so SSR renders the right state with no flash. Set as a
 * printed notice: a ruled band under the masthead, small-cap lead,
 * serif body, underlined dismiss.
 */
import { type JSX, useState } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

export const BANNER_COOKIE = 'web_progress_seen';

export function FirstRunBanner(): JSX.Element | null {
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className='mx-auto w-full max-w-[1200px] px-4 sm:px-6'>
      <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2'>
        <span className='overline-label text-accent'>{t(locale, 'bannerTitle')}</span>
        <span className='min-w-48 flex-1 font-serif text-[13px] italic text-muted'>
          {t(locale, 'bannerBody')}
        </span>
        <button
          type='button'
          onClick={() => {
            // One tiny first-party cookie; see LocaleSwitcher rationale.
            // oxlint-disable-next-line unicorn/no-document-cookie
            document.cookie = `${BANNER_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
            setDismissed(true);
          }}
          className='cursor-pointer text-[11px] font-medium text-faint underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg'
        >
          {t(locale, 'bannerDismiss')}
        </button>
      </div>
    </div>
  );
}
