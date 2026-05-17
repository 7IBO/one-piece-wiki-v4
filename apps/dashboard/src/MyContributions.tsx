/**
 * "Vos contributions en cours" — section shown on the home page to
 * anyone with a session (anonymous or GitHub). Lists the open PRs
 * the current contributor has on the data repo so a returning user
 * can pick up where they left off without retyping anything (the
 * identity travels on the session cookie).
 *
 * Click an item → navigate to the entity editor. A future iteration
 * will pass `?fromPR=<n>` so the form preloads the PR-branch version
 * and additional saves push commits to the same branch instead of
 * opening a new PR; for now we just deep-link to the entity page.
 *
 * Refresh is manual — there's no polling. The GitHub search index
 * has a few-second lag, so a "refresh" button covers the case where
 * a contributor just opened a PR and wants to confirm it's tracked.
 */
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ExternalLink, RotateCw } from 'lucide-react';
import { type JSX, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useLocale, useT } from './form/locale';

type Contribution = {
  prNumber: number;
  htmlUrl: string;
  title: string;
  updatedAt: string;
  entityId: string;
  entityType: string;
  entitySlug: string;
};

/**
 * Relative-time string in the active locale. Picks the coarsest
 * granularity (years/months/days/hours/minutes) so the label stays
 * short ("3h", "il y a 3h"). Intl.RelativeTimeFormat handles the
 * locale-specific punctuation.
 */
function useRelativeTime(): (iso: string) => string {
  const locale = useLocale();
  return useCallback((iso: string) => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffSec = (then - Date.now()) / 1000;
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(locale === 'fr' ? 'fr' : 'en', {
      numeric: 'auto',
    });
    if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
    if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
    return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
  }, [locale]);
}

export function MyContributions(): JSX.Element {
  const t = useT();
  const rel = useRelativeTime();
  const [items, setItems] = useState<readonly Contribution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.myContributions();
      setItems(res.contributions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Hide the whole section when there's nothing to show AND nothing
  // to display — keeps the home page uncluttered for new visitors.
  // We DO show the section while loading and when there's an error
  // because the refresh button is the user's recourse in both cases.
  if (items !== null && items.length === 0 && !loading && error === null) {
    return <></>;
  }

  return (
    <section
      aria-label={t('contributionsTitle')}
      className='border-border bg-card/40 rounded-[6px] border p-4'
    >
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <h2 className='text-foreground text-sm font-semibold'>
            {t('contributionsTitle')}
          </h2>
          <p className='text-muted-foreground text-xs'>
            {t('contributionsSubtitle')}
          </p>
        </div>
        <Button
          size='sm'
          variant='ghost'
          disabled={loading}
          onClick={() => {
            void load();
          }}
          aria-label={t('contributionsRefresh')}
          title={t('contributionsRefresh')}
        >
          <RotateCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error !== null
        ? (
          <p className='text-destructive text-xs'>
            {error}
          </p>
        )
        : items === null
        ? <p className='text-muted-foreground text-xs'>{t('loading')}</p>
        : (
          <ul className='divide-border divide-y'>
            {items.map((c) => (
              <li
                key={c.prNumber}
                className='flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3'
              >
                <Link
                  to='/types/$type/$slug'
                  params={{ type: c.entityType, slug: c.entitySlug }}
                  className='text-foreground hover:underline min-w-0 truncate'
                >
                  <span className='text-muted-foreground text-[11px] uppercase tracking-wide'>
                    {c.entityType}
                  </span>{' '}
                  {c.entitySlug}
                </Link>
                <div className='text-muted-foreground flex shrink-0 items-center gap-3 text-xs'>
                  <a
                    href={c.htmlUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex items-center gap-1 hover:text-foreground'
                    title={t('contributionsOpenPr')}
                  >
                    PR #{c.prNumber}
                    <ExternalLink className='size-3' />
                  </a>
                  <span title={c.updatedAt}>{rel(c.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
