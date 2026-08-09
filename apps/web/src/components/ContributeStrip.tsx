/**
 * Quiet ruled band at the bottom of every entity page linking to the
 * dashboard (view/edit + history) for the same entity — WEB_APP.md
 * § contribute strip. Set as a printed colophon line: hairline above,
 * serif lead, stamped edit mark. `VITE_DASHBOARD_URL` is a build-time
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
    <div className='mt-12 flex flex-wrap items-baseline gap-x-5 gap-y-2.5 border-t border-line-strong pt-3.5'>
      <span className='font-serif text-[14px] italic text-muted'>
        {t(locale, 'contributeLead')}
      </span>
      <a
        href={base}
        target='_blank'
        rel='noreferrer'
        className='overline-label border border-accent px-3 py-1.5 text-accent transition-colors duration-150 hover:bg-accent hover:text-canvas'
      >
        {t(locale, 'contributeEdit')}
      </a>
      <a
        href={`${base}/history`}
        target='_blank'
        rel='noreferrer'
        className='overline-label text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg'
      >
        {t(locale, 'contributeHistory')}
      </a>
    </div>
  );
}
