import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type SchemaCatalogue } from '../api.ts';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent(): JSX.Element {
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
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className='h-24 w-full' />)}
      </div>
    );
  }

  const types = Object.values(schemas.entityTypes).sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Entity types</h1>
        <p className='text-muted-foreground text-sm'>
          {types.length} types · pick one to browse and edit entities.
        </p>
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {types.map((t) => (
          <Link
            key={t.id}
            to='/types/$type'
            params={{ type: t.id }}
            className='no-underline'
          >
            <Card className='hover:border-ring transition'>
              <CardHeader>
                <CardTitle className='font-mono text-base'>{t.id}</CardTitle>
                <CardDescription>{t.labels.en}</CardDescription>
              </CardHeader>
              <CardContent className='text-muted-foreground text-xs'>
                {t.properties.length} properties · {t.allowed_relations.length} relations
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
