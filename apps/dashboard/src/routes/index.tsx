import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api } from '../api';
import { useCurrentUser } from '../auth';
import { LoadFailed } from '../components/LoadFailed';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';
import { MyContributions } from '../MyContributions';
import { MyDrafts } from '../MyDrafts';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent(): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const { user, loaded: userLoaded } = useCurrentUser();
  const { data: schemas, error } = useApiResource(() => api.schemas(), []);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Fan-out count fetch once schemas land — deliberately NOT part of the
  // page resource so the type grid renders as soon as schemas arrive and
  // counts roll in after. `listEntities` is cached module-wide in api.ts
  // so revisiting the home page is zero-RTT, and the command palette
  // shares the same cache.
  useEffect(() => {
    if (schemas === null) return;
    let cancelled = false;
    void Promise.all(
      Object.keys(schemas.entityTypes).map(async (id) => {
        try {
          const list = await api.listEntities(id);
          return [id, list.length] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    ).then((results) => {
      if (!cancelled) setCounts(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [schemas]);

  if (error !== null) {
    return <LoadFailed message={error} />;
  }
  if (schemas === null) {
    return (
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className='h-24 w-full' />)}
      </div>
    );
  }

  const types = Object.values(schemas.entityTypes)
    .map((et) => ({
      ...et,
      displayLabel: et.labels[locale] ?? et.labels.en,
      count: counts[et.id],
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

  const entitiesLabel = t('entitiesWord');
  const singularLabel = t('entityWord');

  return (
    <div className='space-y-6'>
      {userLoaded && user !== null ? <MyDrafts /> : null}
      {userLoaded && user !== null ? <MyContributions /> : null}
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('homeTitle')}</h1>
        <p className='text-muted-foreground text-sm'>
          {types.length} types · {t('homeSubtitle')}
        </p>
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {types.map((et) => (
          <Link
            key={et.id}
            to='/types/$type'
            params={{ type: et.id }}
            className='no-underline'
          >
            <Card className='hover:border-ring transition'>
              <CardHeader>
                <CardTitle className='text-base'>{et.displayLabel}</CardTitle>
                <CardDescription className='text-xs'>
                  {et.count === undefined
                    ? '…'
                    : `${et.count} ${et.count === 1 ? singularLabel : entitiesLabel}`}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
