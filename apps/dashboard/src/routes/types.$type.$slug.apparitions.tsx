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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type EntityDetail, type SourceRef } from '../api';
import { LoadFailed } from '../components/LoadFailed';
import { useApiResource } from '../hooks/use-api-resource';

// Stable fallback while the page resource is loading.
const emptySources: readonly SourceRef[] = [];
import { formatSourceLabel, MultiEntityRefInput } from '../form/inputs';
import { useLocale, useT } from '../form/locale';

// Bucket key for appearances whose source-type is NOT in
// `appears-in.valid_to_types` — rendered in a fallback "Other" group
// so they're never silently hidden while still being counted.
const OTHER_GROUP = '__other';

// Threshold above which a section collapses by default — keeps the
// page from becoming an infinite scroll for ubiquitous characters
// (Luffy appears in 1000+ chapters).
const COLLAPSE_THRESHOLD = 20;
// Threshold above which the expanded list switches to virtualised
// rendering — below this, plain DOM is cheaper than the virtualiser
// setup cost and avoids the layout flash on small lists.
const VIRTUALIZE_THRESHOLD = 50;
const APPARITION_ROW_HEIGHT = 40;

/** Trailing-integer extractor for slug-based ordering: `chapter-1043`
 *  → 1043, `arlong-arc` → null. */
function extractTrailingNumber(s: string): number | null {
  const m = s.match(/(\d+)$/);
  return m === null ? null : Number(m[1]);
}

/** Sort entity ids by their trailing slug number when both have one;
 *  otherwise fall back to locale-aware string compare. Without this,
 *  `chapter-96` lexically sorts AFTER `chapter-1043` which is wrong
 *  for any chronological list. */
function sortByTrailingNumber(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = extractTrailingNumber(a);
    const nb = extractTrailingNumber(b);
    if (na !== null && nb !== null) return na - nb;
    return a.localeCompare(b);
  });
}

/** Parse a free-form range string ("1, 5, 96-110, 432") into a list
 *  of entity ids of the form `<sourceType>:<n>`. Tokens are
 *  comma-separated; each is either a single integer or `A-B` (with
 *  `-`, `–`, or `—` accepted). Returns `{ ok: false, error }` on the
 *  first malformed token so the editor can flag it. */
function parseNumericRange(
  input: string,
  sourceType: string,
): { ok: true; ids: string[]; } | { ok: false; error: string; } {
  const out = new Set<number>();
  const tokens = input.split(',').map((s) => s.trim()).filter((s) => s !== '');
  for (const tok of tokens) {
    const single = tok.match(/^(\d+)$/);
    if (single !== null) {
      out.add(Number(single[1]));
      continue;
    }
    const range = tok.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range !== null) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return { ok: false, error: `${tok}: start > end` };
      // Hard guard against runaway ranges typed by accident
      // ("1-999999"): caps at 5000 entries per range token.
      if (b - a > 5000) return { ok: false, error: `${tok}: range too large (>5000)` };
      for (let n = a; n <= b; n++) out.add(n);
      continue;
    }
    return { ok: false, error: `invalid token "${tok}"` };
  }
  return {
    ok: true,
    ids: [...out].sort((a, b) => a - b).map((n) => `${sourceType}:${n}`),
  };
}

/** Inverse of `parseNumericRange`: condense a list of ids into a
 *  compact comma-separated string with consecutive runs collapsed
 *  ("1, 5-10, 96, 432-450"). Non-numeric ids are skipped. */
function formatNumericRange(ids: readonly string[]): string {
  const nums = ids
    .map((id) => {
      const colon = id.indexOf(':');
      return colon < 0 ? NaN : Number(id.slice(colon + 1));
    })
    .filter((n) => Number.isFinite(n) && Number.isInteger(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return '';
  const parts: string[] = [];
  let start = nums[0]!;
  let prev = nums[0]!;
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (n !== undefined) {
      start = n;
      prev = n;
    }
  }
  return parts.join(', ');
}

/** Returns true when every existing id of this source-type is the
 *  form `<sourceType>:<integer>` — the precondition for offering the
 *  range editor. Empty lists also qualify so the toggle stays usable
 *  when the contributor hasn't added anything yet. */
function isNumericIdSet(ids: readonly string[], sourceType: string): boolean {
  const prefix = `${sourceType}:`;
  return ids.every((id) => id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)));
}

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

function ApparitionsComponent(): ReactElement {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const locale = useLocale();
  const t = useT();
  const { data, error, reload } = useApiResource(
    () => Promise.all([api.getEntity(type, slug), api.schemas(), api.sources()]),
    [type, slug],
  );
  const entity = data?.[0] ?? null;
  const schemas = data?.[1] ?? null;
  const sources = data?.[2] ?? emptySources;
  const [working, setWorking] = useState<WorkingState>(emptyWorking);
  // `others` is the slice of relations[] we DON'T touch on save —
  // re-attached verbatim so a save here can't accidentally drop a
  // member-of or ate-fruit relation. Captured at load time and held
  // for the lifetime of the page.
  const [others, setOthers] = useState<readonly OtherRelation[]>([]);
  const [saving, setSaving] = useState(false);

  // Seed the working split from the entity once it lands (and whenever
  // the route params re-trigger the fetch) — render-time adjustment
  // (react.dev "you might not need an effect"), no effect chain /
  // stale frame.
  const [seededFrom, setSeededFrom] = useState<EntityDetail | null>(null);
  if (entity !== seededFrom) {
    setSeededFrom(entity);
    if (entity === null) {
      setWorking(emptyWorking);
      setOthers([]);
    } else {
      const split = splitRelations(entity);
      setWorking(buildInitial(split.apparitions));
      setOthers(split.others);
    }
  }

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

  // Display-name lookup for source ids (chapters / episodes / …) —
  // the same resolution the pickers use (`formatSourceLabel`), so rows
  // show "1043 — Two Crewmates" instead of the raw entity id. Ids not
  // in the /api/sources catalogue fall back to the raw id.
  const sourceLabelFor = (id: string): string => {
    const src = sources.find((s) => s.id === id);
    return src === undefined ? id : formatSourceLabel(src, locale);
  };

  // Group working state back by source-type for render. Entries
  // removed this session stay listed (badged "removed") so unsaved
  // deletions remain visible; source-types outside `valid_to_types`
  // collect into a fallback "Other" group instead of vanishing.
  const grouped = useMemo(() => {
    const buckets = new Map<string, string[]>();
    for (const id of working.current) {
      const st = sourceTypeOf(id);
      const list = buckets.get(st) ?? [];
      list.push(id);
      buckets.set(st, list);
    }
    const removedBuckets = new Map<string, string[]>();
    for (const id of working.initial) {
      if (working.current.has(id)) continue;
      const st = sourceTypeOf(id);
      const list = removedBuckets.get(st) ?? [];
      list.push(id);
      removedBuckets.set(st, list);
    }
    const known = new Set(sourceTypes);
    const groups = sourceTypes.map((st) => ({
      sourceType: st,
      fallback: false,
      targets: sortByTrailingNumber(buckets.get(st) ?? []),
      removedTargets: sortByTrailingNumber(removedBuckets.get(st) ?? []),
    }));
    const otherCurrent: string[] = [];
    const otherRemoved: string[] = [];
    for (const [st, ids] of buckets) {
      if (!known.has(st)) otherCurrent.push(...ids);
    }
    for (const [st, ids] of removedBuckets) {
      if (!known.has(st)) otherRemoved.push(...ids);
    }
    if (otherCurrent.length > 0 || otherRemoved.length > 0) {
      groups.push({
        sourceType: OTHER_GROUP,
        fallback: true,
        targets: sortByTrailingNumber(otherCurrent),
        removedTargets: sortByTrailingNumber(otherRemoved),
      });
    }
    return groups;
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
  // Session-added set for the per-row "added" badge.
  const addedSet = useMemo(() => new Set(added), [added]);

  function removeTarget(target: string): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      current.delete(target);
      return { ...prev, current };
    });
  }

  function removeTargets(targets: readonly string[]): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      for (const id of targets) current.delete(id);
      return { ...prev, current };
    });
  }

  function restoreTarget(target: string): void {
    setWorking((prev) => {
      const current = new Set(prev.current);
      current.add(target);
      return { ...prev, current };
    });
  }

  function setTypeMembership(sourceType: string, nextOfType: ReadonlySet<string>): void {
    setWorking((prev) => {
      const updated = new Set(prev.current);
      for (const id of nextOfType) updated.add(id);
      for (const id of prev.current) {
        if (sourceTypeOf(id) === sourceType && !nextOfType.has(id)) {
          updated.delete(id);
        }
      }
      return { ...prev, current: updated };
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

  if (error !== null) return <LoadFailed message={error} onRetry={reload} />;
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
          className='text-muted-foreground -ml-1.5 h-6 px-1.5 text-[11px]'
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
              <ApparitionGroup
                key={group.sourceType}
                sourceType={group.sourceType}
                typeLabel={group.fallback
                  ? t('apparitionsOtherGroup')
                  : typeLabel(group.sourceType)}
                fallback={group.fallback}
                targets={group.targets}
                removedTargets={group.removedTargets}
                addedSet={addedSet}
                qualifiers={working.qualifiers}
                sourceLabelFor={sourceLabelFor}
                entityTypes={entityTypes}
                onRemoveTarget={removeTarget}
                onRestoreTarget={restoreTarget}
                onRemoveAll={() => removeTargets(group.targets)}
                onPickerChange={(next) => setTypeMembership(group.sourceType, new Set(next))}
              />
            ))}
          </div>
        )}

      {dirty
        ? (
          <div
            className='border-border bg-background fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t px-4 py-3 sm:px-6 lg:left-64'
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

type ApparitionGroupProps = {
  sourceType: string;
  typeLabel: string;
  /** Fallback bucket for source-types outside `valid_to_types`:
   *  rendered so nothing is silently hidden, but without add
   *  affordances (the schema doesn't accept these types). */
  fallback?: boolean;
  /** Already sorted (numeric-aware) targets for this source-type. */
  targets: readonly string[];
  /** Targets removed this session — still rendered (muted + badged
   *  "removed") so unsaved deletions stay visible until save. */
  removedTargets: readonly string[];
  /** Targets added this session (badged "added"). */
  addedSet: ReadonlySet<string>;
  qualifiers: ReadonlyMap<string, Record<string, unknown>>;
  sourceLabelFor: (id: string) => string;
  entityTypes: readonly { id: string; label: string; }[];
  onRemoveTarget: (target: string) => void;
  onRestoreTarget: (target: string) => void;
  onRemoveAll: () => void;
  onPickerChange: (next: readonly string[]) => void;
};

/**
 * One collapsible section per source-type on the apparitions page.
 *
 * Above `COLLAPSE_THRESHOLD` (20) entries the section starts
 * collapsed, showing a `first → last` summary so the page doesn't
 * become an infinite scroll for ubiquitous characters. Expanding
 * reveals a search box + the list (virtualised above
 * `VIRTUALIZE_THRESHOLD`) + a "Remove all" affordance guarded by a
 * confirm step. The bulk-add picker stays accessible whether the
 * list is collapsed or expanded.
 */
function ApparitionGroup(p: ApparitionGroupProps): ReactElement {
  const t = useT();
  const isLong = p.targets.length > COLLAPSE_THRESHOLD;
  // Default-collapsed for long lists; user choice is preserved within
  // the session (component lifetime). A subsequent edit that adds
  // entries past the threshold doesn't re-collapse — the contributor
  // is mid-task and wants to see what they just added.
  const [expanded, setExpanded] = useState(!isLong);
  const [query, setQuery] = useState('');
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Range view is gated by "all current ids look like
  // <sourceType>:<integer>" — guards against offering the textarea
  // for film/SBS/databook where slugs are non-numeric and the
  // round-trip parse/format would lose data. The fallback "Other"
  // group never offers it (its bucket key is not a real source type).
  const supportsRange = p.fallback !== true && isNumericIdSet(p.targets, p.sourceType);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeDraft, setRangeDraft] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Live value the textarea shows: the local draft while editing,
  // otherwise the formatted current state. Re-formats on every parent
  // update so external mutations (e.g. add via picker, undo) reflect.
  const rangeValue = rangeDraft ?? formatNumericRange(p.targets);

  // Fast membership check for the per-row "removed" state.
  const removedSet = useMemo(() => new Set(p.removedTargets), [p.removedTargets]);

  // The rendered list interleaves current targets with the ones
  // removed this session (kept visible + badged), re-sorted so a
  // removed chapter stays in chronological position.
  const filtered = useMemo(() => {
    const all = p.removedTargets.length === 0
      ? p.targets
      : sortByTrailingNumber([...p.targets, ...p.removedTargets]);
    const q = query.trim().toLowerCase();
    if (q === '') return all;
    return all.filter((id) =>
      id.toLowerCase().includes(q)
      || p.sourceLabelFor(id).toLowerCase().includes(q)
    );
  }, [p.targets, p.removedTargets, p.sourceLabelFor, query]);

  // First/last summary — uses the numeric-aware sort already applied
  // upstream, so the first element really is the earliest in
  // chronological order (chapter-1, not chapter-1043).
  const first = p.targets[0];
  const last = p.targets[p.targets.length - 1];
  const summary = p.targets.length === 0
    ? null
    : p.targets.length === 1
    ? p.sourceLabelFor(first!)
    : `${p.sourceLabelFor(first!)} → ${p.sourceLabelFor(last!)}`;

  const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => APPARITION_ROW_HEIGHT,
    overscan: 8,
  });

  function renderRow(target: string): ReactElement {
    // Per-target type/slug rather than p.sourceType so rows in the
    // fallback "Other" group (mixed types) still link correctly.
    const rowType = sourceTypeOf(target);
    const rowSlug = sourceSlugOf(target);
    const isRemoved = removedSet.has(target);
    const isAdded = p.addedSet.has(target);
    const quals = p.qualifiers.get(target);
    const qualLine = quals === undefined
      ? ''
      : Object.entries(quals).map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
    return (
      <div className='flex items-center gap-2 px-3 py-2 text-sm'>
        <Link
          to='/sources/$type/$slug'
          params={{ type: rowType, slug: rowSlug }}
          className={isRemoved
            ? 'text-muted-foreground hover:underline truncate line-through'
            : 'hover:underline truncate'}
        >
          {p.sourceLabelFor(target)}
        </Link>
        {isAdded
          ? (
            <Badge variant='outline' className='shrink-0 border-amber-500/40 text-amber-500'>
              {t('apparitionAdded')}
            </Badge>
          )
          : null}
        {isRemoved
          ? (
            <Badge variant='outline' className='text-destructive shrink-0 border-destructive/40'>
              {t('apparitionRemoved')}
            </Badge>
          )
          : null}
        {qualLine !== ''
          ? <span className='text-muted-foreground text-[11px]'>{qualLine}</span>
          : null}
        <Link
          to='/types/$type/$slug'
          params={{ type: rowType, slug: rowSlug }}
          aria-label={t('openEntityPage')}
          title={t('openEntityPage')}
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]'
        >
          <ExternalLink className='size-3' />
        </Link>
        {isRemoved
          ? (
            <Button
              variant='ghost'
              size='icon'
              className='ml-auto'
              onClick={() => p.onRestoreTarget(target)}
              aria-label={t('restore')}
              title={t('restore')}
            >
              <Undo2 className='size-4' />
            </Button>
          )
          : (
            <Button
              variant='ghost'
              size='icon'
              className='ml-auto'
              onClick={() => p.onRemoveTarget(target)}
              aria-label={t('removeApparition')}
            >
              <X className='size-4' />
            </Button>
          )}
      </div>
    );
  }

  return (
    <section className='space-y-2'>
      {
        /* Plain header + dedicated toggle button — the section toggle
          used to be a role='button' div with the range-mode <button>
          nested inside it, which is invalid (interactive inside
          interactive) and confused assistive tech. */
      }
      <header className='flex min-w-0 items-center gap-2'>
        <h2 className='min-w-0 flex-1 text-sm font-semibold'>
          <button
            type='button'
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className='flex w-full min-w-0 cursor-pointer items-center gap-2 text-left select-none'
          >
            {expanded
              ? <ChevronDown className='size-4 shrink-0' aria-hidden />
              : <ChevronRight className='size-4 shrink-0' aria-hidden />}
            <span className='shrink-0'>
              {p.typeLabel}{' '}
              <span className='text-muted-foreground font-normal'>
                ({p.targets.length})
              </span>
            </span>
            {!expanded && summary !== null
              ? (
                <span className='text-muted-foreground min-w-0 truncate text-[11px] font-normal'>
                  {summary}
                </span>
              )
              : null}
          </button>
        </h2>
        {expanded && supportsRange
          ? (
            <button
              type='button'
              onClick={() => {
                setRangeMode((v) => !v);
                setRangeDraft(null);
                setRangeError(null);
              }}
              className='text-muted-foreground hover:text-foreground border-input inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px]'
            >
              {rangeMode ? t('chipView') : t('rangeView')}
            </button>
          )
          : null}
      </header>

      {expanded && rangeMode
        ? (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-[11px]'>
              {t('rangeHint')}
            </p>
            <textarea
              value={rangeValue}
              onChange={(e) => {
                setRangeDraft(e.target.value);
                setRangeError(null);
              }}
              placeholder='1, 5-10, 96, 432-450'
              rows={3}
              className='border-input bg-background focus-visible:border-ring w-full rounded-md border px-2 py-1.5 font-mono text-base outline-none sm:text-xs'
            />
            {rangeError !== null
              ? (
                <p className='text-destructive text-[11px]'>
                  {rangeError}
                </p>
              )
              : null}
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                onClick={() => {
                  const parsed = parseNumericRange(rangeValue, p.sourceType);
                  if (!parsed.ok) {
                    setRangeError(parsed.error);
                    return;
                  }
                  p.onPickerChange(parsed.ids);
                  setRangeDraft(null);
                  setRangeError(null);
                }}
              >
                {t('applyRange')}
              </Button>
              {rangeDraft !== null
                ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setRangeDraft(null);
                      setRangeError(null);
                    }}
                  >
                    {t('cancel')}
                  </Button>
                )
                : null}
              <span className='text-muted-foreground ml-auto text-[11px]'>
                {p.targets.length} {p.targets.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>
        )
        : expanded
        ? (
          <>
            {p.targets.length === 0 && p.removedTargets.length === 0
              ? (
                <p className='text-muted-foreground rounded-md border px-3 py-3 text-xs'>
                  {t('castNoneOfType').replace('{type}', p.typeLabel.toLowerCase())}
                </p>
              )
              : (
                <>
                  {
                    /* Internal search + bulk-remove. Search lives above
                      the list because typing into it inside a 1000-
                      item DOM blob would lag the keyboard. */
                  }
                  {p.targets.length > COLLAPSE_THRESHOLD
                    ? (
                      <div className='flex items-center gap-2'>
                        <div className='relative flex-1'>
                          <Search className='text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2' />
                          <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('apparitionSearchPlaceholder')}
                            className='h-8 pl-7 text-xs'
                          />
                        </div>
                        {confirmRemoveAll
                          ? (
                            <>
                              <Button
                                variant='destructive'
                                size='sm'
                                onClick={() => {
                                  p.onRemoveAll();
                                  setConfirmRemoveAll(false);
                                }}
                              >
                                {t('confirmRemoveAll').replace('{n}', String(p.targets.length))}
                              </Button>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setConfirmRemoveAll(false)}
                              >
                                {t('cancel')}
                              </Button>
                            </>
                          )
                          : (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => setConfirmRemoveAll(true)}
                            >
                              {t('removeAll')}
                            </Button>
                          )}
                      </div>
                    )
                    : null}

                  {filtered.length === 0
                    ? (
                      <p className='text-muted-foreground rounded-md border px-3 py-3 text-xs'>
                        {t('noMatch')}
                      </p>
                    )
                    : shouldVirtualize
                    ? (
                      <div
                        ref={scrollRef}
                        className='divide-border divide-y rounded-md border overflow-auto'
                        style={{
                          height: `${Math.min(filtered.length, 10) * APPARITION_ROW_HEIGHT}px`,
                        }}
                      >
                        <div
                          style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                          }}
                        >
                          {virtualizer.getVirtualItems().map((vi) => {
                            const target = filtered[vi.index]!;
                            return (
                              <div
                                key={target}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  transform: `translateY(${vi.start}px)`,
                                  height: `${APPARITION_ROW_HEIGHT}px`,
                                }}
                              >
                                {renderRow(target)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                    : (
                      <ul className='divide-border divide-y rounded-md border'>
                        {filtered.map((target) => <li key={target}>{renderRow(target)}</li>)}
                      </ul>
                    )}
                </>
              )}
            {p.fallback === true
              ? null
              : (
                <MultiEntityRefInput
                  value={p.targets}
                  onChange={p.onPickerChange}
                  entityTypes={p.entityTypes}
                  restrictTo={[p.sourceType]}
                />
              )}
          </>
        )
        // Collapsed: just the bulk-add picker (none for the fallback
        // "Other" group — its types aren't valid targets). Adding
        // entries here doesn't auto-expand — the user explicitly chose
        // to collapse this section and the chip/list state in the
        // picker already gives feedback that something was added.
        : p.fallback === true
        ? null
        : (
          <MultiEntityRefInput
            value={p.targets}
            onChange={p.onPickerChange}
            entityTypes={p.entityTypes}
            restrictTo={[p.sourceType]}
          />
        )}
    </section>
  );
}
