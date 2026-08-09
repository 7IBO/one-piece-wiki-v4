/**
 * Generic incoming-edge manager (ADR-097) — manage, from the TARGET
 * entity's page, the relation edges STORED ON OTHER entities: the
 * crew page edits its members' `member-of` edges (role, held_rank,
 * since…), an arc page edits which chapters point at it via
 * `part-of-arc`, a devil-fruit page its `ate-fruit` holders, etc.
 *
 * Fully schema-driven: the row list comes from the server's reverse
 * scan, qualifier inputs resolve through the same
 * `qualifierShapesFor` + `RelationQualifierField` machinery as the
 * relations editor, and the add-picker is a `MultiEntityRefInput`
 * restricted to the relation's `valid_from_types`.
 *
 * Save UX mirrors the cast manager (ADR-021): diff summary + Reset +
 * Save, one PR touching N entity files, toast with the PR link. A
 * 409 `multi_file_conflict` (another contributor's merge moved a
 * source file since load) surfaces the conflicting entities with a
 * Reload affordance.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  EntityTypeSchema,
  QualifierTypeSchema,
  RelationTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { Link } from '@tanstack/react-router';
import { Pencil, RotateCcw, X } from 'lucide-react';
import { type JSX, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type DisplayName,
  type IncomingEdgesResponse,
  multiFileConflictEntities,
  type SourceRef,
} from '../api';
import { MultiEntityRefInput } from '../form/inputs';
import { useLocale, useQualifierLabel, useT } from '../form/locale';
import { QualifierRowList } from '../form/QualifierSheet';
import { qualifierShapesFor, RelationQualifierField, summariseEdge } from '../form/RelationsEditor';
import { useApiResource } from '../hooks/use-api-resource';
import { LoadFailed } from './LoadFailed';

export type IncomingEdgesManagerProps = {
  readonly type: string;
  readonly slug: string;
  readonly relationTypeId: string;
  readonly relationTypes: Record<string, RelationTypeSchema>;
  readonly qualifierTypes: Record<string, QualifierTypeSchema>;
  readonly vocabularies: Record<string, VocabularySchema>;
  readonly entityTypes: Record<string, EntityTypeSchema>;
  readonly sources: readonly SourceRef[];
  readonly i18nKeys: readonly string[];
  readonly onClose: () => void;
};

type RowState = {
  readonly entityId: string;
  readonly entityType: string;
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly fileSha: string | null;
  readonly qualifiers: Record<string, unknown>;
};

function hasRealValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** Seed working rows from the server payload. Rows dedupe by source
 *  entity — the manager treats one (relation, target) pair per entity
 *  as ONE edge (same rule the save endpoint applies). */
function seedRows(data: IncomingEdgesResponse): Map<string, RowState> {
  const map = new Map<string, RowState>();
  for (const row of data.rows) {
    if (map.has(row.sourceEntityId)) continue;
    map.set(row.sourceEntityId, {
      entityId: row.sourceEntityId,
      entityType: row.entityType,
      slug: row.slug,
      displayName: row.displayName,
      fileSha: row.fileSha,
      qualifiers: { ...row.qualifiers },
    });
  }
  return map;
}

export function IncomingEdgesManager(p: IncomingEdgesManagerProps): JSX.Element {
  const t = useT();
  const locale = useLocale();
  const qualifierLabel = useQualifierLabel();

  const { data, error, reload } = useApiResource(
    () => api.getIncomingEdges(p.type, p.slug, p.relationTypeId),
    [p.type, p.slug, p.relationTypeId],
  );

  // Working copy — seeded render-time from the server payload (same
  // "you might not need an effect" pattern as the cast page).
  const [seededFrom, setSeededFrom] = useState<IncomingEdgesResponse | null>(null);
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [initialQualifiers, setInitialQualifiers] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (data !== seededFrom) {
    setSeededFrom(data);
    const seeded = data === null ? new Map<string, RowState>() : seedRows(data);
    setRows(seeded);
    setRemovedIds(new Set());
    setInitialQualifiers(
      new Map([...seeded.values()].map((r) => [r.entityId, JSON.stringify(r.qualifiers)])),
    );
    setExpandedId(null);
  }

  const relationType = p.relationTypes[p.relationTypeId];
  const shapes = useMemo(
    () => qualifierShapesFor(relationType, p.qualifierTypes, locale),
    [relationType, p.qualifierTypes, locale],
  );

  const entityTypeItems = useMemo(
    () =>
      Object.values(p.entityTypes)
        .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [p.entityTypes, locale],
  );

  const validFromTypes = useMemo(
    () =>
      (data?.relationType.valid_from_types ?? relationType?.valid_from_types
        ?? []) as readonly string[],
    [data, relationType],
  );

  const valueCtx = useMemo(
    () => ({
      enumValues: [],
      sources: p.sources,
      i18nKeys: p.i18nKeys,
      entityTypes: entityTypeItems,
    }),
    [p.sources, p.i18nKeys, entityTypeItems],
  );

  // ── Diff (drives the save payload + the summary line) ──
  const addIds = useMemo(
    () => [...rows.keys()].filter((id) => !initialQualifiers.has(id)),
    [rows, initialQualifiers],
  );
  const updateIds = useMemo(
    () =>
      [...rows.entries()]
        .filter(([id, row]) =>
          initialQualifiers.has(id)
          && !removedIds.has(id)
          && initialQualifiers.get(id) !== JSON.stringify(row.qualifiers)
        )
        .map(([id]) => id),
    [rows, initialQualifiers, removedIds],
  );
  const removeIds = useMemo(() => [...removedIds], [removedIds]);
  const dirty = addIds.length > 0 || updateIds.length > 0 || removeIds.length > 0;

  function setQualifier(entityId: string, qualifierId: string, value: unknown): void {
    setRows((prev) => {
      const row = prev.get(entityId);
      if (row === undefined) return prev;
      const qualifiers = { ...row.qualifiers };
      if (!hasRealValue(value)) delete qualifiers[qualifierId];
      else qualifiers[qualifierId] = value;
      const next = new Map(prev);
      next.set(entityId, { ...row, qualifiers });
      return next;
    });
  }

  function markRemoved(entityId: string): void {
    if (initialQualifiers.has(entityId)) {
      // Existing edge — keep the row visible with a "removed" badge so
      // the contributor can restore before saving.
      setRemovedIds((prev) => new Set([...prev, entityId]));
    } else {
      // Freshly-added row — just drop it.
      setRows((prev) => {
        const next = new Map(prev);
        next.delete(entityId);
        return next;
      });
    }
    setExpandedId((prev) => (prev === entityId ? null : prev));
  }

  function restore(entityId: string): void {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(entityId);
      return next;
    });
  }

  function resetAll(): void {
    if (data !== null) {
      const seeded = seedRows(data);
      setRows(seeded);
      setRemovedIds(new Set());
      setExpandedId(null);
    }
  }

  /** Reconcile the MultiEntityRefInput's full-list onChange with the
   *  row map: new ids become empty rows, missing ids are removed (or
   *  marked removed when they exist server-side). */
  function reconcilePicker(nextIds: readonly string[]): void {
    const nextSet = new Set(nextIds);
    setRows((prev) => {
      const next = new Map(prev);
      for (const id of nextIds) {
        if (next.has(id)) continue;
        const [entityType = '', entitySlug = ''] = id.split(':');
        next.set(id, {
          entityId: id,
          entityType,
          slug: entitySlug,
          displayName: { en: null, fr: null },
          fileSha: null,
          qualifiers: {},
        });
      }
      for (const id of prev.keys()) {
        if (!nextSet.has(id) && !initialQualifiers.has(id)) next.delete(id);
      }
      return next;
    });
    setRemovedIds(() => {
      // A server-side row absent from the picker value is marked
      // removed; present again → restored.
      const next = new Set<string>();
      for (const id of initialQualifiers.keys()) {
        if (!nextSet.has(id)) next.add(id);
      }
      return next;
    });
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const touched = new Set([...addIds, ...updateIds, ...removeIds]);
      const expected: { entityId: string; sha: string; }[] = [];
      for (const id of touched) {
        const sha = rows.get(id)?.fileSha ?? null;
        if (sha !== null) expected.push({ entityId: id, sha });
      }
      const result = await api.saveIncomingEdges(p.type, p.slug, p.relationTypeId, {
        add: addIds.map((id) => ({ entityId: id, qualifiers: rows.get(id)?.qualifiers ?? {} })),
        update: updateIds.map((id) => ({
          entityId: id,
          qualifiers: rows.get(id)?.qualifiers ?? {},
        })),
        remove: removeIds,
        expected,
      });
      if (result.pr.noOp) {
        toast.info(t('nothingChanged'));
        return;
      }
      toast.success(t('incomingPrOpened').replace('{n}', String(result.pr.number)), {
        description: result.pr.htmlUrl,
        action: {
          label: t('openPr'),
          onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
        },
      });
      // Reload to re-seed the baseline (fresh qualifiers + SHAs).
      reload();
    } catch (err) {
      const conflicted = multiFileConflictEntities(err);
      if (conflicted !== null) {
        toast.error(
          t('incomingConflict')
            .replace('{n}', String(conflicted.length))
            .replace('{entities}', conflicted.join(', ')),
          {
            action: { label: t('incomingReload'), onClick: () => reload() },
          },
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('saveFailed').replace('{message}', message));
    } finally {
      setSaving(false);
    }
  }

  const relationLabel = relationType?.labels[locale]?.inverse
    ?? relationType?.labels.en.inverse
    ?? p.relationTypeId;

  if (error !== null) {
    return (
      <div className='border-border rounded-md border p-3'>
        <LoadFailed message={error} onRetry={reload} />
      </div>
    );
  }

  const rowList = [...rows.values()].sort((a, b) =>
    a.entityType === b.entityType
      ? (a.displayName.en ?? a.slug).localeCompare(b.displayName.en ?? b.slug)
      : a.entityType.localeCompare(b.entityType)
  );

  return (
    <div className='border-border bg-card/40 space-y-3 rounded-lg border p-3'>
      <div className='flex items-center gap-2'>
        <h3 className='min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide'>
          {t('incomingManage')} · {relationLabel}
        </h3>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6 shrink-0'
          onClick={p.onClose}
          aria-label={t('close')}
        >
          <X className='size-3.5' />
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>{t('incomingManagerHint')}</p>

      {data === null
        ? (
          <div className='space-y-2'>
            <Skeleton className='h-4 w-48' />
            <Skeleton className='h-4 w-56' />
          </div>
        )
        : (
          <>
            <ul className='divide-border divide-y rounded-md border'>
              {rowList.length === 0
                ? (
                  <li className='text-muted-foreground px-3 py-3 text-xs'>
                    {t('incomingEmpty')}
                  </li>
                )
                : rowList.map((row) => {
                  const removed = removedIds.has(row.entityId);
                  const added = !initialQualifiers.has(row.entityId);
                  const edited = !added && !removed
                    && initialQualifiers.get(row.entityId) !== JSON.stringify(row.qualifiers);
                  const name = row.displayName[locale] ?? row.displayName.en ?? row.slug;
                  // Same compact summary as every other link row
                  // (labels via the qualifier registry, enum values
                  // via vocabularies, `since` compacted "C96"-style).
                  const summary = summariseEdge(
                    { type: p.relationTypeId, target: row.entityId, qualifiers: row.qualifiers },
                    shapes,
                    { vocabularies: p.vocabularies, sources: p.sources, locale, qualifierLabel },
                  );
                  const qualifierText = [summary.text, summary.since]
                    .filter((s): s is string => s !== null && s !== '')
                    .join(' · ');
                  const expanded = expandedId === row.entityId;
                  const setIds = new Set(
                    shapes.filter((s) => hasRealValue(row.qualifiers[s.id])).map((s) => s.id),
                  );
                  return (
                    <li key={row.entityId} className='px-3 py-2'>
                      <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm'>
                        {row.slug !== ''
                          ? (
                            <Link
                              to='/types/$type/$slug'
                              params={{ type: row.entityType, slug: row.slug }}
                              className={`font-medium hover:underline ${
                                removed ? 'text-muted-foreground line-through' : ''
                              }`}
                            >
                              {name}
                            </Link>
                          )
                          : <span className='font-mono text-xs'>{row.entityId}</span>}
                        {added
                          ? (
                            <Badge variant='outline' className='text-primary text-[10px]'>
                              {t('incomingAddedBadge')}
                            </Badge>
                          )
                          : null}
                        {edited
                          ? (
                            <Badge variant='outline' className='text-amber-500 text-[10px]'>
                              {t('incomingEditedBadge')}
                            </Badge>
                          )
                          : null}
                        {removed
                          ? (
                            <Badge variant='outline' className='text-destructive text-[10px]'>
                              {t('incomingRemovedBadge')}
                            </Badge>
                          )
                          : null}
                        {qualifierText !== '' && !expanded
                          ? (
                            <span className='text-muted-foreground min-w-0 text-xs'>
                              {qualifierText}
                            </span>
                          )
                          : null}
                        <span className='ml-auto flex shrink-0 items-center'>
                          {!removed
                            ? (
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='size-7'
                                aria-expanded={expanded}
                                aria-label={`${t('incomingManage')} — ${name}`}
                                onClick={() =>
                                  setExpandedId((prev) =>
                                    prev === row.entityId ? null : row.entityId
                                  )}
                              >
                                <Pencil className='size-3.5' />
                              </Button>
                            )
                            : null}
                          {removed
                            ? (
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='size-7'
                                onClick={() => restore(row.entityId)}
                                aria-label={t('incomingRestoreRow')}
                              >
                                <RotateCcw className='size-3.5' />
                              </Button>
                            )
                            : (
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='size-7'
                                onClick={() => markRemoved(row.entityId)}
                                aria-label={t('incomingRemoveRow')}
                              >
                                <X className='size-3.5' />
                              </Button>
                            )}
                        </span>
                      </div>
                      {expanded && !removed
                        ? (
                          <div className='border-border/40 mt-2 border-t pt-2'>
                            <QualifierRowList
                              qualifiers={shapes.map((s) => ({
                                id: s.id,
                                label: qualifierLabel(s.id, s.label),
                              }))}
                              setIds={setIds}
                              renderField={(id) => {
                                const shape = shapes.find((s) => s.id === id);
                                if (shape === undefined) return null;
                                return (
                                  <RelationQualifierField
                                    key={id}
                                    id={id}
                                    label={shape.label}
                                    valueType={shape.valueType}
                                    enumRef={shape.enumRef}
                                    required={shape.required}
                                    restrictTo={shape.entityTypeFilter}
                                    multi={shape.multi}
                                    value={row.qualifiers[id]}
                                    valueCtx={valueCtx}
                                    vocabularies={p.vocabularies}
                                    onChange={(v) => setQualifier(row.entityId, id, v)}
                                  />
                                );
                              }}
                            />
                          </div>
                        )
                        : null}
                    </li>
                  );
                })}
            </ul>

            <MultiEntityRefInput
              value={[...rows.keys()].filter((id) => !removedIds.has(id))}
              onChange={reconcilePicker}
              entityTypes={entityTypeItems}
              restrictTo={validFromTypes}
            />

            {dirty
              ? (
                <div className='border-border flex flex-wrap items-center gap-2 border-t pt-2'>
                  <p className='text-muted-foreground text-xs'>
                    {t('incomingDiffSummary')
                      .replace('{add}', String(addIds.length))
                      .replace('{update}', String(updateIds.length))
                      .replace('{remove}', String(removeIds.length))}
                  </p>
                  <div className='ml-auto flex items-center gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={saving}
                      onClick={resetAll}
                    >
                      {t('reset')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      disabled={saving}
                      onClick={() => {
                        void save();
                      }}
                    >
                      {saving ? t('saving') : t('incomingSave')}
                    </Button>
                  </div>
                </div>
              )
              : null}
          </>
        )}
    </div>
  );
}
