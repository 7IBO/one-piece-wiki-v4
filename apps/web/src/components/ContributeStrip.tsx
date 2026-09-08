/**
 * Quiet strip at the bottom of every entity page linking to the
 * dashboard (view/edit + history) for the same entity — WEB_APP.md
 * § contribute strip. The dashboard address lives in `lib/dashboard`
 * (`VITE_DASHBOARD_URL` overrides it at build time).
 */
import { type ReactElement } from 'react';
import { t } from '../lib/chrome';
import { dashboardEntityUrl } from '../lib/dashboard';
import { useLocale } from '../routes/__root';

export function ContributeStrip(
  { type, slug }: { readonly type: string; readonly slug: string; },
): ReactElement {
  const locale = useLocale();
  const base = dashboardEntityUrl(type, slug);
  return (
    <div className='mt-14 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line pt-5 text-[13px] text-muted'>
      <span>{t(locale, 'contributeLead')}</span>
      <a
        href={base}
        target='_blank'
        rel='noreferrer'
        className='rounded-md bg-gold px-3.5 py-1.5 text-xs font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
      >
        {t(locale, 'contributeEdit')}
      </a>
      <a
        href={`${base}/history`}
        target='_blank'
        rel='noreferrer'
        className='rounded-md px-3.5 py-1.5 text-xs font-medium text-muted ring-1 ring-line transition-colors duration-150 hover:text-fg'
      >
        {t(locale, 'contributeHistory')}
      </a>
    </div>
  );
}
