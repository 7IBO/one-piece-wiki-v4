import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { api } from '../api';
import { useCurrentUser } from '../auth';
import { LoadFailed } from '../components/LoadFailed';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';
import { groupTypesByUiHint } from '../lib/type-groups';
import { MyContributions } from '../MyContributions';
import { MyDrafts } from '../MyDrafts';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

type TypeItem = {
  readonly id: string;
  readonly label: string;
  readonly group: string | undefined;
  readonly count: number | undefined;
};

function TypeCard(
  { item, singular, plural }: {
    readonly item: TypeItem;
    readonly singular: string;
    readonly plural: string;
  },
): JSX.Element {
  return (
    <Link to='/types/$type' params={{ type: item.id }} className='no-underline'>
      <Card bleed className='h-full transition hover:ring-ring/50'>
        <CardHeader>
          <CardTitle className='text-base'>{item.label}</CardTitle>
          <CardDescription className='text-xs'>
            {item.count === undefined
              ? '…'
              : `${item.count} ${item.count === 1 ? singular : plural}`}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

function IndexComponent(): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const { user, loaded: userLoaded } = useCurrentUser();
  const { data: schemas, error, reload } = useApiResource(() => api.schemas(), []);
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
    return <LoadFailed message={error} onRetry={reload} />;
  }
  if (schemas === null) {
    return (
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className='h-24 w-full' />)}
      </div>
    );
  }

  const items: readonly TypeItem[] = Object.values(schemas.entityTypes).map((et) => ({
    id: et.id,
    label: et.labels[locale] ?? et.labels.en,
    group: et.ui_hint?.group,
    count: counts[et.id],
  }));

  // Empty types (count === 0) collapse into one muted section at the
  // end so the page leads with real content. Types whose count hasn't
  // loaded yet (undefined) stay in their group with a '…' count — the
  // single batched `setCounts` means at most one layout transition.
  const emptyTypes = items
    .filter((it) => it.count === 0)
    .sort((a, b) => a.label.localeCompare(b.label));
  const populated = items.filter((it) => it.count !== 0);

  // Groups render in the shared, schema-driven order (same module as
  // the sidebar) — never reordered by count, so nothing reshuffles as
  // counts stream in.
  const groups = groupTypesByUiHint(
    populated,
    { group: (it) => it.group, label: (it) => it.label },
    locale,
  );

  const entitiesLabel = t('entitiesWord');
  const singularLabel = t('entityWord');

  return (
    <div className='space-y-6'>
      {userLoaded && user !== null ? <MyDrafts /> : null}
      {userLoaded && user !== null ? <MyContributions /> : null}
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('homeTitle')}</h1>
        <p className='text-muted-foreground text-sm'>
          {items.length} types · {t('homeSubtitle')}
        </p>
      </div>
      {groups.map((g) => (
        <section key={g.groupId} aria-label={g.groupLabel}>
          <h2 className='text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide'>
            {g.groupLabel}
          </h2>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {g.items.map((it) => (
              <TypeCard key={it.id} item={it} singular={singularLabel} plural={entitiesLabel} />
            ))}
          </div>
        </section>
      ))}
      {emptyTypes.length > 0
        ? (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button variant='ghost' size='sm' className='text-muted-foreground gap-1.5' />
              }
            >
              <ChevronRight className='size-3.5 transition-transform group-data-[panel-open]/button:rotate-90' />
              {t('emptyTypesSection').replace('{n}', String(emptyTypes.length))}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className='mt-2 flex flex-wrap gap-2'>
                {emptyTypes.map((it) => (
                  <Button
                    key={it.id}
                    render={<Link to='/types/$type' params={{ type: it.id }} />}
                    variant='outline'
                    size='sm'
                    className='text-muted-foreground'
                  >
                    {it.label} · 0
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )
        : null}
    </div>
  );
}
