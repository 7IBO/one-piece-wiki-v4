/**
 * Per-entity apparitions timeline (ADR-021). For non-source entities
 * (characters, devil-fruits, crews, …), shows every `appears-in`
 * relation grouped by source-type, sorted chronologically when the
 * source carries a number (chapters, episodes) and alphabetically
 * otherwise.
 *
 * Read-only in v1: editing apparitions still goes through the
 * regular entity editor at `/types/$type/$slug` (or the inverse
 * cast manager at `/sources/$type/$slug` for the source side).
 * The contributor uses this page to AUDIT the entity's apparitions
 * without scrolling the full relations editor.
 *
 * The page 404s for source-type entities (chapters, episodes…) —
 * apparitions don't originate from sources. The schema's
 * `appears-in.valid_from_types` is the source of truth.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type EntityDetail, type SchemaCatalogue } from '../api';
import { useLocale } from '../form/locale';

export const Route = createFileRoute('/types/$type/$slug/apparitions')({
  component: ApparitionsComponent,
});

type Apparition = {
  readonly type: 'appears-in';
  readonly target: string;
  readonly qualifiers?: Record<string, unknown>;
};

function readApparitions(entity: EntityDetail): readonly Apparition[] {
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return [];
  return (relations as Array<Record<string, unknown>>)
    .filter((r): r is Apparition => r['type'] === 'appears-in' && typeof r['target'] === 'string');
}

function sourceTypeOf(target: string): string {
  const idx = target.indexOf(':');
  return idx > 0 ? target.slice(0, idx) : 'unknown';
}

function sourceSlugOf(target: string): string {
  const idx = target.indexOf(':');
  return idx > 0 ? target.slice(idx + 1) : target;
}

function ApparitionsComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getEntity(type, slug), api.schemas()])
      .then(([e, s]) => {
        setEntity(e);
        setSchemas(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [type, slug]);

  const apparitions = useMemo(
    () => (entity === null ? [] : readApparitions(entity)),
    [entity],
  );

  // Group by source-type. Order within each group: chapters /
  // episodes carry numbers we'd like to sort by, but we don't have
  // the source's `number` field on this page (we'd need a second
  // fetch). For v1 we sort by slug — chapter slugs are numeric so
  // string-sort works out of the box ("1" < "10" but that's fine
  // for browsing; the production fix is to fetch /api/sources and
  // join on number).
  const grouped = useMemo(() => {
    const buckets = new Map<string, Apparition[]>();
    for (const ap of apparitions) {
      const t = sourceTypeOf(ap.target);
      const list = buckets.get(t) ?? [];
      list.push(ap);
      buckets.set(t, list);
    }
    return Array.from(buckets.entries())
      .map(([t, entries]) => ({
        sourceType: t,
        entries: entries.slice().sort((a, b) => a.target.localeCompare(b.target)),
      }))
      .sort((a, b) => a.sourceType.localeCompare(b.sourceType));
  }, [apparitions]);

  const typeLabel = (t: string): string => {
    if (schemas === null) return t;
    const et = schemas.entityTypes[t];
    return et?.labels[locale] ?? et?.labels.en ?? t;
  };

  if (error !== null) return <p className='text-destructive'>Failed: {error}</p>;
  if (entity === null || schemas === null) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }
  const appearsIn = schemas.relationTypes['appears-in'];
  const validFrom = (appearsIn?.valid_from_types ?? []) as readonly string[];
  if (appearsIn === undefined || !validFrom.includes(type)) {
    return (
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {typeLabel(type)}{' '}
          entities don't carry apparitions — `appears-in` doesn't accept them as origin. Visit{' '}
          <Link
            to='/types/$type/$slug'
            params={{ type, slug }}
            className='underline'
          >
            the entity editor
          </Link>{' '}
          instead.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type/$slug' params={{ type, slug }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          Back to entity
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            Apparitions of {slug}
          </h1>
          <Badge variant='secondary' className='font-mono text-[10px]'>
            {entity.id}
          </Badge>
          <span className='text-muted-foreground ml-auto text-xs'>
            {apparitions.length} total
          </span>
        </div>
        <p className='text-muted-foreground mt-1 text-xs'>
          Read-only view. To add or remove apparitions, edit the entity at{' '}
          <Link
            to='/types/$type/$slug'
            params={{ type, slug }}
            className='underline'
          >
            /types/{type}/{slug}
          </Link>{' '}
          (or use the per-source cast manager).
        </p>
      </div>

      {grouped.length === 0
        ? (
          <p className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            No apparitions recorded yet.
          </p>
        )
        : grouped.map((group) => (
          <section key={group.sourceType} className='space-y-2'>
            <h2 className='text-sm font-semibold'>
              {typeLabel(group.sourceType)}{' '}
              <span className='text-muted-foreground font-normal'>
                ({group.entries.length})
              </span>
            </h2>
            <ul className='divide-border divide-y rounded-md border'>
              {group.entries.map((ap) => {
                const qualLine = ap.qualifiers === undefined
                  ? ''
                  : Object.entries(ap.qualifiers)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(' · ');
                return (
                  <li
                    key={ap.target}
                    className='flex items-center gap-2 px-3 py-2 text-sm'
                  >
                    <Link
                      to='/sources/$type/$slug'
                      params={{
                        type: group.sourceType,
                        slug: sourceSlugOf(ap.target),
                      }}
                      className='hover:underline'
                    >
                      {ap.target}
                    </Link>
                    {qualLine !== ''
                      ? (
                        <span className='text-muted-foreground text-[11px]'>
                          {qualLine}
                        </span>
                      )
                      : null}
                    <Link
                      to='/types/$type/$slug'
                      params={{
                        type: group.sourceType,
                        slug: sourceSlugOf(ap.target),
                      }}
                      className='text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11px]'
                    >
                      Edit source
                      <ExternalLink className='size-3' />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
