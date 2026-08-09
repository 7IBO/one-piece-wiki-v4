/**
 * Quiet full-width strip at the bottom of every entity page linking
 * to the dashboard (view/edit + history) for the same entity —
 * WEB_APP.md § contribute strip. `VITE_DASHBOARD_URL` is a build-time
 * env override; default is the production dashboard.
 */
import { type JSX } from 'react';
import { t } from '../lib/chrome';
import { useLocale } from '../routes/__root';

const envUrl: unknown = import.meta.env['VITE_DASHBOARD_URL'];
const DASHBOARD_URL: string = typeof envUrl === 'string' && envUrl !== ''
  ? envUrl.replace(/\/$/, '')
  : 'https://one-piece-wiki-v4-dashboard.vercel.app';

export function ContributeStrip(
  { type, slug }: { readonly type: string; readonly slug: string; },
): JSX.Element {
  const locale = useLocale();
  const base = `${DASHBOARD_URL}/types/${type}/${slug}`;
  return (
    <div className='mt-16 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted'>
      <span>{t(locale, 'contributeLead')}</span>
      <a
        href={base}
        target='_blank'
        rel='noreferrer'
        className='rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
      >
        {t(locale, 'contributeEdit')}
      </a>
      <a
        href={`${base}/history`}
        target='_blank'
        rel='noreferrer'
        className='rounded-lg border border-line px-3.5 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg'
      >
        {t(locale, 'contributeHistory')}
      </a>
    </div>
  );
}
