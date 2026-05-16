import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type EntityDetail, type SchemaCatalogue, type SourceRef } from '../api';
import { EntityForm } from '../form/EntityForm';
import { useLocale } from '../form/locale';

export const Route = createFileRoute('/types/$type/$slug')({
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
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

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {entityTypeLabel}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          {displayName !== null
            ? (
              <>
                <h1 className='text-xl font-semibold tracking-tight'>{displayName}</h1>
                <span className='text-muted-foreground font-mono text-[10px]'>
                  {entity.id}
                </span>
              </>
            )
            : (
              <h1 className='text-xl font-semibold tracking-tight font-mono text-muted-foreground'>
                {entity.id}
              </h1>
            )}
          {entity.sha !== null
            ? (
              <Badge variant='secondary' className='ml-auto font-mono text-[10px]'>
                {entity.sha.slice(0, 7)}
              </Badge>
            )
            : (
              <Badge variant='outline' className='text-amber-500 ml-auto text-[10px]'>
                not on GitHub yet
              </Badge>
            )}
        </div>
      </div>
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
          const result = await api.saveEntity(type, slug, next, entity.sha, translations);
          toast.success(`PR #${result.pr.number} opened`, {
            description: result.pr.htmlUrl,
            action: {
              label: 'Open PR',
              onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
            },
          });
        }}
      />
    </div>
  );
}
