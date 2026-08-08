/**
 * Shared rendering for the history pages (`/types/$type/$slug/history`
 * and the global `/history`): one commit's header row (message,
 * author, localized date, short-sha badge, external GitHub link) and
 * the semantic change groups — property/relation label, then removed
 * values in red (−) and added values in green (+). Lines arrive fully
 * resolved from the server (localized labels, vocabulary labels,
 * compact `C96` provenance, `Label : Valeur` qualifiers), never raw
 * JSON.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { JSX } from 'react';
import type { HistoryChangeGroup } from '../api';
import { useT } from '../form/locale';

/**
 * Localized commit date: relative ("2 days ago" / "il y a 2 jours")
 * within the last month, absolute (`Intl.DateTimeFormat`, medium
 * style) beyond that. Rows keep the raw ISO date in `title` so the
 * exact timestamp is always one hover away.
 */
export function formatCommitDate(iso: string, locale: 'en' | 'fr'): string {
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

export function firstLine(message: string): string {
  const nl = message.indexOf('\n');
  return nl < 0 ? message : message.slice(0, nl);
}

/** The fields both history endpoints share per commit row. */
export type CommitHeaderData = {
  readonly message: string;
  readonly authorName: string;
  readonly authorLogin?: string;
  readonly date: string;
  readonly shortSha: string;
  readonly htmlUrl: string;
};

/** One commit's header row — identical on both history pages. */
export function HistoryCommitHeader(
  { commit, locale }: {
    readonly commit: CommitHeaderData;
    readonly locale: 'en' | 'fr';
  },
): JSX.Element {
  const t = useT();
  return (
    <div className='flex items-start gap-3'>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>
          {firstLine(commit.message)}
        </p>
        <p className='text-muted-foreground mt-0.5 truncate text-xs'>
          <span
            {...(commit.authorLogin !== undefined
              ? { title: `@${commit.authorLogin}` }
              : {})}
          >
            {commit.authorName}
          </span>
          {' · '}
          <span title={commit.date}>{formatCommitDate(commit.date, locale)}</span>
        </p>
      </div>
      <Badge variant='secondary' className='shrink-0 font-mono text-xs'>
        {commit.shortSha}
      </Badge>
      <Button
        render={
          <a
            href={commit.htmlUrl}
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
  );
}

/**
 * Semantic change groups of one commit (for one entity), visible
 * without a click. Renders nothing when there is nothing to show.
 */
export function HistoryChangeGroups(
  { groups, truncated }: {
    readonly groups: readonly HistoryChangeGroup[];
    /** Change lines beyond the server's per-commit budget. */
    readonly truncated?: number;
  },
): JSX.Element | null {
  const t = useT();
  if (groups.length === 0 && (truncated ?? 0) === 0) return null;
  return (
    <div className='bg-muted/20 mt-2 space-y-2 rounded-md border px-2.5 py-2 text-xs'>
      {groups.map((group) => (
        <div key={group.label}>
          <p className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
            {group.label}
          </p>
          {group.removed.map((line, i) => (
            <p
              key={`r${i}`}
              className='flex items-baseline gap-1.5 text-red-600 dark:text-red-400'
            >
              <span aria-hidden className='shrink-0'>−</span>
              <span className='min-w-0 break-words'>{line}</span>
            </p>
          ))}
          {group.added.map((line, i) => (
            <p
              key={`a${i}`}
              className='flex items-baseline gap-1.5 text-emerald-600 dark:text-emerald-400'
            >
              <span aria-hidden className='shrink-0'>+</span>
              <span className='min-w-0 break-words'>{line}</span>
            </p>
          ))}
        </div>
      ))}
      {(truncated ?? 0) > 0
        ? (
          <p className='text-muted-foreground'>
            {t('historyDiffMore').replace('{n}', String(truncated))}
          </p>
        )
        : null}
    </div>
  );
}
