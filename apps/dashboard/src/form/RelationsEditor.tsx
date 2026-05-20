/**
 * Relations editor — manages an entity's outgoing relations.
 *
 * Each entry of `entity.relations` is `{ type, target, qualifiers? }`
 * where `type` is the relation-type id, `target` is an entity id, and
 * `qualifiers` is an open-ended object (since/until/role/source/…).
 *
 * Each relation renders as a compact card with target + declared
 * inline qualifiers; an "Add relation" picker sits at the bottom.
 * Qualifier inputs come from two sources:
 *  1. The relation-type schema's `qualifiers[]` (declared per type).
 *  2. A small set of universal base qualifiers (source,
 *     epistemic_status, event, assisted_by, review_status) that apply
 *     to every relation just like they do to property entries.
 * The base set lives behind a "More options" Collapsible per card so
 * it doesn't crowd the common case.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import type {
  EntityTypeSchema,
  RelationTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { MoreHorizontal, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type EntityRef } from '../api';
import {
  type EnumValue,
  MultiEntityRefInput,
  MultiSourceRefInput,
  ValueInput,
  type ValueInputContext,
  type ValueType,
} from './inputs';
import { type Locale, useLocale, useQualifierLabel, useT } from './locale';
import { relationAnchorId } from './PropertyNav';
import { QualifierSheet } from './QualifierSheet';

export type RelationEntry = {
  type: string;
  target: string;
  qualifiers?: Record<string, unknown> | undefined;
};

export type RelationsEditorProps = {
  entityType: EntityTypeSchema;
  relationTypes: Record<string, RelationTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
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
  { id: 'source', label: 'Source', valueType: 'source_ref' },
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

export function RelationsEditor(p: RelationsEditorProps): JSX.Element {
  const locale = useLocale();
  const t = useT();

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
    if (
      value === undefined
      || value === null
      || (typeof value === 'string' && value === '')
      || (Array.isArray(value) && value.length === 0)
    ) {
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
  }

  /** Append a new relation entry. `target` defaults to '' so the
   *  single-target detailed-card path keeps its "blank card → fill
   *  the target picker" UX. Multi-target groups pass the chosen
   *  entity id directly so the new chip lands populated. */
  function add(typeId: string, target = ''): void {
    p.onChange([...p.relations, { type: typeId, target }]);
  }

  // Group entries by type so we can render multi-concurrent relations
  // as ONE chip-multi card per type (family-of with 5 family members
  // becomes one row instead of five). Preserve original index for
  // single-target cards so `update` / `setQualifier` / `remove` keep
  // pointing at the right slot.
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

  // Render order: each type at most once, in the order it first
  // appears in the relations array, followed by groups newly added
  // by the bottom picker (already at the end).
  const renderedTypes = useMemo(() => [...groupedByType.keys()], [groupedByType]);

  return (
    <section className='space-y-3'>
      <div className='flex items-baseline justify-between'>
        <h2 className='text-base font-semibold'>{t('relations')}</h2>
        <span className='text-muted-foreground text-xs'>
          {p.relations.length} {t('total')}
        </span>
      </div>

      {p.relations.length === 0
        ? (
          <div className='text-muted-foreground rounded-[3px] border border-dashed p-4 text-center text-xs'>
            {t('noRelations')}
          </div>
        )
        : (
          <ul className='space-y-2'>
            {renderedTypes.map((typeId) => {
              const rt = p.relationTypes[typeId];
              const groupEntries = groupedByType.get(typeId) ?? [];
              const multi = rt?.allow_multiple_concurrent === true;
              // Anchor lives on the LI wrapper so PropertyNav's
              // scroll-to (`rel-{typeId}`) lands at this group's
              // top edge, with scroll-mt-20 to clear the sticky
              // header chrome — same offset the property anchors
              // use upstream.
              if (multi && rt !== undefined) {
                // Multi-concurrent: chips per target, each with its
                // own qualifier sheet (since/until/source/event/…)
                // so a relation that changes over chapters can carry
                // its temporal scope per entry.
                return (
                  <li
                    key={`group-${typeId}`}
                    id={relationAnchorId(typeId)}
                    className='scroll-mt-20'
                  >
                    <MultiTargetRelationGroup
                      relationType={rt}
                      groupEntries={groupEntries}
                      valueCtx={p.valueCtx}
                      vocabularies={p.vocabularies}
                      onAddTarget={(target) => add(typeId, target)}
                      onRemoveAt={(index) => remove(index)}
                      onSetQualifierAt={(index, qid, v) => setQualifier(index, qid, v)}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={`detailed-${typeId}`}
                  id={relationAnchorId(typeId)}
                  className='space-y-2 scroll-mt-20'
                >
                  {groupEntries.map(({ entry, index }) => (
                    <RelationCard
                      key={`${entry.type}-${index}`}
                      relation={entry}
                      relationType={p.relationTypes[entry.type]}
                      vocabularies={p.vocabularies}
                      valueCtx={p.valueCtx}
                      onTargetChange={(target) => update(index, { target })}
                      onSetQualifier={(qid, v) => setQualifier(index, qid, v)}
                      onRemove={() => remove(index)}
                    />
                  ))}
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
            placeholder={`+ ${t('addRelation')} (${allowedTypeIds.length} ${t('typesAvailable')})`}
            emptyText={t('noMatch')}
          />
        )
        : null}
    </section>
  );
}

function relationLabel(rt: RelationTypeSchema, locale: Locale): string {
  return rt.labels[locale]?.active ?? rt.labels.en.active;
}

type RelationCardProps = {
  relation: RelationEntry;
  relationType: RelationTypeSchema | undefined;
  vocabularies: Record<string, VocabularySchema>;
  valueCtx: ValueInputContext;
  onTargetChange: (target: string) => void;
  onSetQualifier: (qid: string, value: unknown) => void;
  onRemove: () => void;
};

function RelationCard(p: RelationCardProps): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const qLabel = useQualifierLabel();

  const declaredExtra: readonly QualifierShape[] = useMemo(() => {
    if (p.relationType === undefined) return [];
    return p.relationType.qualifiers
      .filter((q) => q.id !== 'since' && q.id !== 'until') // pinned inline
      .map((q) => ({
        id: q.id,
        label: humanize(q.id),
        valueType: q.value_type as ValueType,
        ...(q.enum_ref !== undefined ? { enumRef: q.enum_ref } : {}),
        ...(q.required === true ? { required: true } : {}),
      }));
  }, [p.relationType]);

  // De-duplicate base qualifiers that the relation type already declares.
  const baseQualifiers = useMemo(() => {
    const declared = new Set<string>(
      p.relationType?.qualifiers.map((q) => String(q.id)) ?? [],
    );
    return BASE_RELATION_QUALIFIERS.filter((q) => !declared.has(q.id));
  }, [p.relationType]);

  const moreQualifiers = [...declaredExtra, ...baseQualifiers];
  const qualifierById = useMemo(
    () => new Map(moreQualifiers.map((q) => [q.id, q])),
    [moreQualifiers],
  );
  const sinceDecl = p.relationType?.qualifiers.find((q) => q.id === 'since');
  const untilDecl = p.relationType?.qualifiers.find((q) => q.id === 'until');

  const setIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of moreQualifiers) {
      const v = p.relation.qualifiers?.[q.id];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      s.add(q.id);
    }
    return s;
  }, [moreQualifiers, p.relation.qualifiers]);
  const setQualifierCount = setIds.size;

  return (
    <li className='border-input/70 bg-card/40 relative flex flex-col gap-2 rounded-[3px] border p-2'>
      {
        /* Isolated × in the top-right corner — separated from any other
          control to avoid mis-clicks on a destructive action. */
      }
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='absolute right-0.5 top-0.5 size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10'
        onClick={p.onRemove}
        aria-label={t('removeRelation')}
      >
        <X className='size-3' />
      </Button>

      <div className='flex items-center gap-2 pr-12'>
        <Badge variant='secondary' className='font-normal'>
          {p.relationType !== undefined ? relationLabel(p.relationType, locale) : p.relation.type}
        </Badge>
      </div>

      <RelationQualifierField
        id='target'
        label={humanize('target')}
        valueType='entity_ref'
        restrictTo={p.relationType?.valid_to_types}
        required
        value={p.relation.target}
        valueCtx={p.valueCtx}
        vocabularies={p.vocabularies}
        onChange={(v) => p.onTargetChange(typeof v === 'string' ? v : '')}
      />

      {sinceDecl !== undefined
        ? (
          <RelationQualifierField
            id='since'
            label={humanize('since')}
            valueType='source_ref'
            required={sinceDecl.required}
            multi
            value={p.relation.qualifiers?.['since']}
            valueCtx={p.valueCtx}
            vocabularies={p.vocabularies}
            onChange={(v) => p.onSetQualifier('since', v)}
          />
        )
        : null}

      {untilDecl !== undefined
        ? (
          <RelationQualifierField
            id='until'
            label={humanize('until')}
            valueType='source_ref'
            required={untilDecl.required}
            multi
            value={p.relation.qualifiers?.['until']}
            valueCtx={p.valueCtx}
            vocabularies={p.vocabularies}
            onChange={(v) => p.onSetQualifier('until', v)}
          />
        )
        : null}

      {moreQualifiers.length > 0
        ? (
          <QualifierSheet
            trigger={
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-muted-foreground -ml-1 h-6 gap-1 px-1.5 text-[10px]'
                aria-label={t('moreOptions')}
              >
                <MoreHorizontal className='size-3' />
                {t('moreOptions')}
                {setQualifierCount > 0
                  ? (
                    <span className='bg-primary text-primary-foreground inline-flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[8px] font-medium leading-none'>
                      {setQualifierCount}
                    </span>
                  )
                  : null}
              </Button>
            }
            qualifiers={moreQualifiers.map((q) => ({
              id: q.id,
              label: qLabel(q.id, q.label),
            }))}
            setIds={setIds}
            renderField={(id) => {
              const q = qualifierById.get(id);
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
                  value={p.relation.qualifiers?.[id]}
                  valueCtx={p.valueCtx}
                  vocabularies={p.vocabularies}
                  onChange={(v) => p.onSetQualifier(id, v)}
                />
              );
            }}
          />
        )
        : null}
    </li>
  );
}

/**
 * Group card for `allow_multiple_concurrent` relation types.
 *
 * Each relation entry of the type renders as its own clickable chip
 * showing the target's translated name. Clicking the chip opens a
 * QualifierSheet on that one entry — so a relation like `ally-of`
 * (which legitimately changes across the story) can carry its own
 * `since` / `until` / `source` / `event` / `canon_scope` per target,
 * without forcing the whole group back into detailed-card mode.
 *
 * Chips with at least one populated qualifier wear a small dot so
 * the maintainer can see at a glance which entries have temporal
 * metadata vs which are bare "this relation exists somewhere".
 *
 * Adding a new target appends a fresh relation entry with empty
 * qualifiers. The add-picker filters out already-targeted entities
 * AND restricts to the relation's `valid_to_types`.
 */
function MultiTargetRelationGroup(p: {
  relationType: RelationTypeSchema;
  groupEntries: readonly { entry: RelationEntry; index: number; }[];
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  onAddTarget: (target: string) => void;
  onRemoveAt: (index: number) => void;
  onSetQualifierAt: (index: number, qid: string, value: unknown) => void;
}): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const nameLookup = useEntityNameLookup(p.relationType.valid_to_types, locale);

  // The full qualifier list applies to every entry of this type:
  // declared qualifiers (including the inline since/until) + the
  // universal base set (epistemic_status, event, source, …).
  const qualifierShapes: readonly QualifierShape[] = useMemo(() => {
    const declared = p.relationType.qualifiers.map((q) => ({
      id: q.id,
      label: humanize(q.id),
      valueType: q.value_type as ValueType,
      ...(q.enum_ref !== undefined ? { enumRef: q.enum_ref } : {}),
      ...(q.required === true ? { required: true } : {}),
    }));
    const declaredIds = new Set<string>(declared.map((d) => String(d.id)));
    const base = BASE_RELATION_QUALIFIERS.filter((q) => !declaredIds.has(q.id));
    return [...declared, ...base];
  }, [p.relationType]);

  const taken = useMemo(
    () => new Set(p.groupEntries.map((g) => g.entry.target).filter((t) => t !== '')),
    [p.groupEntries],
  );

  return (
    <li className='border-input/70 bg-card/40 flex flex-col gap-2 rounded-[3px] border p-2'>
      <div className='flex items-center gap-2'>
        <Badge variant='secondary' className='font-normal'>
          {relationLabel(p.relationType, locale)}
        </Badge>
        <span className='text-muted-foreground text-[10px]'>
          {p.groupEntries.length} {t('total')}
        </span>
      </div>

      <div className='flex flex-wrap items-center gap-1.5'>
        {p.groupEntries.map(({ entry, index }) => (
          <TargetChip
            key={`${entry.target}-${index}`}
            entry={entry}
            displayName={resolveTargetName(entry.target, nameLookup)}
            relationType={p.relationType}
            qualifierShapes={qualifierShapes}
            valueCtx={p.valueCtx}
            vocabularies={p.vocabularies}
            onRemove={() => p.onRemoveAt(index)}
            onSetQualifier={(qid, v) => p.onSetQualifierAt(index, qid, v)}
          />
        ))}
        <AddTargetButton
          restrictTo={p.relationType.valid_to_types}
          entityTypes={p.valueCtx.entityTypes}
          excluded={taken}
          onAdd={p.onAddTarget}
        />
      </div>
    </li>
  );
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

/** Single chip for one relation entry. Click body → open
 *  qualifier sheet. Click × → remove the entry. Qualifier count
 *  badge lights up when any qualifier carries a real value. */
function TargetChip(p: {
  entry: RelationEntry;
  displayName: string;
  relationType: RelationTypeSchema;
  qualifierShapes: readonly QualifierShape[];
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  onRemove: () => void;
  onSetQualifier: (qid: string, value: unknown) => void;
}): JSX.Element {
  const t = useT();
  const locale = useLocale();
  const qLabel = useQualifierLabel();
  const qualifiers = p.entry.qualifiers ?? {};

  const setIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of p.qualifierShapes) {
      const v = qualifiers[q.id];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      s.add(q.id);
    }
    return s;
  }, [p.qualifierShapes, qualifiers]);

  const qualifierById = useMemo(
    () => new Map(p.qualifierShapes.map((q) => [q.id, q])),
    [p.qualifierShapes],
  );

  return (
    <div className='bg-muted text-foreground inline-flex items-center gap-0.5 rounded-[3px] px-0.5 py-0.5 text-[11px]'>
      <QualifierSheet
        title={`${p.displayName} · ${relationLabel(p.relationType, locale)}`}
        trigger={
          <button
            type='button'
            className='hover:bg-muted-foreground/10 inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 transition-colors'
          >
            <span className='truncate max-w-[14rem]'>{p.displayName}</span>
            {setIds.size > 0
              ? (
                <span
                  className='bg-primary text-primary-foreground inline-flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[8px] font-medium leading-none'
                  title={`${setIds.size} qualifier${setIds.size === 1 ? '' : 's'}`}
                >
                  {setIds.size}
                </span>
              )
              : null}
          </button>
        }
        qualifiers={p.qualifierShapes.map((q) => ({
          id: q.id,
          label: qLabel(q.id, q.label),
        }))}
        setIds={setIds}
        renderField={(id) => {
          const q = qualifierById.get(id);
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
      <button
        type='button'
        className='text-muted-foreground hover:text-destructive shrink-0 rounded-[2px] p-0.5'
        onClick={p.onRemove}
        aria-label={t('removeRelation')}
        title={t('removeRelation')}
      >
        <X className='size-3' />
      </button>
    </div>
  );
}

/** Single-pick combobox that adds one new chip per selection, then
 *  resets itself. Already-targeted entities are filtered out. */
function AddTargetButton(p: {
  restrictTo: readonly string[];
  entityTypes: readonly { id: string; label: string; }[];
  excluded: ReadonlySet<string>;
  onAdd: (target: string) => void;
}): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const allowedTypes = useMemo(() => {
    const allowed = new Set(p.restrictTo);
    return p.entityTypes.filter((et) => allowed.has(et.id));
  }, [p.entityTypes, p.restrictTo]);

  const [entriesByType, setEntriesByType] = useState<
    ReadonlyMap<string, readonly EntityRef[]>
  >(new Map());
  useEffect(() => {
    if (allowedTypes.length === 0) return;
    let cancelled = false;
    void Promise.all(
      allowedTypes.map(async (et) => {
        try {
          return [et.id, await api.listEntities(et.id)] as const;
        } catch {
          return [et.id, [] as readonly EntityRef[]] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setEntriesByType(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [allowedTypes]);

  const items = useMemo(() => {
    const out: { value: string; label: string; searchText: string; hint: string; }[] = [];
    for (const et of allowedTypes) {
      const rows = entriesByType.get(et.id) ?? [];
      for (const e of rows) {
        if (p.excluded.has(e.id)) continue;
        const name = e.displayName[locale] ?? e.displayName.en ?? String(e.slug);
        out.push({
          value: e.id,
          label: allowedTypes.length > 1 ? `${et.label} · ${name}` : name,
          searchText: `${name} ${e.slug} ${e.id} ${et.label}`,
          hint: String(e.slug),
        });
      }
    }
    return out;
  }, [allowedTypes, entriesByType, p.excluded, locale]);

  return (
    <div className='inline-flex w-44'>
      <Combobox
        value={undefined}
        onChange={(id) => p.onAdd(id)}
        items={items}
        placeholder={`+ ${t('addRelation')}`}
        emptyText={t('noMatch')}
        triggerClassName='h-7 border-dashed text-[11px] font-normal'
      />
    </div>
  );
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
  const multiList = isMultiEntityRef
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
      {multiList !== null
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
