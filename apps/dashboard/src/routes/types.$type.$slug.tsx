import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type EntityDetail, type SchemaCatalogue, type SourceRef } from '../api.ts';
import { EntityForm } from '../form/EntityForm.tsx';

export const Route = createFileRoute('/types/$type/$slug')({
  component: EntityEditComponent,
});

function EntityEditComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
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
    <div className='space-y-6'>
      <div>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='-ml-2 h-7 px-2'
        >
          <ChevronLeft className='size-4' />
          {type}
        </Button>
        <div className='mt-2 flex items-baseline gap-3'>
          <h1 className='font-mono text-2xl font-semibold tracking-tight'>{entity.id}</h1>
          {entity.sha !== null
            ? (
              <Badge variant='secondary' className='font-mono text-xs'>
                {entity.sha.slice(0, 7)}
              </Badge>
            )
            : (
              <Badge variant='outline' className='text-amber-500'>
                not on GitHub yet
              </Badge>
            )}
        </div>
        <p className='text-muted-foreground mt-1 text-sm'>
          slug=<code className='font-mono'>{entity.slug}</code>
        </p>
      </div>
      <EntityForm
        entityType={entityType}
        propertyTypes={schemas.propertyTypes}
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
