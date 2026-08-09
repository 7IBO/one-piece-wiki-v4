/**
 * Entity edit page — the index route under `/types/$type/$slug`.
 *
 * This file holds the FULL editor (form + resume-PR banner +
 * apparitions/cast entry-points). The sibling `types.$type.$slug.tsx`
 * is the layout that renders `<Outlet />` so nested routes like
 * `/types/$type/$slug/apparitions` can mount underneath. Without
 * this split, TanStack falls back to matching the parent path and
 * every sub-route shows the edit page (the bug that motivated the
 * split — see commit history).
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveDisplayName } from '@onepiece-wiki/schemas';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, Film, GitPullRequest, History, Users } from 'lucide-react';
import { type JSX, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type SourceRef } from '../api';
import { IncomingEdgesManager } from '../components/IncomingEdgesManager';
import { LoadFailed } from '../components/LoadFailed';
import { NarrativeEditor } from '../components/NarrativeEditor';
import { EntityForm } from '../form/EntityForm';
import { useLocale, useT } from '../form/locale';
import { InferredRelations } from '../form/RelationsEditor';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/types/$type/$slug/')({
  // `?edit=<propertyId>.<entryIndex>` mirrors the open entry editor
  // so the browser Back button CLOSES the editor instead of leaving
  // the entity page (maintainer request 2026-08).
  validateSearch: (search: Record<string, unknown>): { edit?: string; } => {
    const edit = search['edit'];
    return typeof edit === 'string' && edit !== '' ? { edit } : {};
  },
  component: EntityEditComponent,
});

// Stable fallbacks while the page resource is loading — module-level so
// their identity doesn't churn re-renders.
const emptySources: readonly SourceRef[] = [];
const emptyKeys: readonly string[] = [];

function EntityEditComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const t = useT();
  const navigate = useNavigate();
  // ADR-097 — which incoming-edge relation group is being managed
  // (null = read-only). Owned here so the URL-navigating cast case
  // and the inline manager share one entry point.
  const [managingIncoming, setManagingIncoming] = useState<string | null>(null);
  const { data, error, reload } = useApiResource(
    () =>
      Promise.all([
        api.getEntity(type, slug),
        api.schemas(),
        api.sources(),
        api.i18nKeys(),
      ]),
    [type, slug],
  );
  const entity = data?.[0] ?? null;
  const schemas = data?.[1] ?? null;
  const sources = data?.[2] ?? emptySources;
  const i18nKeys = data?.[3] ?? emptyKeys;

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

  const entityTypeLabel = useMemo(() => {
    if (schemas === null) return type;
    const et = schemas.entityTypes[type];
    return et?.labels[locale] ?? et?.labels.en ?? type;
  }, [schemas, type, locale]);

  if (error !== null) {
    return <LoadFailed message={error} onRetry={reload} />;
  }
  if (entity === null || schemas === null) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  const entityType = schemas.entityTypes[type];
  if (entityType === undefined) {
    return <p className='text-destructive'>No entity-type schema for {type}.</p>;
  }

  // Apparitions hub (ADR-021) hooks. Derived from the schema rather
  // than hard-coded so a future relation-schema change doesn't need
  // a UI patch.
  //  - SOURCE TYPES (anything listed in `appears-in.valid_to_types`)
  //    get a "Manage cast" button — they're the destination of
  //    apparitions, never the origin.
  //  - APPARITION-CAPABLE TYPES (`valid_from_types`) get an
  //    "Apparitions" link to their per-entity timeline sub-page.
  const appearsIn = schemas.relationTypes['appears-in'];
  // `valid_*_types` is typed as branded `Slug[]`; widen to plain
  // `string[]` for the `.includes(type)` check.
  const validTo = (appearsIn?.valid_to_types ?? []) as readonly string[];
  const validFrom = (appearsIn?.valid_from_types ?? []) as readonly string[];
  const isSourceType = validTo.includes(type);
  const canHaveApparitions = validFrom.includes(type);

  // ADR-097 — relations whose incoming manager is the existing
  // /sources cast page (ADR-021): `appears-in` when this page IS a
  // source. Everything else opens the generic incoming-edge manager.
  // (`appears-in` is a ADR-021/091-sanctioned well-known id on this
  // page — see the hub wiring above; the manager itself stays 100%
  // schema-driven.)
  const castRelationIds: readonly string[] = isSourceType && appearsIn !== undefined
    ? [String(appearsIn.id)]
    : [];

  const openIncomingManager = (relationTypeId: string): void => {
    if (castRelationIds.includes(relationTypeId)) {
      void navigate({ to: '/sources/$type/$slug', params: { type, slug } });
      return;
    }
    setManagingIncoming(relationTypeId);
    document
      .getElementById('inferred-relations-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-1.5 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {entityTypeLabel}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
          {displayName !== null
            ? (
              <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight'>
                {displayName}
              </h1>
            )
            : (
              <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight font-mono text-muted-foreground'>
                {entity.id}
              </h1>
            )}
          {
            /* id + history live on the SAME line: below sm they wrap
              to their own row (basis-full) with the history affordance
              pushed to the right edge; at sm+ the row sits after the
              flex-1 title, i.e. at the page's right edge. */
          }
          <div className='flex min-w-0 max-w-full basis-full items-center gap-2 sm:basis-auto'>
            {displayName !== null
              ? (
                <span className='text-muted-foreground min-w-0 truncate font-mono text-[10px]'>
                  {entity.id}
                </span>
              )
              : null}
            {entity.sha !== null
              ? (
                <Button
                  render={
                    <Link
                      to='/types/$type/$slug/history'
                      params={{ type, slug }}
                    />
                  }
                  variant='ghost'
                  size='xs'
                  className='text-muted-foreground hover:text-foreground ml-auto shrink-0 gap-1 text-xs no-underline'
                >
                  <History className='size-3' />
                  {t('history')}
                  <span className='font-mono'>· {entity.sha.slice(0, 7)}</span>
                </Button>
              )
              : (
                <Badge
                  variant='outline'
                  className='text-amber-500 ml-auto w-fit shrink-0 text-[10px]'
                >
                  {t('notOnGithubYet')}
                </Badge>
              )}
          </div>
        </div>
        {
          /* Apparitions hub entry-points (ADR-021). Mutually
            exclusive: a type is either a source destination or a
            potential apparition origin, never both. */
        }
        {isSourceType
          ? (
            <div className='mt-2'>
              <Button
                render={
                  <Link
                    to='/sources/$type/$slug'
                    params={{ type, slug }}
                  />
                }
                variant='outline'
                size='sm'
                className='gap-1.5'
              >
                <Users className='size-3.5' />
                {t('castManage')}
              </Button>
            </div>
          )
          : canHaveApparitions
          ? (
            <div className='mt-2'>
              <Button
                render={
                  <Link
                    to='/types/$type/$slug/apparitions'
                    params={{ type, slug }}
                  />
                }
                variant='outline'
                size='sm'
                className='gap-1.5'
              >
                <Film className='size-3.5' />
                {t('apparitionsButton')}
              </Button>
            </div>
          )
          : null}
      </div>
      {entity.resumePR !== undefined
        ? (
          <Banner variant='info'>
            <GitPullRequest className='text-primary size-4 shrink-0' />
            <span>
              {t('resumePRBanner').replace('{n}', String(entity.resumePR.number))}
            </span>
            <a
              href={entity.resumePR.htmlUrl}
              target='_blank'
              rel='noreferrer'
              className='text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11px]'
              title={t('contributionsOpenPr')}
            >
              PR #{entity.resumePR.number}
              <ExternalLink className='size-3' />
            </a>
          </Banner>
        )
        : null}
      <EntityForm
        entityId={entity.id}
        entityType={entityType}
        entityTypes={schemas.entityTypes}
        propertyTypes={schemas.propertyTypes}
        relationTypes={schemas.relationTypes}
        vocabularies={schemas.vocabularies}
        qualifierTypes={schemas.qualifierTypes}
        rules={schemas.rules}
        sources={sources}
        i18nKeys={i18nKeys}
        initialData={entity.data}
        initialTranslations={entity.translations}
        syncEditorToUrl
        onSave={async (next, translations) => {
          const result = await api.saveEntity(
            type,
            slug,
            next,
            entity.sha,
            translations,
          );
          if (result.pr.noOp) {
            // Resolved content matched on disk — server didn't open
            // a PR / didn't push a commit. Without this branch the
            // toast would say "PR #0 opened" which is misleading.
            toast.info(t('toastNoOp'));
            return;
          }
          // Different copy for the resume path so the contributor
          // knows the commit went onto their existing PR — important
          // because the PR number is unchanged from before, which
          // would otherwise look like the save failed to do anything.
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
        }}
      />
      {
        /* Narrative (prose Markdown per locale) — below the form,
        above the inverse-relations section. Collapsed by default. */
      }
      <NarrativeEditor type={type} slug={slug} />
      {
        /* Incoming edges (inverse relations) — the ONLY link surface
        besides the relations editor inside the form: same row design,
        read-only detail, coherence banners, ADR-097 manage entry. */
      }
      <InferredRelations
        entityType={type}
        entitySlug={slug}
        relationTypes={schemas.relationTypes}
        qualifierTypes={schemas.qualifierTypes}
        vocabularies={schemas.vocabularies}
        sources={sources}
        manage={{
          managing: managingIncoming,
          onManage: (relationTypeId) => {
            if (relationTypeId === null) setManagingIncoming(null);
            else openIncomingManager(relationTypeId);
          },
          castRelationIds,
          renderManager: (relationTypeId, onClose) => (
            <IncomingEdgesManager
              type={type}
              slug={slug}
              relationTypeId={relationTypeId}
              relationTypes={schemas.relationTypes}
              qualifierTypes={schemas.qualifierTypes}
              vocabularies={schemas.vocabularies}
              entityTypes={schemas.entityTypes}
              sources={sources}
              i18nKeys={i18nKeys}
              onClose={onClose}
            />
          ),
        }}
      />
    </div>
  );
}
