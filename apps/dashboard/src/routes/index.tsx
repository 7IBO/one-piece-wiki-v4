import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type SchemaCatalogue } from '../api';
import { useCurrentUser } from '../auth';
import { useLocale } from '../form/locale';
import { MyContributions } from '../MyContributions';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent(): JSX.Element {
  const locale = useLocale();
  const { user, loaded: userLoaded } = useCurrentUser();
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.schemas().then(setSchemas).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  if (error !== null) {
    return <p className='text-destructive'>Failed to load schemas: {error}</p>;
  }
  if (schemas === null) {
    return (
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className='h-24 w-full' />)}
      </div>
    );
  }

  const types = Object.values(schemas.entityTypes)
    .map((t) => ({ ...t, displayLabel: t.labels[locale] ?? t.labels.en }))
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));

  return (
    <div className='space-y-6'>
      {userLoaded && user !== null ? <MyContributions /> : null}
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Entity types</h1>
        <p className='text-muted-foreground text-sm'>
          {types.length} types · pick one to browse and edit entities.
        </p>
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {types.map((t) => (
          <Link
            key={t.id}
            to='/types/$type'
            params={{ type: t.id }}
            className='no-underline'
          >
            <Card className='hover:border-ring transition'>
              <CardHeader>
                <CardTitle className='text-base'>{t.displayLabel}</CardTitle>
                <CardDescription className='text-xs'>
                  {t.properties.length} properties · {t.allowed_relations.length} relations
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
