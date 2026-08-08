/**
 * In-app entity history page — `/types/$type/$slug/history`.
 *
 * Renders the commit history of the entity's JSON file (via
 * `GET /api/entities/:type/:slug/history`) so a contributor reviews
 * who changed what without leaving the dashboard. The external
 * GitHub-history link the entity page header used to carry lives
 * here now, as a small outline button in the page header.
 *
 * In dev the endpoint answers 503 (no GitHub App credentials) — that
 * state renders as an informational Banner, not an error.
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveDisplayName } from '@onepiece-wiki/schemas';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, Info } from 'lucide-react';
import { type JSX, useMemo } from 'react';
import { api, type HistoryCommit } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/types/$type/$slug/history')({
  component: EntityHistoryComponent,
});

// TODO: read the data-repo origin from a client-exposed env var (the
// server already knows it as config.dataRepo) instead of hardcoding.
// Moved here from the entity page when its history link became
// internal (the external link now lives in this page's header).
const DATA_REPO_URL = 'https://github.com/7IBO/one-piece-wiki-v4';
const UNIVERSE_ID = 'one-piece';

/**
 * GitHub commit-history URL for the entity's JSON file. The path is
 * derived from the route type + the entity id's slug part — no entity
 * type is hardcoded. Same derivation as the server endpoint.
 */
function entityHistoryUrl(type: string, entityId: string): string {
  const idSlugPart = entityId.slice(entityId.indexOf(':') + 1);
  return `${DATA_REPO_URL}/commits/main/data/universes/${UNIVERSE_ID}/entities/${type}/${idSlugPart}.json`;
}

/**
 * Localized commit date: relative ("2 days ago" / "il y a 2 jours")
 * within the last month, absolute (`Intl.DateTimeFormat`, medium
 * style) beyond that. The row keeps the raw ISO date in `title` so
 * the exact timestamp is always one hover away.
 */
function formatCommitDate(iso: string, locale: 'en' | 'fr'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 30) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diffDays >= 1) return rtf.format(-diffDays, 'day');
    const diffHours = Math.floor(diffMs / 3_600_000);
    if (diffHours >= 1) return rtf.format(-diffHours, 'hour');
    return rtf.format(-Math.max(Math.floor(diffMs / 60_000), 0), 'minute');
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

function firstLine(message: string): string {
  const nl = message.indexOf('\n');
  return nl < 0 ? message : message.slice(0, nl);
}

function EntityHistoryComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const t = useT();
  const { data, error, reload } = useApiResource(
    () =>
      Promise.all([
        api.getEntity(type, slug),
        api.schemas(),
        api.entityHistory(type, slug),
      ]),
    [type, slug],
  );
  const entity = data?.[0] ?? null;
  const schemas = data?.[1] ?? null;
  const history = data?.[2] ?? null;

  const displayName = useMemo(
    () =>
      entity === null
        ? null
        : resolveDisplayName(
          entity.data,
          entity.translations,
          locale,
          schemas?.entityTypes[type]?.display_name_properties,
        ),
    [entity, locale, schemas, type],
  );

  if (error !== null) {
    return <LoadFailed message={error} onRetry={reload} />;
  }
  if (entity === null || history === null) {
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

  const commits: readonly HistoryCommit[] = history.kind === 'ok' ? history.commits : [];

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type/$slug' params={{ type, slug }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-1.5 h-6 px-1.5 text-xs'
        >
          <ChevronLeft className='size-3' />
          {t('backToEntity')}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
          <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight'>
            {displayName ?? entity.id}
            <span className='text-muted-foreground font-normal'>
              {' '}— {t('history')}
            </span>
          </h1>
          <Button
            render={
              <a
                href={entityHistoryUrl(type, entity.id)}
                target='_blank'
                rel='noreferrer'
              />
            }
            variant='outline'
            size='sm'
            className='shrink-0 gap-1.5 no-underline'
          >
            <ExternalLink className='size-3.5' />
            {t('historyViewOnGithub')}
          </Button>
        </div>
        {history.kind === 'ok'
          ? (
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('historyCommitCount').replace('{n}', String(commits.length))}
            </p>
          )
          : null}
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
            {t('historyEmpty')}
          </p>
        )
        : (
          <Card bleed size='sm' className='py-0'>
            <ul className='divide-border divide-y'>
              {commits.map((c) => (
                <li key={c.sha} className='px-4 py-2.5'>
                  <div className='flex items-start gap-3'>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>
                        {firstLine(c.message)}
                      </p>
                      <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                        <span
                          {...(c.authorLogin !== undefined
                            ? { title: `@${c.authorLogin}` }
                            : {})}
                        >
                          {c.authorName}
                        </span>
                        {' · '}
                        <span title={c.date}>{formatCommitDate(c.date, locale)}</span>
                      </p>
                    </div>
                    <Badge variant='secondary' className='shrink-0 font-mono text-xs'>
                      {c.shortSha}
                    </Badge>
                    <Button
                      render={
                        <a
                          href={c.htmlUrl}
                          target='_blank'
                          rel='noreferrer'
                          aria-label={t('historyOpenCommit')}
                          title={t('historyOpenCommit')}
                        />
                      }
                      variant='ghost'
                      size='icon'
                      className='text-muted-foreground hover:text-foreground shrink-0'
                    >
                      <ExternalLink className='size-4' />
                    </Button>
                  </div>
                  {
                    /* Changed lines, visible without a click. `+` rows
                    green, `-` rows red; long diffs end with a muted
                    "+n more" count (the full diff is one commit-link
                    away). Newest commits only — older rows have no
                    diffLines (server per-commit API budget). */
                  }
                  {c.diffLines !== undefined && c.diffLines.length > 0
                    ? (
                      <div className='bg-muted/20 mt-2 overflow-x-auto rounded-md border px-2.5 py-1.5 font-mono text-xs leading-relaxed'>
                        {c.diffLines.map((line, i) => (
                          <div
                            key={i}
                            className={`whitespace-pre ${
                              line.startsWith('+')
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {line}
                          </div>
                        ))}
                        {(c.diffTruncated ?? 0) > 0
                          ? (
                            <div className='text-muted-foreground mt-0.5'>
                              {t('historyDiffMore').replace(
                                '{n}',
                                String(c.diffTruncated),
                              )}
                            </div>
                          )
                          : null}
                      </div>
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
