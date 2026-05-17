import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type SchemaCatalogue } from '../api';
import { useCurrentUser } from '../auth';
import { useLocale } from '../form/locale';
import { MyContributions } from '../MyContributions';
import { MyDrafts } from '../MyDrafts';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent(): JSX.Element {
  const locale = useLocale();
  const { user, loaded: userLoaded } = useCurrentUser();
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.schemas().then(async (cat) => {
      if (cancelled) return;
      setSchemas(cat);
      // Fan-out count fetch. `listEntities` is cached module-wide
      // in api.ts so revisiting the home page is zero-RTT, and the
      // command palette shares the same cache.
      const typeIds = Object.keys(cat.entityTypes);
      const results = await Promise.all(
        typeIds.map(async (id) => {
          try {
            const list = await api.listEntities(id);
            return [id, list.length] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      if (cancelled) return;
      setCounts(Object.fromEntries(results));
    }).catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
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
    .map((t) => ({
      ...t,
      displayLabel: t.labels[locale] ?? t.labels.en,
      count: counts[t.id],
    }))
    .sort((a, b) => {
      // Sort by count descending. Types whose count hasn't loaded yet
      // (undefined) sink to the bottom; tie-break alphabetically so the
      // order is stable while counts roll in.
      const ac = a.count ?? -1;
      const bc = b.count ?? -1;
      if (ac !== bc) return bc - ac;
      return a.displayLabel.localeCompare(b.displayLabel);
    });

  const entitiesLabel = locale === 'fr' ? 'entités' : 'entities';
  const singularLabel = locale === 'fr' ? 'entité' : 'entity';

  return (
    <div className='space-y-6'>
      {userLoaded && user !== null ? <MyDrafts /> : null}
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
                  {t.count === undefined
                    ? '…'
                    : `${t.count} ${t.count === 1 ? singularLabel : entitiesLabel}`}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
