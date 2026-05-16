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
import { Trash2 } from 'lucide-react';
import { type JSX } from 'react';
import { useLocale, useT } from './form/locale';
import { clearAllDrafts, clearDraft, useAllDrafts } from './form/use-draft';

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

  if (drafts.length === 0) return null;

  // Sort newest first so the most-recently touched draft is up top —
  // that's the one the maintainer most likely wants to jump back to.
  const sorted = [...drafts].sort((a, b) => b.savedAt - a.savedAt);

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
        {drafts.length > 1
          ? (
            <div className='border-t px-3 py-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-7 w-full text-[11px]'
                onClick={() => {
                  void clearAllDrafts().then(refresh);
                }}
              >
                <Trash2 className='size-3.5' />
                {t('discard')} ({drafts.length})
              </Button>
            </div>
          )
          : null}
      </PopoverContent>
    </Popover>
  );
}
