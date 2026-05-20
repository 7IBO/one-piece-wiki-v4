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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, Film, GitPullRequest, Users } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type EntityDetail, type SchemaCatalogue, type SourceRef } from '../api';
import { EntityForm } from '../form/EntityForm';
import { useLocale, useT } from '../form/locale';

export const Route = createFileRoute('/types/$type/$slug/')({
  component: EntityEditComponent,
});

/**
 * Resolve the entity's display name from its translations. Looks at
 * the latest `name` (or `title_key`) entry's `value_key`, then resolves
 * it against the loaded translations. Returns null when no real
 * translated name exists — the header renders the entity id in that
 * case rather than fabricating a name out of the URL slug.
 */
function resolveDisplayName(entity: EntityDetail, locale: 'en' | 'fr'): string | null {
  const props = entity.data['properties'];
  if (props !== null && typeof props === 'object') {
    for (const candidate of ['name', 'title_key'] as const) {
      const raw = (props as Record<string, unknown>)[candidate];
      if (raw === null || raw === undefined) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e !== null && typeof e === 'object') {
          const k = (e as Record<string, unknown>)['value_key']
            ?? (e as Record<string, unknown>)['value'];
          if (typeof k === 'string') {
            const translated = entity.translations[locale][k]
              ?? entity.translations.en[k];
            if (translated !== undefined && translated.length > 0) return translated;
          }
        }
      }
    }
  }
  return null;
}

function EntityEditComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const t = useT();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [sources, setSources] = useState<readonly SourceRef[]>([]);
  const [i18nKeys, setI18nKeys] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getEntity(type, slug),
      api.schemas(),
      api.sources(),
      api.i18nKeys(),
    ])
      .then(([e, s, src, keys]) => {
        setEntity(e);
        setSchemas(s);
        setSources(src);
        setI18nKeys(keys);
      })
      .catch((e: unknown) => {
        // Mirror to console so the full stack stays readable after
        // the user navigates away — the inline `<p>Failed: …</p>`
        // disappears on the next route change and the message is
        // lost otherwise.
        // eslint-disable-next-line no-console
        console.error(`[entity:${type}/${slug}] load failed`, e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [type, slug]);

  const displayName = useMemo(
    () => entity === null ? null : resolveDisplayName(entity, locale),
    [entity, locale],
  );

  const entityTypeLabel = useMemo(() => {
    if (schemas === null) return type;
    const et = schemas.entityTypes[type];
    return et?.labels[locale] ?? et?.labels.en ?? type;
  }, [schemas, type, locale]);

  if (error !== null) {
    return <p className='text-destructive'>Failed: {error}</p>;
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
              <>
                <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight'>
                  {displayName}
                </h1>
                <span className='text-muted-foreground min-w-0 max-w-full truncate font-mono text-[10px] basis-full sm:basis-auto'>
                  {entity.id}
                </span>
              </>
            )
            : (
              <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight font-mono text-muted-foreground'>
                {entity.id}
              </h1>
            )}
          {entity.sha !== null
            ? (
              <Badge
                variant='secondary'
                className='ml-auto w-fit shrink-0 font-mono text-[10px]'
              >
                {entity.sha.slice(0, 7)}
              </Badge>
            )
            : (
              <Badge
                variant='outline'
                className='text-amber-500 ml-auto w-fit shrink-0 text-[10px]'
              >
                not on GitHub yet
              </Badge>
            )}
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
          <div className='border-primary/40 bg-primary/5 flex flex-wrap items-center gap-2 rounded-[3px] border px-3 py-2 text-xs'>
            <GitPullRequest className='text-primary size-4 shrink-0' />
            <span className='text-foreground'>
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
          </div>
        )
        : null}
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
    </div>
  );
}
