/**
 * "Brouillons en cours" — home-page section listing every entity the
 * contributor has unsaved local edits on. Sibling of `MyContributions`
 * (which lists open PRs on GitHub). The two surface complementary
 * states: drafts are local + unvalidated; contributions are PRs.
 *
 * Drafts persist in IndexedDB (see `form/use-draft.ts`) and live in
 * the visitor's browser only — never on the server. The section
 * subscribes to the `BroadcastChannel` notification fired by
 * `notifyDraftChange`, so the count refreshes in real time as the
 * contributor edits in another tab or saves/discards a draft.
 *
 * Sign-in is recommended but not required to render the section: the
 * draft system works for anonymous visitors too. We gate the SECTION
 * on a session to match `MyContributions` and avoid noise for visitors
 * who landed on the dashboard for the first time.
 */
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { type JSX, useCallback } from 'react';
import { Button } from './components/ui/button';
import { useLocale, useT } from './form/locale';
import { clearDraft, useAllDrafts } from './form/use-draft';

function relativeTime(savedAt: number, locale: 'en' | 'fr'): string {
  const diff = Date.now() - savedAt;
  const min = Math.round(diff / 60_000);
  if (min < 1) return locale === 'fr' ? 'à l’instant' : 'just now';
  if (min < 60) return locale === 'fr' ? `il y a ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return locale === 'fr' ? `il y a ${hr} h` : `${hr} h ago`;
  return new Date(savedAt).toLocaleDateString(locale);
}

export function MyDrafts(): JSX.Element | null {
  const { drafts, refresh } = useAllDrafts();
  const t = useT();
  const locale = useLocale();

  const onDiscard = useCallback(
    (id: string) => {
      void clearDraft(id).then(refresh);
    },
    [refresh],
  );

  if (drafts.length === 0) return null;
  const sorted = [...drafts].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <section
      aria-label={t('draftsTitle')}
      // Amber framing matches the EntityForm "Brouillon non sauvegardé"
      // banner + header DraftsIndicator — one colour means "local
      // pending work" everywhere in the dashboard, so a contributor
      // doesn't have to relearn semantics page-to-page.
      className='border-amber-500/40 bg-amber-500/5 rounded-[6px] border p-4'
    >
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <h2 className='text-foreground flex items-center gap-1.5 text-sm font-semibold'>
            <span className='inline-block size-1.5 rounded-full bg-amber-500' />
            {t('draftsTitle')}
          </h2>
          <p className='text-muted-foreground text-xs'>
            {t('draftsSubtitle')}
          </p>
        </div>
      </div>
      <ul className='divide-border divide-y'>
        {sorted.map((d) => {
          const [type, slug] = d.entityId.split(':');
          const canLink = type !== undefined && slug !== undefined && type !== ''
            && slug !== '';
          return (
            <li
              key={d.entityId}
              className='flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3'
            >
              {canLink
                ? (
                  <Link
                    to='/types/$type/$slug'
                    params={{ type, slug }}
                    className='text-foreground hover:underline min-w-0 truncate'
                  >
                    <span className='text-muted-foreground text-[11px] uppercase tracking-wide'>
                      {type}
                    </span>{' '}
                    {slug}
                  </Link>
                )
                : <span className='font-mono truncate text-xs'>{d.entityId}</span>}
              <div className='text-muted-foreground flex shrink-0 items-center gap-2 text-xs'>
                <span title={new Date(d.savedAt).toLocaleString(locale)}>
                  {relativeTime(d.savedAt, locale)}
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7 hover:text-destructive'
                  aria-label={t('discard')}
                  title={t('discard')}
                  onClick={() => onDiscard(d.entityId)}
                >
                  <Trash2 className='size-3.5' />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
