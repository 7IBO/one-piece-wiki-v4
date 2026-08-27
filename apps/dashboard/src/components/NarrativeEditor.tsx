/**
 * Narrative editor — per-entity prose Markdown, one file per locale
 * (`data/universes/<u>/narratives/<locale>/<type>/<fileBase>.md`,
 * see /docs/DATA_MODEL.md § Narratives). Rendered on the entity page
 * below the form, collapsed by default ("par défaut, rien d'ouvert").
 *
 * Two locale tabs (EN/FR) over a plain Markdown textarea with a
 * discreet word counter and a "keep it concise" hint — narratives are
 * deliberately much lighter than a Fandom article. Saving POSTs only
 * the touched locales to `/api/entities/:type/:slug/narrative`, which
 * opens (or resumes) a PR through the same flow as entity saves;
 * clearing a language deletes its file in the PR. Read-only until the
 * visitor signs in (same gating pattern as the entity form).
 *
 * No business logic here: validation, normalization and the PR
 * mechanics live server-side (server/narrative.ts + github-client).
 */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronDown } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type NarrativeContent, type NarrativeSaveBody } from '../api';
import { useCurrentUser } from '../auth';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';
import { LoadFailed } from './LoadFailed';

type Props = {
  readonly type: string;
  readonly slug: string;
};

const NARRATIVE_LOCALES = ['en', 'fr'] as const;
type NarrativeLocale = typeof NARRATIVE_LOCALES[number];

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

export function NarrativeEditor({ type, slug }: Props): ReactElement {
  const t = useT();
  const uiLocale = useLocale();
  const { user, loaded: userLoaded } = useCurrentUser();
  // Collapsed by default everywhere — same maintainer decision as the
  // links panel ("par défaut, rien d'ouvert", 2026-08-08).
  const [open, setOpen] = useState(false);
  // Active tab starts on the chrome locale — the language the
  // contributor is most likely to write in.
  const [tab, setTab] = useState<NarrativeLocale>(uiLocale);
  const [drafts, setDrafts] = useState<Record<NarrativeLocale, string>>({ en: '', fr: '' });
  const [baseline, setBaseline] = useState<Record<NarrativeLocale, string>>({ en: '', fr: '' });
  const [saving, setSaving] = useState(false);

  const { data, error, reload } = useApiResource(
    () => api.getNarrative(type, slug),
    [type, slug],
  );

  // Seed drafts + baseline once per fetched payload (also after a
  // reload — the server's normalized text becomes the new baseline).
  useEffect(() => {
    if (data === null) return;
    const next = fromContent(data);
    setDrafts(next);
    setBaseline(next);
  }, [data]);

  const readOnly = userLoaded && user === null;
  const dirtyLocales = NARRATIVE_LOCALES.filter((l) => drafts[l] !== baseline[l]);
  const dirty = dirtyLocales.length > 0;
  const words = wordCount(drafts[tab]);
  const hasAny = data !== null && (data.en !== null || data.fr !== null);

  async function handleSave(): Promise<void> {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const body: { en?: string; fr?: string; } = {};
      for (const locale of dirtyLocales) body[locale] = drafts[locale];
      const result = await api.saveNarrative(type, slug, body as NarrativeSaveBody);
      if (result.pr.noOp) {
        toast.info(t('toastNoOp'));
      } else {
        const title = result.pr.reused
          ? t('toastCommitAdded').replace('{n}', String(result.pr.number))
          : t('toastPrOpened').replace('{n}', String(result.pr.number));
        toast.success(title, {
          description: result.pr.htmlUrl,
          action: {
            label: t('contributionsOpenPr'),
            onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
          },
        });
      }
      // What was sent is now in the PR — treat it as the new baseline
      // so the editor stops reading as dirty.
      setBaseline({ ...drafts });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card bleed size='sm' className='gap-0 py-0'>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className='flex w-full items-center gap-2 px-3 py-3 text-left'>
          <BookOpen className='text-muted-foreground size-3.5 shrink-0' />
          <span className='text-sm font-medium'>{t('narrativeTitle')}</span>
          {data !== null && !hasAny
            ? <span className='text-muted-foreground text-xs'>{t('narrativeNone')}</span>
            : null}
          <ChevronDown
            className={cn(
              'text-muted-foreground ml-auto size-4 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='border-border border-t'>
          {error !== null
            ? (
              <div className='p-3'>
                <LoadFailed message={error} onRetry={reload} />
              </div>
            )
            : data === null
            ? (
              <div className='space-y-2 p-3'>
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-24 w-full' />
              </div>
            )
            : (
              <div className='space-y-2 p-3'>
                <div className='flex items-center gap-1'>
                  {NARRATIVE_LOCALES.map((locale) => (
                    <Button
                      key={locale}
                      type='button'
                      variant={tab === locale ? 'secondary' : 'ghost'}
                      size='xs'
                      aria-pressed={tab === locale}
                      className='px-2 font-mono text-[11px] uppercase'
                      onClick={() => setTab(locale)}
                    >
                      {locale}
                      {drafts[locale] !== baseline[locale]
                        ? <span aria-hidden className='text-amber-500'>•</span>
                        : null}
                    </Button>
                  ))}
                  <span className='text-muted-foreground ml-auto text-[11px]'>
                    {t('narrativeWords').replace('{n}', String(words))}
                  </span>
                </div>
                <Textarea
                  aria-label={`${t('narrativeTitle')} (${tab.toUpperCase()})`}
                  className='min-h-40 font-mono text-xs leading-relaxed'
                  placeholder={t('narrativePlaceholder')}
                  value={drafts[tab]}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDrafts((prev) => ({ ...prev, [tab]: value }));
                  }}
                />
                <p className='text-muted-foreground text-[11px]'>
                  {t('narrativeHint')} {t('narrativeEmptyDeletes')}
                </p>
                <div className='flex items-center justify-end gap-2'>
                  {readOnly
                    ? (
                      <a
                        href='/login'
                        className='text-muted-foreground hover:text-foreground text-[11px] whitespace-nowrap underline-offset-2 hover:underline'
                        title={t('signInToSave')}
                      >
                        {t('signInToSave')}
                      </a>
                    )
                    : null}
                  <Button
                    type='button'
                    size='sm'
                    disabled={saving || !dirty || readOnly}
                    onClick={() => void handleSave()}
                  >
                    {saving ? t('narrativeSaving') : t('narrativeSave')}
                  </Button>
                </div>
              </div>
            )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function fromContent(content: NarrativeContent): Record<NarrativeLocale, string> {
  return { en: content.en ?? '', fr: content.fr ?? '' };
}
