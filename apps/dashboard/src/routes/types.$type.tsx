import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type EntityRef } from '../api.ts';

export const Route = createFileRoute('/types/$type')({
  component: TypeListComponent,
});

function TypeListComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const [list, setList] = useState<EntityRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    api.listEntities(type).then(setList).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [type]);

  if (error !== null) {
    return <p className='text-destructive'>Failed: {error}</p>;
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='font-mono text-2xl font-semibold tracking-tight'>{type}</h1>
        <p className='text-muted-foreground text-sm'>
          {list === null ? 'Loading…' : `${list.length} entities`}
        </p>
      </div>

      {list === null ? <Skeleton className='h-64 w-full' /> : (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium'>Browse</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='divide-border divide-y'>
              {list.map((e) => (
                <li key={e.id} className='py-2'>
                  <Link
                    to='/types/$type/$slug'
                    params={{ type: e.type, slug: e.slug }}
                    className='hover:text-primary text-sm'
                  >
                    <code className='font-mono'>{e.slug}</code>
                    <span className='text-muted-foreground ml-2 text-xs'>{e.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
