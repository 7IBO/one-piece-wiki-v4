/**
 * Relations editor — manages an entity's outgoing relations with the
 * same read-first layout as the property rows (2026-08 feedback:
 * "même design pour les propriétés relation").
 *
 * Each entry of `entity.relations` is `{ type, target, qualifiers? }`
 * where `type` is the relation-type id, `target` is an entity id, and
 * `qualifiers` is an open-ended object (since/until/role/source/…).
 *
 * Read view: edges grouped by relation type (localized `active`
 * label), one full-width line per edge — target display name, compact
 * qualifier summary (labels via the qualifier registry, enum values
 * via vocabularies), `since` compacted "C96"-style — ending in a
 * chevron. Clicking a line opens THE edge editor: a SideSheet on
 * mobile, an inline bordered panel in a right-hand column of the
 * relations block on desktop (same dual-mode as the property entry
 * editor). The editor holds the target picker plus EVERY qualifier
 * of the relation type via QualifierRowList, and a remove button.
 *
 * Closing the editor of an edge whose target is still empty DELETES
 * the edge — mirroring the property entries' "backing out of a
 * never-filled entry discards it" rule.
 *
 * Qualifier definitions come from two sources:
 *  1. The relation-type schema's `qualifiers[]` (declared per type).
 *  2. A small set of universal base qualifiers (source,
 *     epistemic_status, event, assisted_by, review_status) that apply
 *     to every relation just like they do to property entries.
 *
 * `InferredRelations` (exported separately, rendered by the entity
 * route below the form) lists the INCOMING edges of the entity —
 * relations stored on other entities whose inverse the pipeline
 * generates — read-only with an "auto" badge, so a maintainer sees
 * that storing one direction is enough (the inverse "exists" without
 * duplicating the JSON).
 */
import { formatQualifiers, type LabelCtx } from '@/components/EntityLinksPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import {
  ENTITY_REF_ITEM_QUALIFIER_IDS,
  entityRefItems,
  entityRefItemSources,
  type EntityTypeSchema,
  type QualifierTypeSchema,
  type RelationTypeSchema,
  type VocabularySchema,
} from '@onepiece-wiki/schemas';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Pencil, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type EntityRef, type IncomingLinkRow, type SourceRef } from '../api';
import { useApiResource } from '../hooks/use-api-resource';
import {
  EntityRefItemsInput,
  type EnumValue,
  MultiEntityRefInput,
  MultiSourceRefInput,
  ValueInput,
  type ValueInputContext,
  type ValueType,
} from './inputs';
import { type Locale, useLocale, useQualifierLabel, useT } from './locale';
import { relationAnchorId } from './PropertyNav';
import { QualifierRowList, SideSheet } from './QualifierSheet';

export type RelationEntry = {
  type: string;
  target: string;
  qualifiers?: Record<string, unknown> | undefined;
};

export type RelationsEditorProps = {
  entityType: EntityTypeSchema;
  relationTypes: Record<string, RelationTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
  /** Qualifier registry (ADR-078) — labels for relation-declared
   *  qualifiers (relation_kind, known_publicly_since, …) resolve here
   *  before falling back to a humanised id. */
  qualifierTypes: Record<string, QualifierTypeSchema>;
  valueCtx: ValueInputContext;
  relations: readonly RelationEntry[];
  onChange: (next: RelationEntry[]) => void;
};

type QualifierShape = {
  readonly id: string;
  readonly label: string;
  readonly valueType: ValueType;
  readonly enumRef?: string | undefined;
  readonly required?: boolean | undefined;
  readonly entityTypeFilter?: readonly string[] | undefined;
  readonly multi?: boolean | undefined;
};

/**
 * Universal qualifiers available on every relation, mirroring the
 * base qualifiers on historisable property entries.
 */
const BASE_RELATION_QUALIFIERS: readonly QualifierShape[] = [
  { id: 'source', label: 'Source', valueType: 'source_ref', multi: true },
  {
    id: 'epistemic_status',
    label: 'Epistemic status',
    valueType: 'enum',
    enumRef: 'epistemic-statuses',
  },
  {
    id: 'event',
    label: 'Event',
    valueType: 'entity_ref',
    entityTypeFilter: ['event'],
  },
  {
    id: 'believed_by',
    label: 'Believed by',
    valueType: 'entity_ref',
    entityTypeFilter: ['character'],
    multi: true,
  },
  {
    id: 'known_truth_by',
    label: 'Known truth by',
    valueType: 'entity_ref',
    entityTypeFilter: ['character'],
    multi: true,
  },
  { id: 'assisted_by', label: 'Assisted by', valueType: 'string' },
  {
    id: 'review_status',
    label: 'Review status',
    valueType: 'enum',
    enumRef: 'review-statuses',
  },
];

/**
 * Full qualifier list for a relation type: the schema-declared
 * qualifiers (in declaration order, `since`/`until` included) followed
 * by the universal base set minus anything the type already declares.
 * Declared labels resolve through the qualifier registry (ADR-078)
 * before falling back to a humanised id. Declared `source_ref`
 * qualifiers (since/until/…) edit as stacked multi-source pickers,
 * same as property entries.
 */
function qualifierShapesFor(
  relationType: RelationTypeSchema | undefined,
  qualifierTypes: Record<string, QualifierTypeSchema>,
  locale: Locale,
): readonly QualifierShape[] {
  const declared = (relationType?.qualifiers ?? []).map((q): QualifierShape => {
    const id = String(q.id);
    const qt = qualifierTypes[id];
    return {
      id,
      label: qt?.labels[locale] ?? qt?.labels.en ?? humanize(id),
      valueType: q.value_type as ValueType,
      ...(q.enum_ref !== undefined ? { enumRef: q.enum_ref } : {}),
      ...(q.required === true ? { required: true } : {}),
      ...(q.value_type === 'source_ref' ? { multi: true } : {}),
    };
  });
  const declaredIds = new Set(declared.map((d) => d.id));
  return [...declared, ...BASE_RELATION_QUALIFIERS.filter((q) => !declaredIds.has(q.id))];
}

/** Compact per-type source abbreviations for provenance summaries
 *  ("C96 · E45") — same convention as the property rows' since
 *  column. Unknown types fall back to the number/slug. */
const SOURCE_ABBR: Record<string, string> = {
  'manga-chapter': 'C',
  'anime-episode': 'E',
  film: 'F',
  sbs: 'SBS ',
  databook: 'DB ',
  'databook-card': 'VC ',
};

/** "C96 · E45" for a source_ref value (string or array). Null when
 *  nothing usable is set. */
function shortSourceRefLabel(
  raw: unknown,
  sources: readonly SourceRef[],
): string | null {
  const ids = Array.isArray(raw)
    ? (raw as unknown[]).map(String).filter((s) => s !== '')
    : typeof raw === 'string' && raw !== ''
    ? [raw]
    : [];
  if (ids.length === 0) return null;
  return ids
    .map((id) => {
      const [type, slug] = id.split(':');
      const src = sources.find((s) => s.id === id);
      const short = src?.number ?? slug ?? id;
      const abbr = SOURCE_ABBR[type ?? ''];
      return abbr !== undefined ? `${abbr}${short}` : String(short);
    })
    .join(' · ');
}

function hasRealValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** One qualifier value → compact display string, driven by the
 *  qualifier's shape: enum ids resolve through their vocabulary,
 *  source refs compact to "C96", entity refs show their slug. */
function formatShapedValue(
  value: unknown,
  shape: QualifierShape | undefined,
  vocabularies: Record<string, VocabularySchema>,
  sources: readonly SourceRef[],
  locale: Locale,
): string {
  if (shape?.valueType === 'source_ref') {
    return shortSourceRefLabel(value, sources) ?? '';
  }
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map((v) => formatShapedValue(v, shape, vocabularies, sources, locale))
      .filter((s) => s !== '')
      .join(', ');
  }
  if (typeof value === 'string') {
    if (shape?.enumRef !== undefined) {
      const vv = vocabularies[shape.enumRef]?.values[value];
      if (vv !== undefined) return vv.labels[locale] ?? vv.labels.en;
    }
    if (shape?.valueType === 'entity_ref' && value.includes(':')) {
      return value.split(':')[1] ?? value;
    }
    return value;
  }
  if (typeof value === 'boolean') return value ? '✓' : '×';
  if (typeof value === 'number') return String(value);
  // ADR-096 — believed_by / known_truth_by items may carry per-item
  // provenance as `{ target, source? }`: render "luffy (C585)".
  if (value !== null && typeof value === 'object') {
    const [item] = entityRefItems([value]);
    if (item !== undefined) {
      const head = formatShapedValue(item.target, shape, vocabularies, sources, locale);
      const compact = shortSourceRefLabel(entityRefItemSources(item), sources);
      return compact !== null ? `${head} (${compact})` : head;
    }
  }
  return JSON.stringify(value) ?? '';
}

type EdgeSummary = {
  /** "Camp : Captif · Issue : Tué" — every populated qualifier except
   *  `since`, labels via registry, enum values via vocabularies. */
  readonly text: string;
  /** Compact `since` provenance ("C96"), rendered as its own column. */
  readonly since: string | null;
};

function summariseEdge(
  entry: RelationEntry,
  shapes: readonly QualifierShape[],
  args: {
    vocabularies: Record<string, VocabularySchema>;
    sources: readonly SourceRef[];
    locale: Locale;
    qualifierLabel: (id: string, fallback: string) => string;
  },
): EdgeSummary {
  const qualifiers = entry.qualifiers ?? {};
  const since = shortSourceRefLabel(qualifiers['since'], args.sources);
  const shapeById = new Map(shapes.map((s) => [s.id, s]));
  // Shape order first (declared, then base), unknown keys last.
  const orderedIds = [
    ...shapes.map((s) => s.id).filter((id) => id in qualifiers),
    ...Object.keys(qualifiers).filter((id) => !shapeById.has(id)),
  ];
  const parts: string[] = [];
  for (const id of orderedIds) {
    if (id === 'since') continue; // own column
    const value = qualifiers[id];
    if (!hasRealValue(value)) continue;
    const shape = shapeById.get(id);
    const label = args.qualifierLabel(id, shape?.label ?? humanize(id));
    const formatted = formatShapedValue(
      value,
      shape,
      args.vocabularies,
      args.sources,
      args.locale,
    );
    if (formatted === '') continue;
    parts.push(`${label} : ${formatted}`);
  }
  return { text: parts.join(' · '), since };
}

export function RelationsEditor(p: RelationsEditorProps): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const qualifierLabel = useQualifierLabel();

  const allowedTypeIds = useMemo(
    () => p.entityType.allowed_relations.filter((id) => p.relationTypes[id] !== undefined),
    [p.entityType, p.relationTypes],
  );

  const adderItems = useMemo(
    () =>
      allowedTypeIds.map((id) => {
        const rt = p.relationTypes[id]!;
        const label = relationLabel(rt, locale);
        return { value: id, label, searchText: `${label} ${id}` };
      }),
    [allowedTypeIds, p.relationTypes, locale],
  );

  // Which edge (index into `relations`) is open in the editor surface.
  // ONE surface serves the whole block: a side sheet on mobile, an
  // inline right-hand panel on desktop — same dual-mode as the
  // property entry editor.
  const [selected, setSelected] = useState<number | null>(null);
  // lg breakpoint, decided post-hydration (SSR renders the sheet
  // variant markup — it's portaled and closed, so nothing shows).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent): void => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  function update(idx: number, next: Partial<RelationEntry>): void {
    const list = p.relations.slice() as RelationEntry[];
    const current = list[idx];
    if (current === undefined) return;
    list[idx] = { ...current, ...next };
    p.onChange(list);
  }

  function setQualifier(idx: number, qualifierId: string, value: unknown): void {
    const list = p.relations.slice() as RelationEntry[];
    const current = list[idx];
    if (current === undefined) return;
    const qualifiers = { ...current.qualifiers };
    if (!hasRealValue(value)) {
      delete qualifiers[qualifierId];
    } else {
      qualifiers[qualifierId] = value;
    }
    list[idx] = {
      ...current,
      qualifiers: Object.keys(qualifiers).length > 0 ? qualifiers : undefined,
    };
    p.onChange(list);
  }

  function remove(idx: number): void {
    const list = p.relations.slice();
    list.splice(idx, 1);
    p.onChange(list as RelationEntry[]);
    // Keep the editor pointer coherent with the shifted list.
    setSelected((prev) => {
      if (prev === null) return null;
      if (prev === idx) return null;
      return prev > idx ? prev - 1 : prev;
    });
  }

  /** Move the editor to another edge (or close it via `null`). If the
   *  edge being left never got a target, it is DISCARDED — mirror of
   *  the property entries' "backing out of a never-filled entry"
   *  rule, so phantom empty rows can't linger. */
  function selectEdge(idx: number | null): void {
    if (selected !== null && selected !== idx) {
      const current = p.relations[selected];
      if (current !== undefined && current.target === '') {
        const list = p.relations.slice();
        list.splice(selected, 1);
        p.onChange(list as RelationEntry[]);
        setSelected(idx !== null && idx > selected ? idx - 1 : idx);
        return;
      }
    }
    setSelected(idx);
  }

  /** "+ Add relation": append a blank edge of the picked type and open
   *  its editor straight away (the target picker sits on top). */
  function add(typeId: string): void {
    const list = p.relations.slice() as RelationEntry[];
    // Adding while an empty edge is open discards that edge first.
    if (selected !== null && list[selected]?.target === '') {
      list.splice(selected, 1);
    }
    list.push({ type: typeId, target: '' });
    p.onChange(list);
    setSelected(list.length - 1);
  }

  // Group entries by type so each relation type renders ONE group
  // (label + stacked edge lines), in the order types first appear.
  type GroupedEntry = { entry: RelationEntry; index: number; };
  const groupedByType = useMemo(() => {
    const map = new Map<string, GroupedEntry[]>();
    p.relations.forEach((entry, index) => {
      const list = map.get(entry.type) ?? [];
      list.push({ entry, index });
      map.set(entry.type, list);
    });
    return map;
  }, [p.relations]);

  // Display names for every possible target of the types in use.
  // Key-memoised so the array identity only changes when the SET of
  // target types changes, not on every qualifier keystroke.
  const targetTypesKey = useMemo(() => {
    const s = new Set<string>();
    for (const typeId of groupedByType.keys()) {
      for (const target of p.relationTypes[typeId]?.valid_to_types ?? []) {
        s.add(String(target));
      }
    }
    return [...s].sort().join('|');
  }, [groupedByType, p.relationTypes]);
  const targetTypeIds = useMemo(
    () => (targetTypesKey === '' ? [] : targetTypesKey.split('|')),
    [targetTypesKey],
  );
  const nameLookup = useEntityNameLookup(targetTypeIds, locale);

  // Qualifier shapes per relation type in use — shared by the row
  // summaries and the editor.
  const shapesByType = useMemo(() => {
    const map = new Map<string, readonly QualifierShape[]>();
    for (const typeId of groupedByType.keys()) {
      map.set(typeId, qualifierShapesFor(p.relationTypes[typeId], p.qualifierTypes, locale));
    }
    return map;
  }, [groupedByType, p.relationTypes, p.qualifierTypes, locale]);

  const activeEdge = selected !== null ? p.relations[selected] : undefined;
  const activeRelationType = activeEdge !== undefined
    ? p.relationTypes[activeEdge.type]
    : undefined;
  const activeIndex = selected;
  const editorOpen = activeEdge !== undefined && activeIndex !== null;
  const activeTargetName = activeEdge !== undefined
    ? resolveTargetName(activeEdge.target, nameLookup)
    : '';
  const editorTitle = activeEdge === undefined
    ? ''
    : activeEdge.target !== '' && activeTargetName !== ''
    ? `${activeTargetName} · ${
      activeRelationType !== undefined
        ? relationLabel(activeRelationType, locale)
        : activeEdge.type
    }`
    : activeRelationType !== undefined
    ? relationLabel(activeRelationType, locale)
    : activeEdge.type;

  const editorFields = editorOpen
    ? (
      <RelationEdgeFields
        edge={activeEdge}
        relationType={activeRelationType}
        shapes={activeRelationType !== undefined
          ? (shapesByType.get(activeEdge.type)
            ?? qualifierShapesFor(activeRelationType, p.qualifierTypes, locale))
          : qualifierShapesFor(undefined, p.qualifierTypes, locale)}
        valueCtx={p.valueCtx}
        vocabularies={p.vocabularies}
        onTargetChange={(target) => update(activeIndex, { target })}
        onSetQualifier={(qid, v) => setQualifier(activeIndex, qid, v)}
      />
    )
    : null;

  const removeButton = editorOpen
    ? (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full gap-1.5'
        onClick={() => remove(activeIndex)}
      >
        <X className='size-3.5' />
        {t('removeRelation')}
      </Button>
    )
    : null;

  return (
    <section className='space-y-3'>
      <div className='flex items-baseline justify-between'>
        <h2 className='text-base font-semibold'>{t('relations')}</h2>
        <span className='text-muted-foreground text-xs'>
          {p.relations.length} {t('total')}
        </span>
      </div>

      {
        /* Desktop editing slot: when an edge is selected the group
          list narrows and the editor renders INLINE to its right —
          a local two-column grid, not a popover. On mobile the
          editor stays a side sheet. */
      }
      <div
        className={editorOpen && isDesktop
          ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start gap-5'
          : 'min-w-0'}
      >
        <div className='min-w-0 space-y-3'>
          {p.relations.length === 0
            ? (
              <div className='text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs'>
                {t('noRelations')}
              </div>
            )
            : (
              <ul className='space-y-3'>
                {[...groupedByType.entries()].map(([typeId, groupEntries]) => {
                  const rt = p.relationTypes[typeId];
                  const shapes = shapesByType.get(typeId) ?? [];
                  return (
                    <li
                      key={typeId}
                      id={relationAnchorId(typeId)}
                      className='scroll-mt-20'
                    >
                      <Label className='text-muted-foreground text-xs font-semibold uppercase tracking-wide'>
                        {rt !== undefined ? relationLabel(rt, locale) : typeId}
                      </Label>
                      <div className='mt-0.5 space-y-0.5'>
                        {groupEntries.map(({ entry, index }) => {
                          const name = resolveTargetName(entry.target, nameLookup);
                          const summary = summariseEdge(entry, shapes, {
                            vocabularies: p.vocabularies,
                            sources: p.valueCtx.sources,
                            locale,
                            qualifierLabel,
                          });
                          return (
                            <button
                              key={index}
                              type='button'
                              onClick={() => selectEdge(index)}
                              aria-haspopup='dialog'
                              className={`-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors ${
                                selected === index ? 'bg-accent/60' : 'hover:bg-accent/40'
                              }`}
                            >
                              <span className='min-w-0 flex-1 break-words text-sm'>
                                {name !== ''
                                  ? name
                                  : <span className='text-amber-600 italic'>{t('notSet')}</span>}
                                {summary.text !== ''
                                  ? (
                                    <span className='text-muted-foreground ml-2 text-xs'>
                                      {summary.text}
                                    </span>
                                  )
                                  : null}
                              </span>
                              {summary.since !== null
                                ? (
                                  <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                                    {summary.since}
                                  </span>
                                )
                                : null}
                              <ChevronRight
                                className='text-muted-foreground/60 size-3.5 shrink-0'
                                aria-hidden
                              />
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

          {allowedTypeIds.length > 0
            ? (
              <Combobox
                value={undefined}
                onChange={(typeId) => add(typeId)}
                items={adderItems}
                placeholder={`+ ${t('addRelation')} (${allowedTypeIds.length} ${
                  t('typesAvailable')
                })`}
                emptyText={t('noMatch')}
              />
            )
            : null}
        </div>

        {editorOpen && isDesktop
          ? (
            <div className='sticky top-4'>
              <div className='border-border bg-card/40 rounded-lg border'>
                <div className='border-border flex items-center gap-2 border-b px-3 py-2.5'>
                  <h3 className='min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide'>
                    {editorTitle}
                  </h3>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-6 shrink-0'
                    onClick={() => selectEdge(null)}
                    aria-label={t('close')}
                  >
                    <X className='size-3.5' />
                  </Button>
                </div>
                <div className='space-y-3 px-3 py-3'>
                  {editorFields}
                </div>
                <div className='border-border border-t px-3 py-2'>{removeButton}</div>
              </div>
            </div>
          )
          : null}
      </div>

      {editorOpen && !isDesktop
        ? (
          <SideSheet
            open
            onClose={() => selectEdge(null)}
            title={editorTitle}
            {...(removeButton !== null ? { footer: removeButton } : {})}
          >
            {editorFields}
          </SideSheet>
        )
        : null}
    </section>
  );
}

/** Shared body of the edge editor: target picker on top, then EVERY
 *  qualifier of the relation type in the list-all pattern. */
function RelationEdgeFields(p: {
  edge: RelationEntry;
  relationType: RelationTypeSchema | undefined;
  shapes: readonly QualifierShape[];
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  onTargetChange: (target: string) => void;
  onSetQualifier: (qid: string, value: unknown) => void;
}): JSX.Element {
  const qLabel = useQualifierLabel();
  const qualifiers = p.edge.qualifiers ?? {};

  const shapeById = useMemo(
    () => new Map(p.shapes.map((q) => [q.id, q])),
    [p.shapes],
  );

  const setIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of p.shapes) {
      if (hasRealValue(qualifiers[q.id])) s.add(q.id);
    }
    return s;
  }, [p.shapes, qualifiers]);

  return (
    <>
      <div className='border-border/40 border-b pb-3'>
        <RelationQualifierField
          id='target'
          label={humanize('target')}
          valueType='entity_ref'
          restrictTo={p.relationType?.valid_to_types}
          required
          value={p.edge.target}
          valueCtx={p.valueCtx}
          vocabularies={p.vocabularies}
          onChange={(v) => p.onTargetChange(typeof v === 'string' ? v : '')}
        />
      </div>

      {p.shapes.length > 0
        ? (
          <QualifierRowList
            qualifiers={p.shapes.map((q) => ({
              id: q.id,
              label: qLabel(q.id, q.label),
            }))}
            setIds={setIds}
            renderField={(id) => {
              const q = shapeById.get(id);
              if (q === undefined) return null;
              return (
                <RelationQualifierField
                  key={id}
                  id={id}
                  label={q.label}
                  valueType={q.valueType}
                  enumRef={q.enumRef}
                  required={q.required}
                  restrictTo={q.entityTypeFilter}
                  multi={q.multi}
                  value={qualifiers[id]}
                  valueCtx={p.valueCtx}
                  vocabularies={p.vocabularies}
                  onChange={(v) => p.onSetQualifier(id, v)}
                />
              );
            }}
          />
        )
        : null}
    </>
  );
}

function relationLabel(rt: RelationTypeSchema, locale: Locale): string {
  return rt.labels[locale]?.active ?? rt.labels.en.active;
}

/** Format `type:slug` for display, preferring the loaded translated
 *  name when available. Falls back to the slug (then the full id)
 *  so empty / loading states stay readable. */
function resolveTargetName(
  targetId: string,
  lookup: ReadonlyMap<string, string>,
): string {
  const cached = lookup.get(targetId);
  if (cached !== undefined && cached !== '') return cached;
  const [, slug] = targetId.split(':');
  return slug !== undefined && slug !== '' ? slug : targetId;
}

/**
 * Load entity refs for every allowed target type in parallel and
 * expose a `Map<entityId, displayName>`. Cached at the api layer, so
 * multiple instances of the same lookup share the underlying fetch.
 */
function useEntityNameLookup(
  allowedTypeIds: readonly string[],
  locale: Locale,
): ReadonlyMap<string, string> {
  const [entries, setEntries] = useState<readonly EntityRef[]>([]);
  useEffect(() => {
    if (allowedTypeIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      allowedTypeIds.map((id) => api.listEntities(id).catch(() => [] as readonly EntityRef[])),
    ).then((lists) => {
      if (cancelled) return;
      setEntries(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [allowedTypeIds]);
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) {
      const name = e.displayName[locale] ?? e.displayName.en ?? e.displayName.fr ?? String(e.slug);
      m.set(e.id, name);
    }
    return m;
  }, [entries, locale]);
}

function RelationQualifierField(
  p: {
    id: string;
    label: string;
    valueType: ValueType;
    enumRef?: string | undefined;
    required?: boolean | undefined;
    restrictTo?: readonly string[] | undefined;
    multi?: boolean | undefined;
    value: unknown;
    valueCtx: ValueInputContext;
    vocabularies: Record<string, VocabularySchema>;
    onChange: (next: unknown) => void;
  },
): JSX.Element {
  const qLabel = useQualifierLabel();
  const enumValues = useMemo<readonly EnumValue[]>(() => {
    if (p.valueType !== 'enum' && p.valueType !== 'multi_enum') return [];
    if (p.enumRef === undefined) return p.valueCtx.enumValues;
    const vocab = p.vocabularies[p.enumRef];
    if (vocab === undefined) return [];
    return Object.entries(vocab.values).map(([id, v]) => ({
      id,
      labels: { en: v.labels.en, fr: v.labels.fr },
    }));
  }, [p.valueType, p.enumRef, p.valueCtx.enumValues, p.vocabularies]);

  const ctx: ValueInputContext = {
    enumValues,
    sources: p.valueCtx.sources,
    i18nKeys: p.valueCtx.i18nKeys,
    entityTypes: p.valueCtx.entityTypes,
  };

  const isMultiEntityRef = p.multi === true && p.valueType === 'entity_ref';
  const isMultiSourceRef = p.multi === true && p.valueType === 'source_ref';
  // ADR-096 — believed_by / known_truth_by carry per-item provenance;
  // they get the item-aware editor instead of the plain multi picker.
  const isEntityRefItemList = isMultiEntityRef
    && (ENTITY_REF_ITEM_QUALIFIER_IDS as readonly string[]).includes(p.id);
  const multiList = isMultiEntityRef && !isEntityRefItemList
    ? (Array.isArray(p.value)
      ? (p.value as unknown[]).map((v) => String(v ?? ''))
      : (typeof p.value === 'string' && p.value !== '' ? [p.value] : []))
    : null;

  return (
    <div className='space-y-1'>
      <Label className='text-muted-foreground text-[10px] uppercase tracking-wide'>
        {qLabel(p.id, p.label)}
        {p.required === true ? <span className='text-destructive'>*</span> : null}
      </Label>
      {isEntityRefItemList
        ? (
          <EntityRefItemsInput
            value={p.value}
            onChange={(next) => p.onChange(next)}
            entityTypes={p.valueCtx.entityTypes}
            restrictTo={p.restrictTo}
            sources={p.valueCtx.sources}
          />
        )
        : multiList !== null
        ? (
          <MultiEntityRefInput
            value={multiList}
            onChange={(next) => p.onChange(next.length === 0 ? undefined : next)}
            entityTypes={p.valueCtx.entityTypes}
            restrictTo={p.restrictTo}
          />
        )
        : isMultiSourceRef
        ? (
          <MultiSourceRefInput
            value={p.value}
            onChange={p.onChange}
            sources={p.valueCtx.sources}
          />
        )
        : (
          <ValueInput
            valueType={p.valueType}
            value={p.value}
            ctx={ctx}
            onChange={p.onChange}
            restrictTo={p.restrictTo}
          />
        )}
    </div>
  );
}

function humanize(id: string): string {
  return id
    .split(/[_-]/)
    .map((p) => p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p)
    .join(' ');
}

export type InferredRelationsProps = {
  /** Entity coordinates for `GET /api/entities/:type/:slug/links`. */
  entityType: string;
  entitySlug: string;
  relationTypes: Record<string, RelationTypeSchema>;
  qualifierTypes: Record<string, QualifierTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
};

/**
 * Read-only "inverse relations (automatic)" section — the INCOMING
 * edges of the entity, i.e. relations stored on OTHER entities whose
 * inverse the build pipeline generates. Nothing here is editable:
 * the JSON stores one direction only (by design), so each row wears
 * an "auto" badge and links to the entity that stores the edge.
 *
 * Rendered by the entity route between the form and the links panel
 * (RelationsEditor itself is instantiated inside EntityForm without
 * type/slug, so this lives in its own component). Renders nothing
 * while loading, on error (the links panel below owns error
 * reporting + retry), or when there is no incoming edge — no layout
 * shift for the common case.
 */
export function InferredRelations(p: InferredRelationsProps): JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { data } = useApiResource(
    () => api.entityLinks(p.entityType, p.entitySlug),
    [p.entityType, p.entitySlug],
  );

  const incoming: readonly IncomingLinkRow[] = data?.incoming ?? [];
  // Group by relation type, first-seen order — same as the outgoing
  // groups above, but labelled with the type's INVERSE label since
  // the rows read from this entity's point of view.
  const groups = useMemo(() => {
    const map = new Map<string, IncomingLinkRow[]>();
    for (const row of incoming) {
      const list = map.get(row.relationType) ?? [];
      list.push(row);
      map.set(row.relationType, list);
    }
    return [...map.entries()];
  }, [incoming]);

  if (incoming.length === 0) return null;

  const ctx: LabelCtx = {
    relationTypes: p.relationTypes,
    qualifierTypes: p.qualifierTypes,
    vocabularies: p.vocabularies,
    locale,
  };

  return (
    <section className='space-y-2' aria-label={t('inferredRelationsTitle')}>
      <div className='flex items-baseline justify-between gap-2'>
        <h2 className='text-base font-semibold'>{t('inferredRelationsTitle')}</h2>
        <span className='text-muted-foreground text-xs'>
          {incoming.length} {t('total')}
        </span>
      </div>
      <p className='text-muted-foreground text-xs'>{t('inferredRelationsHint')}</p>
      <div className='space-y-3'>
        {groups.map(([relationType, rows]) => {
          const rt = p.relationTypes[relationType];
          const label = rt?.labels[locale]?.inverse ?? rt?.labels.en.inverse ?? relationType;
          return (
            <div key={relationType}>
              <Label className='text-muted-foreground text-xs font-semibold uppercase tracking-wide'>
                {label}
              </Label>
              <ul className='divide-foreground/5 mt-0.5 divide-y'>
                {rows.map((row, i) => {
                  const name = row.sourceDisplayName[locale]
                    ?? row.sourceDisplayName.en
                    ?? row.sourceEntityId;
                  const qualifierText = formatQualifiers(relationType, row.qualifiers, ctx);
                  return (
                    <li
                      key={`${row.sourceEntityId}-${i}`}
                      className='flex items-center gap-2 py-1.5'
                    >
                      <span className='min-w-0 flex-1 break-words text-sm'>
                        {row.sourceRoute !== null
                          ? (
                            <Link
                              to='/types/$type/$slug'
                              params={row.sourceRoute}
                              className='font-medium hover:underline'
                            >
                              {name}
                            </Link>
                          )
                          : <span className='font-mono text-xs'>{row.sourceEntityId}</span>}
                        {qualifierText !== ''
                          ? (
                            <span className='text-muted-foreground ml-2 text-xs'>
                              {qualifierText}
                            </span>
                          )
                          : null}
                      </span>
                      <Badge
                        variant='outline'
                        className='text-muted-foreground shrink-0 font-normal'
                        title={t('inferredRelationsHint')}
                      >
                        {t('autoBadge')}
                      </Badge>
                      {row.sourceRoute !== null
                        ? (
                          <Link
                            to='/types/$type/$slug'
                            params={row.sourceRoute}
                            title={t('linksEditOnOther')}
                            aria-label={t('linksEditOnOther')}
                            className='text-muted-foreground hover:text-foreground shrink-0 p-1 transition-colors'
                          >
                            <Pencil className='size-3' aria-hidden />
                          </Link>
                        )
                        : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
