import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { ArrowDown, ArrowUp, Check, Plus, Search, Table2 } from 'lucide-react';
import { type JSX, useDeferredValue, useMemo, useState } from 'react';
import { api, type Completeness, type EntityRef } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { useEntityTypeLabel, useLocale, useT } from '../form/locale';
import { useAllDrafts } from '../form/use-draft';
import { useApiResource } from '../hooks/use-api-resource';

export const Route = createFileRoute('/types/$type/')({
  component: TypeListComponent,
});

type SortKey = 'name' | 'slug' | 'id';
type SortDir = 'asc' | 'desc';

/**
 * Per-row completeness meter (ADR-083). Renders `filled/expected` in
 * text-xs with a 2px progress bar: amber count while expected fields
 * are missing, muted count + checkmark once complete. Hidden entirely
 * when the type declares no expected fields (`expected === 0`).
 */
function RowCompleteness({ value }: { value: Completeness; }): JSX.Element | null {
  const t = useT();
  if (value.expected <= 0) return null;
  const full = value.filled >= value.expected;
  const pct = Math.min(100, Math.round((value.filled / value.expected) * 100));
  const label = t('completenessOf')
    .replace('{filled}', String(value.filled))
    .replace('{expected}', String(value.expected));
  return (
    <div
      className='flex shrink-0 flex-col items-end gap-1'
      title={full ? `${label} — ${t('completeWord')}` : label}
    >
      <span
        className={`flex items-center gap-1 text-xs tabular-nums ${
          full ? 'text-muted-foreground' : 'text-amber-500'
        }`}
      >
        {full ? <Check aria-hidden='true' className='size-3' /> : null}
        {value.filled}/{value.expected}
      </span>
      <div aria-hidden='true' className='bg-muted h-0.5 w-14 overflow-hidden rounded-full sm:w-16'>
        <div className='bg-primary h-full rounded-full' style={{ width: `${pct}%` }} />
      </div>
      <span className='sr-only'>{label}</span>
    </div>
  );
}

/** Two-line skeleton rows shaped like the real list rows. */
function ListSkeleton(): JSX.Element {
  return (
    <Card bleed className='gap-0 py-0'>
      <ul className='divide-border divide-y'>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className='flex items-center gap-3 px-[var(--page-px)] py-2.5 sm:px-4'>
            <div className='min-w-0 flex-1 space-y-1.5'>
              <Skeleton className='h-4 w-44 max-w-full' />
              <Skeleton className='h-3 w-28 max-w-full' />
            </div>
            <div className='flex shrink-0 flex-col items-end gap-1'>
              <Skeleton className='h-3 w-8' />
              <Skeleton className='h-0.5 w-14 sm:w-16' />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TypeListComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const locale = useLocale();
  const t = useT();
  const { data, error, reload } = useApiResource(
    () => Promise.all([api.listEntities(type), api.schemas()]),
    [type],
  );
  const list = data?.[0] ?? null;
  const schemas = data?.[1] ?? null;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const deferredQuery = useDeferredValue(query);

  // Reset the search box when switching entity types — the render-time
  // adjustment pattern (react.dev "you might not need an effect"), so
  // there's no stale-frame flash and no effect chain.
  const [prevType, setPrevType] = useState(type);
  if (prevType !== type) {
    setPrevType(type);
    setQuery('');
  }

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

  // Localized singular/plural — never "1 entities".
  const countOf = (n: number): string => `${n} ${n === 1 ? t('entityWord') : t('entitiesWord')}`;

  if (error !== null) {
    return <LoadFailed message={error} onRetry={reload} />;
  }

  return (
    <div className='space-y-4 sm:space-y-5'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2'>
        <div>
          <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            {entityTypeLabel ?? <Skeleton className='inline-block h-7 w-40 align-middle' />}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {list === null
              ? t('loading')
              : display === null || display.length === list.length
              ? countOf(list.length)
              : `${display.length} ${t('ofWord')} ${countOf(list.length)}`}
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
            {t('newButton')}
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

      {
        /* Sticky toolbar: offset by the app-header height (at top-0 it
          slid underneath the header) and full-bleed below `sm` so the
          bleeding list rows never peek past its background at the
          gutter edges while scrolling. */
      }
      <div className='bleed bg-background sticky top-[var(--header-h)] z-10 flex flex-wrap items-center gap-2 border-b px-[var(--page-px)] py-2 sm:px-0'>
        <div className='relative min-w-56 flex-1'>
          <Search className='text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2' />
          <Input
            type='search'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchEntitiesPlaceholder')}
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
          aria-label={sortDir === 'asc' ? t('sortDescending') : t('sortAscending')}
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
        ? <ListSkeleton />
        : display === null || display.length === 0
        ? (
          <div className='rounded-md border border-dashed p-8 text-center'>
            <p className='text-muted-foreground text-sm'>
              {list.length === 0 ? t('noEntitiesYet') : t('noMatchSearch')}
            </p>
            {list.length === 0
              ? (
                <Button
                  render={<Link to='/types/$type/new' params={{ type }} />}
                  variant='outline'
                  size='sm'
                  className='mt-4 gap-1.5'
                >
                  <Plus className='size-3.5' />
                  {t('createFirstEntity')}
                </Button>
              )
              : null}
          </div>
        )
        : (
          <Card bleed className='gap-0 py-0'>
            <ul className='divide-border divide-y'>
              {display.map((e) => {
                const name = e.displayName[locale] ?? e.displayName.en ?? e.slug;
                const hasDraft = draftIdsForType.has(e.id);
                return (
                  <li key={e.id}>
                    <Link
                      to='/types/$type/$slug'
                      params={{ type: e.type, slug: e.slug }}
                      className='hover:bg-accent/40 flex items-center gap-3 px-[var(--page-px)] py-2.5 sm:px-4'
                    >
                      <div className='min-w-0 flex-1'>
                        <p className='flex items-center gap-2 text-sm font-medium'>
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
                              <span className='shrink-0 rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 text-xs text-amber-500'>
                                {t('draftBadge')}
                              </span>
                            )
                            : null}
                        </p>
                        <p className='text-muted-foreground truncate font-mono text-xs'>
                          {e.slug}
                        </p>
                      </div>
                      {e.completeness !== undefined
                        ? <RowCompleteness value={e.completeness} />
                        : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
    </div>
  );
}
