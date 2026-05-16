/**
 * Top-bar surface for "you have unsaved drafts somewhere".
 *
 * The dashboard persists every in-progress edit to IndexedDB (see
 * `use-draft.ts`), so a maintainer can navigate between entities,
 * close the tab, come back the next day — and their work is still
 * there. This indicator gives that durability a visible handle:
 * a small amber dot + count in the header, with a popover listing
 * every draft and a per-row "open" / "discard" action plus a
 * "discard all" footer.
 *
 * Live-updates via the BroadcastChannel `notifyDraftChange` fires
 * after every writeDraft/clearDraft, so editing an entity in one
 * tab refreshes the badge in another instantly.
 */
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@tanstack/react-router';
import { Trash2, Upload } from 'lucide-react';
import { type JSX, useState } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { useCurrentUser } from './auth';
import { useLocale, useT } from './form/locale';
import { clearAllDrafts, clearDraft, readDraft, useAllDrafts } from './form/use-draft';

function relativeTime(savedAt: number, locale: 'en' | 'fr'): string {
  const diff = Date.now() - savedAt;
  const min = Math.round(diff / 60_000);
  if (min < 1) return locale === 'fr' ? 'à l’instant' : 'just now';
  if (min < 60) return locale === 'fr' ? `il y a ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return locale === 'fr' ? `il y a ${hr} h` : `${hr} h ago`;
  return new Date(savedAt).toLocaleDateString(locale);
}

export function DraftsIndicator(): JSX.Element | null {
  const { drafts, refresh } = useAllDrafts();
  const locale = useLocale();
  const t = useT();
  const { user, loaded: userLoaded } = useCurrentUser();
  const [saving, setSaving] = useState<{ done: number; total: number; } | null>(null);

  if (drafts.length === 0) return null;

  // Sort newest first so the most-recently touched draft is up top —
  // that's the one the maintainer most likely wants to jump back to.
  const sorted = [...drafts].sort((a, b) => b.savedAt - a.savedAt);

  /**
   * Walk every persisted draft and open one PR per entity. Each save
   * is its own PR (per ADR-016 / ADR-017 — the "one PR per entity"
   * model isn't changing here; this just removes the friction of
   * having to navigate to each entity individually).
   *
   * Intentionally sequential: parallel `api.saveEntity` calls would
   * race on GitHub's rate limits + produce conflicts when overlapping
   * translation files land. The progress counter in the button label
   * gives feedback so the maintainer doesn't think the UI froze.
   */
  async function saveAll(): Promise<void> {
    if (!userLoaded || user === null) {
      toast.error(t('signInToSave'));
      return;
    }
    if (drafts.length === 0) return;
    setSaving({ done: 0, total: drafts.length });
    let opened = 0;
    const failures: { id: string; message: string; }[] = [];
    for (const summary of drafts) {
      const id = summary.entityId;
      const [type, slug] = id.split(':');
      if (type === undefined || slug === undefined) {
        failures.push({ id, message: 'unparseable id' });
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const [entity, draft] = await Promise.all([
          api.getEntity(type, slug),
          readDraft(id),
        ]);
        if (draft === null) {
          // Stale entry (likely TTL-swept between badge render and
          // click). Skip silently — `refresh()` at the end picks it up.
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await api.saveEntity(type, slug, draft.data, entity.sha, draft.translations);
        // eslint-disable-next-line no-await-in-loop
        await clearDraft(id);
        opened += 1;
      } catch (err) {
        failures.push({
          id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setSaving((s) => s === null ? null : { done: s.done + 1, total: s.total });
    }
    setSaving(null);
    refresh();
    if (failures.length === 0) {
      toast.success(`${opened} ${t('bulkSaveDone')}`);
      return;
    }
    const first = failures[0]!;
    const hint = /401|unauthorized|sign in/i.test(first.message)
      ? ` — ${t('signInToSave')}`
      : /503|app not/i.test(first.message)
      ? ' — GitHub App not installed on the data repo'
      : '';
    toast.error(`${failures.length} ${t('bulkSaveFailed')} (${opened} ok)`, {
      description: `${first.id}: ${first.message}${hint}${
        failures.length > 1 ? ` (+${failures.length - 1} more — see console)` : ''
      }`,
      duration: 10_000,
    });
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`[drafts save-all] ${f.id} failed:`, f.message);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1.5 border-amber-500/40 px-2 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500'
            aria-label={t('unsavedChanges')}
          />
        }
      >
        <span className='inline-block size-1.5 rounded-full bg-amber-500' />
        <span className='font-mono tabular-nums text-[11px]'>
          {drafts.length}
        </span>
        <span className='hidden text-[11px] sm:inline'>
          {t('unsavedChanges')}
        </span>
      </PopoverTrigger>
      <PopoverContent align='end' side='bottom' className='w-80 max-h-[60vh] overflow-y-auto p-0'>
        <div className='border-b px-3 py-2'>
          <p className='text-[11px] font-semibold uppercase tracking-wide'>
            {t('unsavedChanges')} · {drafts.length}
          </p>
        </div>
        <ul className='divide-border divide-y'>
          {sorted.map((d) => {
            const [type, slug] = d.entityId.split(':');
            const canLink = type !== undefined && slug !== undefined && type !== '' && slug !== '';
            return (
              <li key={d.entityId} className='flex items-center gap-2 px-3 py-2'>
                <div className='min-w-0 flex-1'>
                  {canLink
                    ? (
                      <Link
                        to='/types/$type/$slug'
                        params={{ type, slug }}
                        className='hover:underline block truncate text-xs font-medium'
                      >
                        {d.entityId}
                      </Link>
                    )
                    : <span className='block truncate font-mono text-xs'>{d.entityId}</span>}
                  <p className='text-muted-foreground text-[10px]'>
                    {relativeTime(d.savedAt, locale)}
                  </p>
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7 text-muted-foreground hover:text-destructive'
                  aria-label={t('discard')}
                  title={t('discard')}
                  onClick={() => {
                    void clearDraft(d.entityId).then(refresh);
                  }}
                >
                  <Trash2 className='size-3.5' />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className='border-t flex flex-col gap-1.5 px-3 py-2'>
          {
            /* Primary action: save every draft as a PR. One PR per
              entity (the "batch into one PR" path is still a follow-up
              — see ADR-016 deferred section); this just removes the
              friction of having to visit each entity manually. */
          }
          <Button
            size='sm'
            className='h-7 w-full text-[11px]'
            disabled={saving !== null || (userLoaded && user === null)}
            onClick={() => {
              void saveAll();
            }}
            title={userLoaded && user === null ? t('signInToSave') : t('bulkSaveAll')}
          >
            <Upload className='size-3.5' />
            {saving !== null
              ? `${t('bulkSavingProgress')} ${saving.done}/${saving.total}`
              : `${t('bulkSaveAll')} (${drafts.length})`}
          </Button>
          {drafts.length > 1
            ? (
              <Button
                variant='outline'
                size='sm'
                className='h-7 w-full text-[11px]'
                disabled={saving !== null}
                onClick={() => {
                  void clearAllDrafts().then(refresh);
                }}
              >
                <Trash2 className='size-3.5' />
                {t('discard')} ({drafts.length})
              </Button>
            )
            : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
