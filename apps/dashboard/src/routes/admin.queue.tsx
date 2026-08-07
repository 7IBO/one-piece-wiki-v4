/**
 * Admin moderation queue (W-B). Lists every open `via-dashboard` PR —
 * entity edits, creations, cast changes — with the contributor parsed
 * from the PR body's Contributors bullet (the bot owns commits per
 * ADR-016, so PR author metadata is useless for attribution).
 *
 * Actions reuse the existing admin endpoints:
 *   - Approve → POST /api/admin/promote (promotes staged images if
 *     any, rewrites URLs, squash-merges)
 *   - Reject  → POST /api/admin/reject (closes the PR + deletes its
 *     staged R2 objects)
 *
 * Access: the route is admin-gated server-side (403 from
 * /api/admin/pulls); the client shows a sign-in / not-admin notice
 * instead of the table. Per-PR structured diff review stays on GitHub
 * for v1 (the "Review" link) — the in-app diff view is the tracked
 * W-B follow-up.
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute } from '@tanstack/react-router';
import { Check, ChevronDown, ChevronRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { type JSX, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type QueueItem } from '../api';
import { useCurrentUser } from '../auth';
import { LoadFailed } from '../components/LoadFailed';
import { useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/admin/queue')({
  component: AdminQueueComponent,
});

function contributorLabel(c: QueueItem['contributor']): string {
  if (c === null) return '—';
  return c.kind === 'github' ? `@${c.login}` : c.nickname;
}

function AdminQueueComponent(): JSX.Element {
  const t = useT();
  const { user, loaded } = useCurrentUser();
  const isAdmin = user?.kind === 'github' && user.admin === true;

  const { data, error, reload } = useApiResource(
    () => (isAdmin ? api.adminPulls() : Promise.resolve({ pulls: [] as readonly QueueItem[] })),
    [isAdmin],
  );
  // PR number currently being acted on (approve/reject) — one at a
  // time; the queue is a moderation surface, not a bulk tool.
  const [busy, setBusy] = useState<number | null>(null);
  // PR whose in-app diff is expanded (one at a time keeps the page scannable).
  const [expanded, setExpanded] = useState<number | null>(null);

  async function act(kind: 'approve' | 'reject', prNumber: number): Promise<void> {
    setBusy(prNumber);
    try {
      if (kind === 'approve') await api.adminPromote(prNumber);
      else await api.adminReject(prNumber);
      toast.success(
        (kind === 'approve' ? t('queueApproved') : t('queueRejected')).replace(
          '{n}',
          String(prNumber),
        ),
      );
      api.invalidateAll();
      reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) return <Skeleton className='h-40 w-full' />;
  if (!isAdmin) {
    return <Banner variant='warning'>{t('queueAdminOnly')}</Banner>;
  }
  if (error !== null) return <LoadFailed message={error} />;

  return (
    <div className='space-y-4'>
      <div className='flex items-baseline justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>{t('queueTitle')}</h1>
          <p className='text-muted-foreground text-sm'>
            {data === null
              ? t('loading')
              : `${data.pulls.length} ${t('queueOpenPRs')}`}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='gap-1.5'
          onClick={() => {
            api.invalidateAll();
            reload();
          }}
          disabled={data === null}
        >
          <RefreshCw className='size-3.5' />
          {t('queueRefresh')}
        </Button>
      </div>

      {data === null
        ? <Skeleton className='h-64 w-full' />
        : data.pulls.length === 0
        ? (
          <div className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            {t('queueEmpty')}
          </div>
        )
        : (
          <ul className='divide-border divide-y rounded-md border'>
            {data.pulls.map((pr) => (
              <li key={pr.prNumber} className='flex flex-wrap items-center gap-2 px-4 py-3'>
                <div className='min-w-0 flex-1 basis-64'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='truncate text-sm font-medium'>{pr.title}</span>
                    {pr.labels
                      .filter((l) =>
                        l !== 'via-dashboard'
                      )
                      .map((l) => (
                        <Badge key={l} variant='outline' className='text-[10px]'>
                          {l}
                        </Badge>
                      ))}
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    #{pr.prNumber} · {contributorLabel(pr.contributor)} ·{' '}
                    {new Date(pr.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-1.5'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='gap-1'
                    onClick={() => setExpanded((e) => (e === pr.prNumber ? null : pr.prNumber))}
                    aria-expanded={expanded === pr.prNumber}
                  >
                    {expanded === pr.prNumber
                      ? <ChevronDown className='size-3.5' />
                      : <ChevronRight className='size-3.5' />}
                    {t('queueDetail')}
                  </Button>
                  <Button
                    render={
                      <a href={pr.htmlUrl} target='_blank' rel='noreferrer'>
                        <ExternalLink className='size-3.5' />
                        {t('queueReview')}
                      </a>
                    }
                    variant='ghost'
                    size='sm'
                    className='gap-1.5'
                  />
                  <Button
                    type='button'
                    variant='default'
                    size='sm'
                    className='gap-1.5'
                    disabled={busy !== null}
                    onClick={() => void act('approve', pr.prNumber)}
                  >
                    <Check className='size-3.5' />
                    {busy === pr.prNumber ? t('queueWorking') : t('queueApprove')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='text-destructive gap-1.5'
                    disabled={busy !== null}
                    onClick={() => void act('reject', pr.prNumber)}
                  >
                    <X className='size-3.5' />
                    {t('queueReject')}
                  </Button>
                </div>
                {expanded === pr.prNumber
                  ? (
                    <div className='basis-full'>
                      <PullDetailPanel prNumber={pr.prNumber} />
                    </div>
                  )
                  : null}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

/** Server-computed structured diff for one queue PR (W-B slice 2). */
function PullDetailPanel({ prNumber }: { readonly prNumber: number; }): JSX.Element {
  const t = useT();
  const { data, error } = useApiResource(() => api.adminPullDetail(prNumber), [prNumber]);
  if (error !== null) return <LoadFailed message={error} />;
  if (data === null) return <Skeleton className='mt-2 h-16 w-full' />;
  if (data.entities.length === 0 && data.translations.length === 0) {
    return <p className='text-muted-foreground mt-2 text-xs'>{t('queueDetailEmpty')}</p>;
  }
  return (
    <div className='mt-2 space-y-3 rounded-md border p-3 text-xs'>
      {data.entities.map((e) => (
        <div key={e.path} className='space-y-1.5'>
          <p className='font-mono text-[11px] font-medium'>
            {e.entityId ?? e.path}
            <Badge variant='outline' className='ml-2 text-[10px]'>{e.kind}</Badge>
          </p>
          {e.properties.map((f) => (
            <DiffRow key={f.id} label={f.id} before={f.before} after={f.after} />
          ))}
          {e.relations.map((r) => (
            <p key={r.type} className='text-muted-foreground'>
              <span className='text-foreground font-medium'>{r.type}</span>
              {r.added.length > 0
                ? <span className='text-emerald-600'>{' '}+ {r.added.join(', ')}</span>
                : null}
              {r.removed.length > 0
                ? <span className='text-destructive'>{' '}− {r.removed.join(', ')}</span>
                : null}
            </p>
          ))}
        </div>
      ))}
      {data.translations.map((tf) => (
        <div key={tf.path} className='space-y-1.5'>
          <p className='font-mono text-[11px] font-medium'>
            {t('queueDetailTranslations')} ({tf.locale})
          </p>
          {tf.changed.map((c) => (
            <DiffRow key={c.key} label={c.key} before={c.before} after={c.after} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DiffRow(
  { label, before, after }: {
    readonly label: string;
    readonly before: string | null;
    readonly after: string | null;
  },
): JSX.Element {
  return (
    <p className='break-all'>
      <span className='font-medium'>{label}</span>
      {': '}
      {before !== null
        ? <del className='text-destructive/80 no-underline line-through'>{before}</del>
        : null}
      {before !== null && after !== null ? ' → ' : null}
      {after !== null ? <ins className='text-emerald-600 no-underline'>{after}</ins> : null}
    </p>
  );
}
