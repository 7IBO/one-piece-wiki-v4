import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus, Search, Table2 } from 'lucide-react';
import { type JSX, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api, type EntityRef, type SchemaCatalogue } from '../api';
import { useEntityTypeLabel, useLocale, useT } from '../form/locale';
import { useAllDrafts } from '../form/use-draft';

export const Route = createFileRoute('/types/$type/')({
  component: TypeListComponent,
});

type SortKey = 'name' | 'slug' | 'id';
type SortDir = 'asc' | 'desc';

function TypeListComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const locale = useLocale();
  const t = useT();
  const [list, setList] = useState<EntityRef[] | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const deferredQuery = useDeferredValue(query);

  // Drafts keyed by entity id — used to flag rows that carry local
  // in-progress edits. Filtering is cheap (Set lookup) so we do it
  // inline rather than memoising another pass.
  const { drafts } = useAllDrafts();
  const draftIdsForType = useMemo(() => {
    const set = new Set<string>();
    const prefix = `${type}:`;
    for (const d of drafts) if (d.entityId.startsWith(prefix)) set.add(d.entityId);
    return set;
  }, [drafts, type]);

  useEffect(() => {
    setList(null);
    setQuery('');
    Promise.all([api.listEntities(type), api.schemas()])
      .then(([l, s]) => {
        setList(l);
        setSchemas(s);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [type]);

  const entityTypeLabel = useEntityTypeLabel(schemas, type);

  const display = useMemo(() => {
    if (list === null) return null;
    const q = deferredQuery.trim().toLowerCase();
    const filtered = q === ''
      ? list
      : list.filter((e) => {
        const name = e.displayName[locale] ?? e.displayName.en ?? '';
        return name.toLowerCase().includes(q)
          || e.slug.toLowerCase().includes(q)
          || e.id.toLowerCase().includes(q);
      });
    const sortFn = (a: EntityRef, b: EntityRef): number => {
      const av = sortKey === 'name'
        ? (a.displayName[locale] ?? a.displayName.en ?? a.slug)
        : sortKey === 'slug'
        ? a.slug
        : a.id;
      const bv = sortKey === 'name'
        ? (b.displayName[locale] ?? b.displayName.en ?? b.slug)
        : sortKey === 'slug'
        ? b.slug
        : b.id;
      return av.localeCompare(bv);
    };
    const sorted = [...filtered].sort(sortFn);
    if (sortDir === 'desc') sorted.reverse();
    return sorted;
  }, [list, deferredQuery, sortKey, sortDir, locale]);

  if (error !== null) {
    return <p className='text-destructive'>Failed: {error}</p>;
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-baseline justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {entityTypeLabel ?? <Skeleton className='inline-block h-7 w-40 align-middle' />}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {list === null
              ? t('loading')
              : display?.length === list.length
              ? `${list.length} ${t('entitiesWord')}`
              : `${display?.length ?? 0} ${t('ofWord')} ${list.length} ${t('entitiesWord')}`}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            render={<Link to='/types/$type/new' params={{ type }} />}
            variant='default'
            size='sm'
            className='gap-1.5'
          >
            <Plus className='size-3.5' />
            New
          </Button>
          <Button
            render={<Link to='/types/$type/table' params={{ type }} />}
            variant='outline'
            size='sm'
            className='gap-1.5'
          >
            <Table2 className='size-3.5' />
            {t('tableView')}
          </Button>
        </div>
      </div>

      <div className='bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b py-2'>
        <div className='relative flex-1 min-w-64'>
          <Search className='text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2' />
          <Input
            type='search'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search by name, slug or id…'
            className='pl-8'
          />
        </div>
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey((v ?? 'name') as SortKey)}
        >
          <SelectTrigger className='w-32' aria-label={t('sortBy')}>
            <SelectValue>
              {(v: SortKey) =>
                v === 'slug'
                  ? t('sortBySlug')
                  : v === 'id'
                  ? t('sortById')
                  : t('sortByName')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='name'>{t('sortByName')}</SelectItem>
            <SelectItem value='slug'>{t('sortBySlug')}</SelectItem>
            <SelectItem value='id'>{t('sortById')}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type='button'
          variant='outline'
          size='icon-lg'
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
        >
          {sortDir === 'asc' ? <ArrowUp className='size-4' /> : <ArrowDown className='size-4' />}
        </Button>
      </div>

      {draftIdsForType.size > 0
        ? (
          <Banner variant='warning'>
            <span className='inline-block size-1.5 rounded-full bg-amber-500' />
            <span>
              {t('draftsThisType').replace('{n}', String(draftIdsForType.size))}
            </span>
          </Banner>
        )
        : null}

      {list === null
        ? <Skeleton className='h-64 w-full' />
        : display === null || display.length === 0
        ? (
          <div className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            {list.length === 0 ? t('noEntitiesYet') : t('noMatchSearch')}
          </div>
        )
        : (
          <ul className='divide-border divide-y rounded-md border'>
            {display.map((e) => {
              const name = e.displayName[locale] ?? e.displayName.en ?? e.slug;
              const hasDraft = draftIdsForType.has(e.id);
              return (
                <li key={e.id}>
                  <Link
                    to='/types/$type/$slug'
                    params={{ type: e.type, slug: e.slug }}
                    className='hover:bg-accent/40 flex items-center gap-2 px-4 py-2.5 text-sm font-medium'
                  >
                    {
                      /* Amber dot mirrors the EntityForm + header
                        DraftsIndicator semantics: one colour means
                        "local pending work" across every surface. */
                    }
                    {hasDraft
                      ? (
                        <span
                          aria-label={t('draftBadge')}
                          title={t('draftBadge')}
                          className='inline-block size-1.5 shrink-0 rounded-full bg-amber-500'
                        />
                      )
                      : null}
                    <span className='min-w-0 truncate'>{name}</span>
                    {hasDraft
                      ? (
                        <span className='ml-auto shrink-0 rounded-[3px] border border-amber-500/40 bg-amber-500/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-500'>
                          {t('draftBadge')}
                        </span>
                      )
                      : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
