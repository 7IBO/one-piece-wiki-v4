/**
 * Per-entity apparitions editor (ADR-021). For non-source entities
 * (characters, devil-fruits, crews, …), surfaces every `appears-in`
 * relation grouped by source-type — and lets the contributor add or
 * remove apparitions inline.
 *
 * Save flow: patches the entity's own `relations[]` array (only the
 * `appears-in` entries, never the rest) and hands the result to the
 * existing `api.saveEntity` flow. One PR per save, titled
 * `[DATA] Edit <entityId>` like any other entity edit. The cast-side
 * `submitSourceCastEdit` flow is NOT used here — the unit of change
 * is the entity, not the source.
 *
 * Constraints:
 *  - Source types (chapters, episodes, films…) 404 here — they're
 *    the destination of apparitions, not the origin.
 *  - We never touch non-`appears-in` relations on save; the diff is
 *    scoped to apparitions only.
 *
 * Mobile-first: the per-group bulk-add control is `MultiEntityRefInput`
 * which already picks `MobileSheet` on coarse-pointer devices.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type EntityDetail, type SchemaCatalogue } from '../api';
import { MultiEntityRefInput } from '../form/inputs';
import { useLocale, useT } from '../form/locale';

export const Route = createFileRoute('/types/$type/$slug/apparitions')({
  component: ApparitionsComponent,
});

type Apparition = {
  readonly type: 'appears-in';
  readonly target: string;
  readonly qualifiers?: Record<string, unknown>;
};

type OtherRelation = Record<string, unknown>;

function splitRelations(
  entity: EntityDetail,
): { apparitions: readonly Apparition[]; others: readonly OtherRelation[]; } {
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return { apparitions: [], others: [] };
  const apparitions: Apparition[] = [];
  const others: OtherRelation[] = [];
  for (const rel of relations as Array<Record<string, unknown>>) {
    if (rel['type'] === 'appears-in' && typeof rel['target'] === 'string') {
      apparitions.push(rel as Apparition);
    } else {
      others.push(rel);
    }
  }
  return { apparitions, others };
}

function sourceTypeOf(target: string): string {
  const idx = target.indexOf(':');
  return idx > 0 ? target.slice(0, idx) : 'unknown';
}

function sourceSlugOf(target: string): string {
  const idx = target.indexOf(':');
  return idx > 0 ? target.slice(idx + 1) : target;
}

type WorkingState = {
  /** Apparition targets present at load — used to compute the
   *  add/remove diff on save. */
  readonly initial: ReadonlySet<string>;
  /** Targets in the current working set. */
  readonly current: ReadonlySet<string>;
  /** Original qualifiers per target, preserved across remove+re-add
   *  in-session so the contributor doesn't lose appearance_type
   *  metadata by mistake. */
  readonly qualifiers: ReadonlyMap<string, Record<string, unknown>>;
};

function emptyWorking(): WorkingState {
  return { initial: new Set(), current: new Set(), qualifiers: new Map() };
}

function buildInitial(apparitions: readonly Apparition[]): WorkingState {
  const ids = new Set<string>();
  const q = new Map<string, Record<string, unknown>>();
  for (const ap of apparitions) {
    ids.add(ap.target);
    if (ap.qualifiers !== undefined) q.set(ap.target, ap.qualifiers);
  }
  return { initial: ids, current: new Set(ids), qualifiers: q };
}

function ApparitionsComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const t = useT();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [sources, setSources] = useState<readonly { id: string; type: string; slug: string; }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingState>(emptyWorking);
  // `others` is the slice of relations[] we DON'T touch on save —
  // re-attached verbatim so a save here can't accidentally drop a
  // member-of or ate-fruit relation. Captured at load time and held
  // for the lifetime of the page.
  const [others, setOthers] = useState<readonly OtherRelation[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getEntity(type, slug), api.schemas(), api.sources()])
      .then(([e, s, src]) => {
        setEntity(e);
        setSchemas(s);
        setSources(src);
        const split = splitRelations(e);
        setWorking(buildInitial(split.apparitions));
        setOthers(split.others);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [type, slug]);

  // entityTypes prop for MultiEntityRefInput — every schema type
  // sorted by locale label. Filtered per-section via `restrictTo`.
  const entityTypes = useMemo(() => {
    if (schemas === null) return [];
    return Object.values(schemas.entityTypes)
      .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [schemas, locale]);

  // The source-type list a contributor can add apparitions for.
  // Derived from `appears-in.valid_to_types` so a schema change
  // doesn't need a UI patch.
  const sourceTypes = useMemo(() => {
    if (schemas === null) return [] as readonly string[];
    return (schemas.relationTypes['appears-in']?.valid_to_types ?? []) as readonly string[];
  }, [schemas]);

  const typeLabel = (entityType: string): string => {
    if (schemas === null) return entityType;
    const et = schemas.entityTypes[entityType];
    return et?.labels[locale] ?? et?.labels.en ?? entityType;
  };

  // Display-name lookup for source ids (chapters / episodes / …).
  // `/api/sources` already returns the per-source display name +
  // chapter/episode number, so we use that instead of slug-only.
  const sourceLabelFor = (id: string): string => {
    const src = sources.find((s) => s.id === id);
    return src?.slug !== undefined ? `${sourceTypeOf(id)}:${src.slug}` : id;
  };

  // Group working state back by source-type for render.
  const grouped = useMemo(() => {
    const buckets = new Map<string, string[]>();
    for (const id of working.current) {
      const st = sourceTypeOf(id);
      const list = buckets.get(st) ?? [];
      list.push(id);
      buckets.set(st, list);
    }
    return sourceTypes.map((st) => ({
      sourceType: st,
      targets: (buckets.get(st) ?? []).slice().sort((a, b) => a.localeCompare(b)),
    }));
  }, [working, sourceTypes]);

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

  function removeTarget(target: string): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      current.delete(target);
      return { ...prev, current };
    });
  }

  async function save(): Promise<void> {
    if (entity === null) return;
    setSaving(true);
    try {
      // Rebuild relations[]: preserve every non-apparition relation
      // verbatim (those came from `others`), plus rebuild the
      // appears-in entries from the working set, preserving original
      // qualifiers when the target survived from the initial set.
      const newApparitions: Apparition[] = [];
      for (const target of working.current) {
        const qualifiers = working.qualifiers.get(target);
        newApparitions.push({
          type: 'appears-in',
          target,
          ...(qualifiers !== undefined && Object.keys(qualifiers).length > 0
            ? { qualifiers }
            : {}),
        });
      }
      // Stable order — `others` first (preserves their relative
      // position), apparitions second sorted by target. This keeps
      // the JSON diff small and predictable across saves.
      newApparitions.sort((a, b) => a.target.localeCompare(b.target));
      const nextData = {
        ...entity.data,
        relations: [...others, ...newApparitions],
      };
      const result = await api.saveEntity(type, slug, nextData, entity.sha, entity.translations);
      if (result.pr.noOp) {
        toast.info(t('nothingChanged'));
        return;
      }
      const title = t('apparitionsPrOpened').replace('{n}', String(result.pr.number));
      toast.success(title, {
        description: result.pr.htmlUrl,
        action: {
          label: t('openPr'),
          onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
        },
      });
      // Roll the baseline forward so subsequent edits diff against
      // what's now on the PR, not the original main snapshot.
      setWorking((prev) => ({ ...prev, initial: new Set(prev.current) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('saveFailed').replace('{message}', message));
    } finally {
      setSaving(false);
    }
  }

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
          {t('apparitionsNotApplicable').replace('{type}', typeLabel(type))}{' '}
          <Link
            to='/types/$type/$slug'
            params={{ type, slug }}
            className='underline'
          >
            /types/{type}/{slug}
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4 pb-24'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type/$slug' params={{ type, slug }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {t('backToEntity')}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {t('apparitionsTitle').replace('{slug}', slug)}
          </h1>
          <Badge variant='secondary' className='font-mono text-[10px]'>
            {entity.id}
          </Badge>
          <span className='text-muted-foreground ml-auto text-xs'>
            {t('apparitionsCountTotal').replace('{n}', String(working.current.size))}
          </span>
        </div>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('apparitionsHint')}
        </p>
      </div>

      {sourceTypes.length === 0
        ? (
          <p className='text-destructive text-sm'>
            {t('appearsInMissing')}
          </p>
        )
        : (
          <div className='space-y-6'>
            {grouped.map((group) => (
              <section key={group.sourceType} className='space-y-2'>
                <h2 className='text-sm font-semibold'>
                  {typeLabel(group.sourceType)}{' '}
                  <span className='text-muted-foreground font-normal'>
                    ({group.targets.length})
                  </span>
                </h2>
                <ul className='divide-border divide-y rounded-md border'>
                  {group.targets.length === 0
                    ? (
                      <li className='text-muted-foreground px-3 py-3 text-xs'>
                        {t('castNoneOfType').replace(
                          '{type}',
                          typeLabel(group.sourceType).toLowerCase(),
                        )}
                      </li>
                    )
                    : group.targets.map((target) => {
                      const qualifiers = working.qualifiers.get(target);
                      const qualLine = qualifiers === undefined
                        ? ''
                        : Object.entries(qualifiers)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ');
                      return (
                        <li
                          key={target}
                          className='flex items-center gap-2 px-3 py-2 text-sm'
                        >
                          <Link
                            to='/sources/$type/$slug'
                            params={{
                              type: group.sourceType,
                              slug: sourceSlugOf(target),
                            }}
                            className='hover:underline'
                          >
                            {sourceLabelFor(target)}
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
                              slug: sourceSlugOf(target),
                            }}
                            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]'
                          >
                            <ExternalLink className='size-3' />
                          </Link>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='ml-auto'
                            onClick={() => removeTarget(target)}
                            aria-label={t('removeApparition')}
                          >
                            <X className='size-4' />
                          </Button>
                        </li>
                      );
                    })}
                </ul>
                <MultiEntityRefInput
                  value={[...working.current].filter((id) => id.startsWith(`${group.sourceType}:`))}
                  onChange={(next) => {
                    const ofType = new Set(next);
                    setWorking((prev) => {
                      const updated = new Set(prev.current);
                      for (const id of ofType) updated.add(id);
                      for (const id of prev.current) {
                        if (id.startsWith(`${group.sourceType}:`) && !ofType.has(id)) {
                          updated.delete(id);
                        }
                      }
                      return { ...prev, current: updated };
                    });
                  }}
                  entityTypes={entityTypes}
                  restrictTo={[group.sourceType]}
                />
              </section>
            ))}
          </div>
        )}

      {dirty
        ? (
          <div
            className='border-border bg-background fixed inset-x-0 bottom-14 z-20 flex items-center gap-3 border-t px-4 py-3 sm:px-6 lg:bottom-0 lg:left-64'
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
          >
            <p className='text-muted-foreground text-xs'>
              {t('castDiffSummary')
                .replace('{add}', String(added.length))
                .replace('{remove}', String(removed.length))}
            </p>
            <div className='ml-auto flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={saving}
                onClick={() => setWorking((prev) => ({ ...prev, current: new Set(prev.initial) }))}
              >
                {t('reset')}
              </Button>
              <Button
                size='sm'
                disabled={saving}
                onClick={() => {
                  void save();
                }}
              >
                {saving ? t('saving') : t('saveApparitions')}
              </Button>
            </div>
          </div>
        )
        : null}
    </div>
  );
}
