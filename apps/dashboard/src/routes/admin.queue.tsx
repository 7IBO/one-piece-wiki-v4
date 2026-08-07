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
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';
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
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
