/**
 * Global data history page — `/history`.
 *
 * Renders the recent commits touching ANY wiki data (via
 * `GET /api/history`): each commit lists the entities it touched,
 * with the entity name deep-linking to its page and the same semantic
 * change groups (−/+, fully resolved server-side) as the per-entity
 * history page — shared renderer in components/HistoryChangeGroups.
 *
 * In dev the endpoint answers 503 (no GitHub App credentials) — that
 * state renders as an informational Banner, not an error. Locale is a
 * fetch dependency: labels/values are resolved server-side in the
 * requested locale.
 */
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import type { ReactElement } from 'react';
import { api, type GlobalHistoryCommit, type GlobalHistoryEntity } from '../api';
import { HistoryChangeGroups, HistoryCommitHeader } from '../components/HistoryChangeGroups';
import { LoadFailed } from '../components/LoadFailed';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/history')({
  component: GlobalHistoryComponent,
});

/** One touched entity inside a commit row: clickable name (when the
 *  entity still exists) + its semantic change groups. */
function CommitEntity(
  { entity, locale }: {
    readonly entity: GlobalHistoryEntity;
    readonly locale: 'en' | 'fr';
  },
): ReactElement {
  const name = entity.displayName[locale] ?? entity.displayName.en ?? entity.entityId;
  return (
    <div className='mt-2'>
      {entity.route !== null
        ? (
          <Link
            to='/types/$type/$slug'
            params={entity.route}
            className='text-xs font-medium hover:underline'
          >
            {name}
          </Link>
        )
        : <span className='font-mono text-xs'>{entity.entityId}</span>}
      <HistoryChangeGroups
        groups={entity.changes}
        truncated={entity.changesTruncated}
      />
    </div>
  );
}

function GlobalHistoryComponent(): ReactElement {
  const locale = useLocale();
  const t = useT();
  // Locale is a fetch dependency: change labels/values are resolved
  // server-side in the requested locale.
  const { data: history, error, reload } = useApiResource(
    () => api.globalHistory(locale),
    [locale],
  );

  if (error !== null) {
    return <LoadFailed message={error} onRetry={reload} />;
  }
  if (history === null) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Card bleed size='sm' className='py-0'>
          <ul className='divide-border divide-y'>
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className='flex items-center gap-3 px-4 py-3'>
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <Skeleton className='h-4 w-2/3' />
                  <Skeleton className='h-3 w-1/3' />
                </div>
                <Skeleton className='h-5 w-16 shrink-0' />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const commits: readonly GlobalHistoryCommit[] = history.kind === 'ok' ? history.commits : [];

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <h1 className='text-xl font-semibold tracking-tight'>
          {t('historyGlobalTitle')}
        </h1>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('historyGlobalSubtitle')}
          {history.kind === 'ok'
            ? ` — ${t('historyCommitCount').replace('{n}', String(commits.length))}`
            : ''}
        </p>
      </div>

      {history.kind === 'unavailable'
        ? (
          <Banner variant='info'>
            <Info className='text-primary size-4 shrink-0' />
            <span>{t('historyUnavailableDev')}</span>
          </Banner>
        )
        : commits.length === 0
        ? (
          <p className='text-muted-foreground rounded-md border px-3 py-3 text-xs'>
            {t('historyGlobalEmpty')}
          </p>
        )
        : (
          <Card bleed size='sm' className='py-0'>
            <ul className='divide-border divide-y'>
              {commits.map((c) => (
                <li key={c.sha} className='px-4 py-2.5'>
                  <HistoryCommitHeader commit={c} locale={locale} />
                  {c.entities.map((entity) => (
                    <CommitEntity
                      key={entity.entityId}
                      entity={entity}
                      locale={locale}
                    />
                  ))}
                  {c.otherFilesCount > 0
                    ? (
                      <p className='text-muted-foreground mt-1.5 text-xs'>
                        {t('historyOtherFiles').replace(
                          '{n}',
                          String(c.otherFilesCount),
                        )}
                      </p>
                    )
                    : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
    </div>
  );
}
