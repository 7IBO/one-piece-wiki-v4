/**
 * Shared rendering for the history pages (`/types/$type/$slug/history`
 * and the global `/history`): one commit's header row (message,
 * author, localized date, short-sha badge, external GitHub link) and
 * the semantic change groups — property/relation label, then removed
 * (−) and added (+) value lines. Quiet by default (2026-08 feedback):
 * the text stays in the normal foreground, only the −/+ sign carries a
 * muted red/emerald tint, and each line shows ONLY its compact
 * `value · since` text — the extra qualifiers (`Label : Valeur`)
 * arrive in a separate `details` field and unfold behind a per-line
 * "see more" toggle, nothing open by default. Lines arrive fully
 * resolved from the server (localized labels, vocabulary labels,
 * compact `C96` provenance), never raw JSON.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { type JSX, useState } from 'react';
import type { HistoryChangeGroup, HistoryChangeLine } from '../api';
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
 * One −/+ change line: the compact `value · since` text in the normal
 * foreground, the sign alone tinted (muted emerald/red). When the
 * server sent extra qualifiers in `details`, a discreet text-xs
 * "see more" toggle unfolds them under the line — closed by default.
 */
function ChangeLine(
  { line, kind }: {
    readonly line: HistoryChangeLine;
    readonly kind: 'added' | 'removed';
  },
): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className='flex items-baseline gap-1.5'>
      <span
        aria-hidden
        className={`shrink-0 font-medium ${
          kind === 'added'
            ? 'text-emerald-600/70 dark:text-emerald-400/70'
            : 'text-red-600/70 dark:text-red-400/70'
        }`}
      >
        {kind === 'added' ? '+' : '−'}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='flex flex-wrap items-baseline gap-x-1.5'>
          <span className='min-w-0 break-words'>{line.text}</span>
          {line.details !== undefined
            ? (
              <button
                type='button'
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className='text-muted-foreground hover:text-foreground shrink-0 text-[11px] underline-offset-2 hover:underline'
              >
                {open ? t('historySeeLess') : t('historySeeMore')}
              </button>
            )
            : null}
        </p>
        {open && line.details !== undefined
          ? <p className='text-muted-foreground break-words'>{line.details}</p>
          : null}
      </div>
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
          {group.removed.map((line, i) => <ChangeLine key={`r${i}`} line={line} kind='removed' />)}
          {group.added.map((line, i) => <ChangeLine key={`a${i}`} line={line} kind='added' />)}
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
