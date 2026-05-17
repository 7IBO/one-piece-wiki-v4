/**
 * Per-source cast manager (ADR-021). Lists every entity that has an
 * `appears-in` relation targeting this source, grouped by the
 * entity's type. The contributor can:
 *   - remove a cast entry (×)
 *   - add new cast members per type via the "+ Add …" affordance
 *
 * Saves go through `api.saveCast`, which opens ONE PR titled
 * `[DATA] Update cast of <sourceId>` touching every modified entity
 * file in a single commit.
 *
 * Constraints:
 *   - The page is only meaningful for source-type entities (chapters,
 *     episodes, films, SBS, databooks). Non-source types 404 here —
 *     the server's `/api/sources/:type/:slug/cast` endpoint rejects
 *     with a `badRequest` so the UI gets a clean error toast.
 *   - The cast-add UI is intentionally a thin wrapper around the
 *     existing `MultiEntityRefInput` so contributors get the same
 *     search-by-name + mobile-sheet behaviour they know from the
 *     entity editor.
 *
 * Mobile-first: the page is single-column, the bulk-add control
 * uses `MultiEntityRefInput` which already picks `MobileSheet` on
 * coarse-pointer devices.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, GitPullRequest, Pencil, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type CastEntry, type CastResponse, type SchemaCatalogue } from '../api';
import { MultiEntityRefInput } from '../form/inputs';
import { useLocale } from '../form/locale';

export const Route = createFileRoute('/sources/$type/$slug')({
  component: SourceCastComponent,
});

type WorkingState = {
  /** Entities present in the original (server) response — used to
   *  compute the remove[] diff at save time. */
  readonly initial: ReadonlySet<string>;
  /** Currently-selected cast (after local adds/removes). */
  readonly current: ReadonlySet<string>;
  /** Display metadata for currently-selected entities. Indexed by
   *  entityId so removing then re-adding keeps the name/qualifiers
   *  the contributor expects. */
  readonly meta: ReadonlyMap<string, CastEntry>;
};

function emptyState(): WorkingState {
  return { initial: new Set(), current: new Set(), meta: new Map() };
}

function buildInitialState(cast: CastResponse['cast']): WorkingState {
  const ids = new Set<string>();
  const meta = new Map<string, CastEntry>();
  for (const group of cast) {
    for (const entry of group.entries) {
      ids.add(entry.entityId);
      meta.set(entry.entityId, entry);
    }
  }
  return { initial: ids, current: new Set(ids), meta };
}

function SourceCastComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const navigate = useNavigate();

  const [cast, setCast] = useState<CastResponse | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingState>(emptyState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getCast(type, slug), api.schemas()])
      .then(([c, s]) => {
        setCast(c);
        setSchemas(s);
        setWorking(buildInitialState(c.cast));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [type, slug]);

  // entityTypes prop for MultiEntityRefInput — accepts every type
  // declared in the schema catalogue, sorted by locale label. The
  // input itself filters by the `restrictTo` we pass per group.
  const entityTypes = useMemo(() => {
    if (schemas === null) return [];
    return Object.values(schemas.entityTypes)
      .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [schemas, locale]);

  // Valid "from" types for `appears-in` — the only entity types a
  // contributor can plausibly add as cast on a source. Read from the
  // schema rather than hard-coded so future relation changes don't
  // need a UI patch.
  const allowedCastTypes = useMemo(() => {
    if (schemas === null) return [] as readonly string[];
    return schemas.relationTypes['appears-in']?.valid_from_types ?? [];
  }, [schemas]);

  const typeLabel = (t: string): string => {
    if (schemas === null) return t;
    const et = schemas.entityTypes[t];
    return et?.labels[locale] ?? et?.labels.en ?? t;
  };

  // Group the CURRENT (working) cast back by entity-type for render.
  const grouped = useMemo(() => {
    const buckets = new Map<string, CastEntry[]>();
    for (const id of working.current) {
      const entry = working.meta.get(id);
      if (entry === undefined) continue;
      const list = buckets.get(entry.entityType) ?? [];
      list.push(entry);
      buckets.set(entry.entityType, list);
    }
    return Array.from(buckets.entries())
      .map(([t, entries]) => ({
        entityType: t,
        entries: entries.slice().sort((a, b) => {
          const an = a.displayName.en ?? a.slug;
          const bn = b.displayName.en ?? b.slug;
          return an.localeCompare(bn);
        }),
      }))
      .sort((a, b) => typeLabel(a.entityType).localeCompare(typeLabel(b.entityType)));
  }, [working, schemas, locale]);

  const added = useMemo(() => {
    const out: string[] = [];
    for (const id of working.current) if (!working.initial.has(id)) out.push(id);
    return out;
  }, [working]);
  const removed = useMemo(() => {
    const out: string[] = [];
    for (const id of working.initial) if (!working.current.has(id)) out.push(id);
    return out;
  }, [working]);
  const dirty = added.length > 0 || removed.length > 0;

  function toggleAdd(entityId: string): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      if (current.has(entityId)) {
        current.delete(entityId);
      } else {
        current.add(entityId);
        // Seed minimal meta — the real display name comes when the
        // catalogue refetches after save, but until then "id-only"
        // chip is acceptable.
        if (!prev.meta.has(entityId)) {
          const [t = '', s = ''] = entityId.split(':');
          const meta = new Map(prev.meta);
          meta.set(entityId, {
            entityId,
            entityType: t,
            slug: s,
            displayName: { en: null, fr: null },
            qualifiers: {},
          });
          return { ...prev, current, meta };
        }
      }
      return { ...prev, current };
    });
  }
  function removeCast(entityId: string): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      current.delete(entityId);
      return { ...prev, current };
    });
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const result = await api.saveCast(type, slug, {
        add: added.map((id) => ({
          entityId: id,
          // Qualifiers from the working meta — for v1 we don't have
          // an inline editor for them, so this is empty for fresh
          // adds and preserves the original qualifiers for entities
          // re-added after an in-session remove.
          qualifiers: working.meta.get(id)?.qualifiers ?? {},
        })),
        remove: removed,
      });
      if (result.pr.noOp) {
        toast.info('Nothing changed.');
        return;
      }
      toast.success(`Cast PR opened (#${result.pr.number})`, {
        description: result.pr.htmlUrl,
        action: {
          label: 'Open',
          onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
        },
      });
      // Reset baseline to the new state so further edits are
      // independent of the PR we just opened.
      setWorking((prev) => ({ ...prev, initial: new Set(prev.current) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  if (error !== null) return <p className='text-destructive'>Failed: {error}</p>;
  if (cast === null || schemas === null) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  const sourceLabel = typeLabel(type);

  return (
    <div className='space-y-4 pb-24'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {sourceLabel}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            Cast — {cast.source.slug}
          </h1>
          <Badge variant='secondary' className='font-mono text-[10px]'>
            {cast.source.id}
          </Badge>
          <Button
            render={<Link to='/types/$type/$slug' params={{ type, slug }} />}
            variant='ghost'
            size='sm'
            className='ml-auto gap-1 text-[11px]'
          >
            <Pencil className='size-3' />
            Edit source
          </Button>
        </div>
        <p className='text-muted-foreground mt-1 text-xs'>
          One PR per save will be opened, touching every entity whose apparitions change.
        </p>
      </div>

      {allowedCastTypes.length === 0
        ? (
          <p className='text-destructive text-sm'>
            The `appears-in` relation schema is missing or has no `valid_from_types`.
          </p>
        )
        : (
          <div className='space-y-6'>
            {allowedCastTypes.map((castType) => {
              const group = grouped.find((g) => g.entityType === castType);
              const entries = group?.entries ?? [];
              return (
                <section key={castType} className='space-y-2'>
                  <div className='flex items-baseline justify-between gap-2'>
                    <h2 className='text-sm font-semibold'>
                      {typeLabel(castType)}{' '}
                      <span className='text-muted-foreground font-normal'>
                        ({entries.length})
                      </span>
                    </h2>
                  </div>
                  <ul className='divide-border divide-y rounded-md border'>
                    {entries.length === 0
                      ? (
                        <li className='text-muted-foreground px-3 py-3 text-xs'>
                          No {typeLabel(castType).toLowerCase()} listed yet.
                        </li>
                      )
                      : entries.map((e) => {
                        const name = e.displayName[locale] ?? e.displayName.en ?? e.slug;
                        const qualLine = Object.entries(e.qualifiers)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ');
                        return (
                          <li
                            key={e.entityId}
                            className='flex items-center gap-2 px-3 py-2 text-sm'
                          >
                            <Link
                              to='/types/$type/$slug'
                              params={{ type: e.entityType, slug: e.slug }}
                              className='hover:underline'
                            >
                              {name}
                            </Link>
                            {qualLine !== ''
                              ? (
                                <span className='text-muted-foreground text-[11px]'>
                                  {qualLine}
                                </span>
                              )
                              : null}
                            <Button
                              variant='ghost'
                              size='icon'
                              className='ml-auto'
                              onClick={() => removeCast(e.entityId)}
                              aria-label='Remove from cast'
                            >
                              <X className='size-4' />
                            </Button>
                          </li>
                        );
                      })}
                  </ul>
                  <div>
                    {
                      /* The MultiEntityRefInput shows ALL currently-selected
                       ids (across every type) as chips; we only feed it
                       the ids for THIS type so it stays focused. The
                       global working state is the source of truth. */
                    }
                    <MultiEntityRefInput
                      value={[...working.current].filter((id) => id.startsWith(`${castType}:`))}
                      onChange={(next) => {
                        const ofType = new Set(next);
                        // Reconcile: anything in `next` not already in
                        // working.current → toggle in. Anything in
                        // working.current with this type prefix but not
                        // in `next` → toggle out.
                        setWorking((prev) => {
                          const updated = new Set(prev.current);
                          const meta = new Map(prev.meta);
                          for (const id of ofType) {
                            if (!updated.has(id)) {
                              updated.add(id);
                              if (!meta.has(id)) {
                                const [t = '', s = ''] = id.split(':');
                                meta.set(id, {
                                  entityId: id,
                                  entityType: t,
                                  slug: s,
                                  displayName: { en: null, fr: null },
                                  qualifiers: {},
                                });
                              }
                            }
                          }
                          for (const id of prev.current) {
                            if (id.startsWith(`${castType}:`) && !ofType.has(id)) {
                              updated.delete(id);
                            }
                          }
                          return { ...prev, current: updated, meta };
                        });
                        // Touch the toggleAdd reference to keep ESLint happy
                        // about it being declared but only used through the
                        // multi input on this page.
                        void toggleAdd;
                      }}
                      entityTypes={entityTypes}
                      restrictTo={[castType]}
                    />
                  </div>
                </section>
              );
            })}
          </div>
        )}

      {dirty
        ? (
          <div
            className='border-border bg-background fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t px-4 py-3 sm:px-6 lg:left-64'
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
          >
            <p className='text-muted-foreground text-xs'>
              {added.length} to add · {removed.length} to remove
            </p>
            <div className='ml-auto flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={saving}
                onClick={() => setWorking((prev) => ({ ...prev, current: new Set(prev.initial) }))}
              >
                Reset
              </Button>
              <Button
                size='sm'
                disabled={saving}
                onClick={() => {
                  void save();
                }}
              >
                {saving ? 'Saving…' : 'Save cast'}
              </Button>
            </div>
          </div>
        )
        : null}

      {
        /* Footnote — opens the type listing of the source's type so
         the contributor can flip to a neighbouring chapter quickly. */
      }
      <div className='text-muted-foreground border-border border-t pt-3 text-[11px]'>
        <Button
          variant='ghost'
          size='sm'
          className='h-6 gap-1 px-1.5 text-[11px]'
          onClick={() => void navigate({ to: '/types/$type', params: { type } })}
        >
          <GitPullRequest className='size-3' />
          See all {sourceLabel.toLowerCase()} sources
          <ExternalLink className='size-3' />
        </Button>
      </div>
    </div>
  );
}
