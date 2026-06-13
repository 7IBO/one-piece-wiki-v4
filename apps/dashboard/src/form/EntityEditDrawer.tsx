/**
 * Side drawer that loads any entity by (type, slug) and renders the
 * full EntityForm inside it. Used to edit a linked entity in place
 * without leaving the page of the entity you came from — e.g. on
 * Luffy's page you pick a `member-of` relation pointing to
 * `crew:straw-hat-pirates`, see the crew's data is incomplete, click
 * the "Edit" affordance next to the picker, and complete the crew
 * here without navigating away.
 *
 * Save inside the drawer opens its own PR (via the same `api.saveEntity`
 * flow as the full-page editor). Multiple PRs from the same editing
 * session are fine — each is a separate review unit, and a maintainer
 * with auto-merge privileges will see them all land in seconds.
 *
 * Implementation: plain controlled portal (not Base UI's Dialog). The
 * Dialog primitive added focus-trap + scroll-lock side effects that
 * caused the page behind to shift on open, the open animation to
 * stutter, and intermittent click-through bugs as Base UI's portal
 * layer fought with our other portaled UIs (QualifierSheet,
 * Popovers). The portal-with-controlled-state pattern matches
 * QualifierSheet and stays predictable.
 */
import { Button } from '@/components/ui/button';
import { resolveDisplayName } from '@onepiece-wiki/schemas';
import { ExternalLink, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api, type EntityDetail, type SchemaCatalogue, type SourceRef } from '../api';
import { EntityForm } from './EntityForm';
import { useLocale, useT } from './locale';

export type EntityEditDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: string;
  slug: string;
};

type FormStatus = { dirty: boolean; saving: boolean; error: string | null; };

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p)
    .join(' ');
}

export function EntityEditDrawer(p: EntityEditDrawerProps): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [sources, setSources] = useState<readonly SourceRef[]>([]);
  const [i18nKeys, setI18nKeys] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<FormStatus>({
    dirty: false,
    saving: false,
    error: null,
  });
  const [saveTrigger, setSaveTrigger] = useState(0);

  // Only fetch when the drawer is open. Cached API calls (schemas,
  // sources, i18nKeys) come back instantly after the first visit.
  useEffect(() => {
    if (!p.open) return;
    let cancelled = false;
    setEntity(null);
    setError(null);
    Promise.all([
      api.getEntity(p.type, p.slug),
      api.schemas(),
      api.sources(),
      api.i18nKeys(),
    ])
      .then(([e, s, src, keys]) => {
        if (cancelled) return;
        setEntity(e);
        setSchemas(s);
        setSources(src);
        setI18nKeys(keys);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [p.open, p.type, p.slug]);

  const entityType = useMemo(() => {
    if (schemas === null) return undefined;
    return schemas.entityTypes[p.type];
  }, [schemas, p.type]);

  const headerLabel = entity === null
    ? ''
    : resolveDisplayName(entity.data, entity.translations, locale) ?? prettifySlug(entity.slug);
  const typeLabel = useMemo(() => {
    if (schemas === null) return p.type;
    const et = schemas.entityTypes[p.type];
    return et?.labels[locale] ?? et?.labels.en ?? p.type;
  }, [schemas, locale, p.type]);

  // ESC closes the drawer — match QualifierSheet behaviour. Guard
  // when not open so each mounted drawer doesn't keep a global
  // listener idle.
  useEffect(() => {
    if (!p.open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') p.onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.open, p.onOpenChange]);

  if (typeof document === 'undefined') return <></>;

  return createPortal(
    <>
      {
        /* Translucent backdrop — modal-ish, but no body scroll-lock,
          so the form behind doesn't shift right when the drawer
          opens. Click dismisses (with an unsaved-changes guard). */
      }
      {p.open
        ? (
          <div
            className='fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]'
            onClick={() => {
              if (status.dirty && !globalThis.confirm(t('unsavedChanges'))) return;
              p.onOpenChange(false);
            }}
          />
        )
        : null}
      <div
        role='dialog'
        aria-label={`${t('editingType')} ${typeLabel}`}
        className={`bg-background text-foreground fixed inset-y-0 right-0 z-50 flex w-full max-w-[64rem] flex-col border-l shadow-xl outline-none transition-transform duration-150 ease-out ${
          p.open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        // GPU-promoted layer keeps the wide panel's shadow + slide
        // off the main thread; without this, scrolling a long form
        // inside the drawer stutters on mid-range hardware.
        style={{ willChange: 'transform' }}
      >
        {/* Header */}
        <div className='border-border flex shrink-0 items-baseline gap-3 border-b px-5 py-3'>
          <div className='min-w-0 flex-1'>
            <p className='text-muted-foreground text-[10px] uppercase tracking-wide'>
              {t('editingType')} {typeLabel}
            </p>
            <h2 className='text-base font-semibold truncate'>
              {headerLabel || `${p.type}:${p.slug}`}
            </h2>
          </div>
          <a
            href={`/types/${p.type}/${p.slug}`}
            target='_blank'
            rel='noreferrer'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'
            title={t('fullPage')}
          >
            <ExternalLink className='size-3.5' />
            {t('fullPage')}
          </a>
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('close')}
            onClick={() => p.onOpenChange(false)}
          >
            <X className='size-4' />
          </Button>
        </div>

        {/* Body — scrollable */}
        <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>
          {error !== null
            ? <p className='text-destructive text-sm'>Failed: {error}</p>
            : entity === null || schemas === null
            ? (
              <div className='text-muted-foreground py-12 text-center text-sm'>
                {t('loading')}
              </div>
            )
            : entityType === undefined
            ? <p className='text-destructive text-sm'>No schema for {p.type}.</p>
            : (
              <EntityForm
                entityId={entity.id}
                entityType={entityType}
                entityTypes={schemas.entityTypes}
                propertyTypes={schemas.propertyTypes}
                relationTypes={schemas.relationTypes}
                vocabularies={schemas.vocabularies}
                sources={sources}
                i18nKeys={i18nKeys}
                initialData={entity.data}
                initialTranslations={entity.translations}
                hideSaveBar
                saveTrigger={saveTrigger}
                onStatus={setStatus}
                onSave={async (next, translations) => {
                  const result = await api.saveEntity(
                    p.type,
                    p.slug,
                    next,
                    entity.sha,
                    translations,
                  );
                  if (result.pr.noOp) {
                    toast.info(t('toastNoOp'));
                    p.onOpenChange(false);
                    return;
                  }
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
                  // Close once GitHub has accepted the edit.
                  p.onOpenChange(false);
                }}
              />
            )}
        </div>

        {/* Footer */}
        <div className='border-border bg-card flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3'>
          <span className='text-muted-foreground text-xs'>
            {status.saving
              ? t('openingPr')
              : status.dirty
              ? <span className='text-amber-500'>● {t('unsavedChanges')}</span>
              : t('noChanges')}
            {status.error !== null
              ? <span className='text-destructive ml-2'>{status.error}</span>
              : null}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                if (status.dirty && !globalThis.confirm(t('unsavedChanges'))) return;
                p.onOpenChange(false);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={!status.dirty || status.saving}
              onClick={() => setSaveTrigger((n) => n + 1)}
            >
              {status.saving ? t('saving') : t('saveAndOpenPr')}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
