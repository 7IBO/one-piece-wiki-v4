/**
 * Schema-driven entity form, optimised for maintainer ergonomics.
 *
 * Layout principles:
 *  - One row per property (no Card chrome).
 *  - Historical properties show the latest entry inline; older entries
 *    collapse behind a "Show history (N)" disclosure.
 *  - Localizable properties surface EN + FR inputs directly. The i18n
 *    key is generated under the hood (`type.slug.property[.index]`)
 *    and never shown — maintainers care about the translated text,
 *    not the plumbing key.
 *  - Schema metadata badges (value_type, historical, required, …) are
 *    hidden behind a "Show schema details" toggle to reduce noise.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type {
  EntityTypeSchema,
  PropertyTypeSchema,
  RelationTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { AlertCircle, Globe, MoreHorizontal, Plus, X } from 'lucide-react';
import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import { type SourceRef, type Translations, validationIssues } from '../api';
import { useCurrentUser } from '../auth';
import { DiffPopover } from './DiffPopover';
import { ImageUpload } from './ImageUpload';
import {
  MultiEntityRefInput,
  MultiSourceRefInput,
  ValueInput,
  type ValueInputContext,
  type ValueType,
} from './inputs';
import { type Locale, SUPPORTED_LOCALES, useLocale, useQualifierLabel, useT } from './locale';
import { type NavEntry, propertyAnchorId, PropertyNav } from './PropertyNav';
import { type QualifierDef, resolveQualifiers } from './qualifiers';
import { QualifierSheet } from './QualifierSheet';
import { type RelationEntry, RelationsEditor } from './RelationsEditor';
import { useDraftAutosave, useStoredDraft } from './use-draft';

type PropertyEntry = Record<string, unknown>;
type PropertyValue = PropertyEntry | PropertyEntry[];
type EntityData = Record<string, unknown> & {
  properties?: Record<string, PropertyValue>;
};

/**
 * Coarse-grained sections used to group properties in the form, à la
 * Payload CMS. The order here is the render order. Heuristic per
 * inventory § 3 — Identity (i18n_key + name-like ids), Numbers, Dates
 * (date value_type + `_at_` source_refs), Categorical (enum),
 * Booleans, References (entity_ref), then Other.
 */
type SectionId =
  | 'identity'
  | 'numbers'
  | 'dates'
  | 'categorical'
  | 'boolean'
  | 'references'
  | 'other';

type SectionDef = {
  readonly id: SectionId;
  readonly labelKey:
    | 'sectionIdentity'
    | 'sectionNumbers'
    | 'sectionDates'
    | 'sectionCategorical'
    | 'sectionBoolean'
    | 'sectionReferences'
    | 'sectionOther';
  readonly match: (pt: PropertyTypeSchema) => boolean;
};

const FORM_SECTIONS: readonly SectionDef[] = [
  {
    id: 'identity',
    labelKey: 'sectionIdentity',
    match: (pt) =>
      pt.value_type === 'i18n_key'
      || pt.id === 'name'
      || pt.id === 'slug'
      || pt.id === 'attribution',
  },
  {
    id: 'numbers',
    labelKey: 'sectionNumbers',
    match: (pt) => pt.value_type === 'number',
  },
  {
    id: 'dates',
    labelKey: 'sectionDates',
    match: (pt) =>
      pt.value_type === 'date'
      || pt.value_type === 'source_ref'
      || /(_at_|_at$|since$|published|aired|released|built|destroyed)/.test(pt.id),
  },
  {
    id: 'categorical',
    labelKey: 'sectionCategorical',
    match: (pt) => pt.value_type === 'enum' || pt.value_type === 'multi_enum',
  },
  {
    id: 'boolean',
    labelKey: 'sectionBoolean',
    match: (pt) => pt.value_type === 'boolean',
  },
  {
    id: 'references',
    labelKey: 'sectionReferences',
    match: (pt) => pt.value_type === 'entity_ref',
  },
  {
    id: 'other',
    labelKey: 'sectionOther',
    match: () => true,
  },
];

type DeclRow = {
  readonly id: string;
  readonly required?: boolean;
  readonly historical?: boolean;
  readonly localizable?: boolean;
};

function groupBySection(
  visible: readonly DeclRow[],
  propertyTypes: Record<string, PropertyTypeSchema>,
): readonly { id: SectionId; labelKey: SectionDef['labelKey']; items: readonly DeclRow[]; }[] {
  const buckets = new Map<SectionId, DeclRow[]>();
  for (const decl of visible) {
    const pt = propertyTypes[decl.id];
    if (pt === undefined) {
      const list = buckets.get('other') ?? [];
      list.push(decl);
      buckets.set('other', list);
      continue;
    }
    const section = FORM_SECTIONS.find((s) => s.match(pt));
    const id = section?.id ?? 'other';
    const list = buckets.get(id) ?? [];
    list.push(decl);
    buckets.set(id, list);
  }
  return FORM_SECTIONS
    .filter((s) => buckets.has(s.id))
    .map((s) => ({
      id: s.id,
      labelKey: s.labelKey,
      items: buckets.get(s.id) ?? [],
    }));
}

export type EntityFormProps = {
  entityId: string;
  entityType: EntityTypeSchema;
  entityTypes: Record<string, EntityTypeSchema>;
  propertyTypes: Record<string, PropertyTypeSchema>;
  relationTypes: Record<string, RelationTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
  sources: readonly SourceRef[];
  i18nKeys: readonly string[];
  initialData: EntityData;
  initialTranslations: Translations;
  /** Save the entity. Identity (GitHub login OR anonymous pseudo) now
   *  travels on the better-auth session cookie set at `/login`, so no
   *  attribution parameter is needed at the call site. */
  onSave: (
    next: EntityData,
    translations: Translations,
  ) => Promise<void>;
  /**
   * Hide the form's built-in fixed save bar — used when the form is
   * embedded inside a drawer/modal that supplies its own footer. The
   * fixed bar would otherwise float over the host page behind the
   * drawer.
   */
  hideSaveBar?: boolean;
  /**
   * Parent-bumped counter that triggers an internal save when it
   * changes (skipping the initial value). Lets a drawer footer drive
   * the form's own `handleSave` without lifting state.
   */
  saveTrigger?: number;
  /**
   * Mirror of internal `{ dirty, saving, error }` so a parent can
   * render its own save button label/disabled state.
   */
  onStatus?: (status: { dirty: boolean; saving: boolean; error: string | null; }) => void;
};

function getValueField(propertyType: PropertyTypeSchema): 'value' | 'value_key' {
  return propertyType.localizable ? 'value_key' : 'value';
}

function entries(value: PropertyValue | undefined): PropertyEntry[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * "Empty" = no semantic content the user has actually typed. Used by:
 *  - the property sidebar's `filled` badge, so revealing an optional
 *    property without typing anything doesn't flip it to "filled"
 *  - the `dirty` / diff comparison, so the same reveal doesn't show
 *    up as an unsaved change
 *
 * For non-localizable properties: empty if `value` is undefined/null
 * or an empty string. (Numbers, booleans, dates etc. are never empty
 * once set — a literal `0` or `false` is real content.)
 *
 * For localizable properties: the entry carries a `value_key` (auto-
 * generated on reveal) that points into `translations`. We treat the
 * entry as empty iff NO locale has a non-empty translation for that
 * key. Otherwise the bare key is just a placeholder.
 */
function isEntryEmpty(
  entry: PropertyEntry,
  propertyType: PropertyTypeSchema,
  translations: Translations,
): boolean {
  if (propertyType.localizable) {
    const key = entry['value_key'];
    if (typeof key !== 'string' || key === '') return true;
    const en = translations.en[key] ?? '';
    const fr = translations.fr[key] ?? '';
    return en === '' && fr === '';
  }
  const v = entry['value'];
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v === '';
  // Numbers (incl. 0), booleans (incl. false), arrays, objects all
  // count as real content.
  return false;
}

/**
 * Strip empty entries from each property in `data`. Used to compute a
 * canonical "shape" for dirty comparison so that revealing an optional
 * property and then leaving it blank does NOT register as a change.
 * Properties whose entries all reduce to empty are dropped entirely.
 * Returns a new object — input is untouched.
 */
function stripEmptyProperties(
  data: EntityData,
  propertyTypes: Record<string, PropertyTypeSchema>,
  translations: Translations,
): EntityData {
  const props = data.properties;
  if (props === undefined || props === null) return data;
  const out: Record<string, PropertyValue> = {};
  for (const [propertyId, value] of Object.entries(props)) {
    const pt = propertyTypes[propertyId];
    // Property declared on no schema → keep verbatim, we don't know
    // its shape and dropping could lose data.
    if (pt === undefined) {
      out[propertyId] = value as PropertyValue;
      continue;
    }
    const list = entries(value as PropertyValue);
    const kept = list.filter((e) => !isEntryEmpty(e, pt, translations));
    if (kept.length === 0) continue;
    out[propertyId] = pt.historical ? kept : (kept[0] ?? {});
  }
  return { ...data, properties: out };
}

function enumValuesFor(
  propertyType: PropertyTypeSchema,
  vocabularies: Record<string, VocabularySchema>,
): readonly { id: string; labels: { en: string; fr: string; }; }[] {
  const enumRef = propertyType.value_constraints?.enum_ref;
  if (enumRef === undefined) return [];
  const vocab = vocabularies[enumRef];
  if (vocab === undefined) return [];
  return Object.entries(vocab.values).map(([id, v]) => ({
    id,
    labels: { en: v.labels.en, fr: v.labels.fr },
  }));
}

function entityTypeOptions(
  entityTypes: Record<string, EntityTypeSchema>,
  locale: Locale,
): readonly { id: string; label: string; }[] {
  return Object.values(entityTypes)
    .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Build an i18n key from `type.slug.propertyId[.index]`. For historical
 * properties, the index avoids colliding with siblings. The key is
 * deterministic for the first entry of a single-value property, so
 * existing data stays addressable when re-saved.
 */
function makeI18nKey(
  entityId: string,
  propertyId: string,
  historical: boolean,
  alreadyUsed: ReadonlySet<string>,
): string {
  const [type, slug] = entityId.includes(':')
    ? (entityId.split(':') as [string, string])
    : [entityId, entityId];
  const base = `${type}.${slug}.${propertyId}`;
  if (!historical) return base;
  let i = 0;
  while (alreadyUsed.has(`${base}.${i}`)) i++;
  return `${base}.${i}`;
}

export function EntityForm(props: EntityFormProps): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const [data, setData] = useState<EntityData>(props.initialData);
  const [translations, setTranslations] = useState<Translations>(props.initialTranslations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSchemaDetails, setShowSchemaDetails] = useState(false);
  const { draft, clear: clearStoredDraft } = useStoredDraft(props.entityId);
  // Auth state is only consumed to disable the save button + show a
  // helpful hint when no session is present (the user must sign in
  // at `/login`, even as anonymous-with-pseudo, before saving). The
  // identity itself is on the cookie — nothing to capture in form
  // state anymore.
  const { user, loaded: userLoaded } = useCurrentUser();
  const entityTypeOpts = useMemo(
    () => entityTypeOptions(props.entityTypes, locale),
    [props.entityTypes, locale],
  );

  // Normalize before comparing: empty entries (e.g. just-revealed
  // optional properties the user hasn't typed into yet) are stripped
  // so they never trigger a "dirty" state or surface as an unsaved
  // change. See `stripEmptyProperties` for the empty-entry rules.
  const initialDataNormalized = useMemo(
    () => stripEmptyProperties(props.initialData, props.propertyTypes, props.initialTranslations),
    [props.initialData, props.propertyTypes, props.initialTranslations],
  );
  const initialDataString = useMemo(
    () => JSON.stringify(initialDataNormalized),
    [initialDataNormalized],
  );
  const initialTranslationsString = useMemo(
    () => JSON.stringify(props.initialTranslations),
    [props.initialTranslations],
  );
  const currentDataNormalized = useMemo(
    () => stripEmptyProperties(data, props.propertyTypes, translations),
    [data, props.propertyTypes, translations],
  );
  const currentDataString = useMemo(
    () => JSON.stringify(currentDataNormalized),
    [currentDataNormalized],
  );
  const dirty = currentDataString !== initialDataString
    || JSON.stringify(translations) !== initialTranslationsString;

  const draftDataNormalized = useMemo(
    () =>
      draft === null
        ? null
        : stripEmptyProperties(
          draft.data as EntityData,
          props.propertyTypes,
          draft.translations,
        ),
    [draft, props.propertyTypes],
  );
  const draftIsRecoverable = draft !== null
    && draftDataNormalized !== null
    && (JSON.stringify(draftDataNormalized) !== initialDataString
      || JSON.stringify(draft.translations) !== initialTranslationsString);

  useDraftAutosave(props.entityId, data, translations, dirty);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void handleSave();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, data, translations]);

  /**
   * Auto-fill a property's value, but only if it's currently empty.
   * Used by derive-from-context flows (image upload → format / width
   * / height). Never clobbers a value the maintainer typed. Always
   * writes the non-historical singleton shape since today's only
   * caller (image meta) targets non-historical properties.
   */
  function setEmptyProperty(propertyId: string, value: unknown): void {
    if (value === undefined || value === null || value === '') return;
    setData((prev) => {
      const properties = { ...prev.properties };
      const existing = properties[propertyId];
      const currentValue = Array.isArray(existing)
        ? (existing[existing.length - 1] as PropertyEntry | undefined)?.['value']
        : (existing as PropertyEntry | undefined)?.['value'];
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') return prev;
      properties[propertyId] = { value };
      return { ...prev, properties };
    });
  }

  function setEntries(propertyId: string, historical: boolean, list: PropertyEntry[]): void {
    setData((prev) => {
      const properties = { ...prev.properties };
      if (historical) {
        properties[propertyId] = list;
      } else {
        properties[propertyId] = list[0] ?? {};
      }
      return { ...prev, properties };
    });
  }

  function updateEntry(
    propertyId: string,
    historical: boolean,
    entryIndex: number,
    next: PropertyEntry,
  ): void {
    const list = entries(data.properties?.[propertyId]).slice();
    list[entryIndex] = next;
    setEntries(propertyId, historical, list);
  }

  function addEntry(propertyId: string, propertyType: PropertyTypeSchema): void {
    const list = entries(data.properties?.[propertyId]).slice();
    const valueField = getValueField(propertyType);
    const entry: PropertyEntry = propertyType.localizable
      ? {
        [valueField]: makeI18nKey(
          props.entityId,
          propertyId,
          propertyType.historical,
          new Set(list.map((e) => String(e[valueField] ?? ''))),
        ),
      }
      : { [valueField]: '' };
    if (propertyType.historical) entry['since'] = '';
    list.push(entry);
    setEntries(propertyId, propertyType.historical, list);
  }

  function removeEntry(
    propertyId: string,
    propertyType: PropertyTypeSchema,
    entryIndex: number,
  ): void {
    const list = entries(data.properties?.[propertyId]).slice();
    const removed = list[entryIndex];
    list.splice(entryIndex, 1);
    setEntries(propertyId, propertyType.historical, list);
    // Clean up orphan translations for the removed key.
    if (propertyType.localizable && removed !== undefined) {
      const key = String(removed['value_key'] ?? '');
      if (key !== '') {
        setTranslations((prev) => {
          const en = { ...prev.en };
          const fr = { ...prev.fr };
          delete en[key];
          delete fr[key];
          return { en, fr };
        });
      }
    }
  }

  function updateTranslation(locale: 'en' | 'fr', key: string, value: string): void {
    setTranslations((prev) => {
      const next = { ...prev[locale] };
      if (value === '') delete next[key];
      else next[key] = value;
      return { ...prev, [locale]: next };
    });
  }

  /**
   * Per-property server validation errors from the last save attempt.
   * Keyed by property id (the second segment of the Zod path, e.g.
   * `["properties","bounty","0","value"]` → `bounty`). Cleared on
   * the next dirty change so the maintainer isn't yelled at after
   * fixing the typo.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, readonly string[]>>({});
  const [topLevelErrors, setTopLevelErrors] = useState<readonly string[]>([]);

  // Clear errors when the user starts editing again — keeping a stale
  // red ring around a property the user just corrected is hostile.
  // Compares stringified data via the existing memo for cheapness.
  const errorClearMemo = useRef(currentDataString);
  useEffect(() => {
    if (currentDataString !== errorClearMemo.current) {
      errorClearMemo.current = currentDataString;
      if (Object.keys(fieldErrors).length > 0 || topLevelErrors.length > 0) {
        setFieldErrors({});
        setTopLevelErrors([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDataString]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setTopLevelErrors([]);
    try {
      // Send the normalised payload — strips entries the user revealed
      // but never filled in (e.g. clicked the sidebar then changed
      // their mind). Sending them as-is would either fail the server-
      // side Zod (empty string on a non-localizable property) or
      // pollute the entity JSON with `{ "value": "" }` stubs.
      await props.onSave(currentDataNormalized, translations);
      clearStoredDraft();
    } catch (err) {
      const issues = validationIssues(err);
      if (issues !== null) {
        // Map structured Zod issues onto fields. `path[0]` is always
        // 'properties' for property errors; `path[1]` is the
        // property id. Anything else (id/type/slug/$schema/root)
        // surfaces as a top-level banner instead of trying to
        // attribute it to a field that doesn't exist in the UI.
        const byProperty: Record<string, string[]> = {};
        const topLevel: string[] = [];
        for (const issue of issues) {
          const formatted = issue.message;
          if (issue.path[0] === 'properties' && typeof issue.path[1] === 'string') {
            const id = issue.path[1];
            const subPath = issue.path.slice(2).join('.');
            const prefix = subPath === '' ? '' : `${subPath}: `;
            (byProperty[id] ??= []).push(`${prefix}${formatted}`);
          } else {
            const p = issue.path.join('.') || '<root>';
            topLevel.push(`${p}: ${formatted}`);
          }
        }
        setFieldErrors(byProperty);
        setTopLevelErrors(topLevel);
        setError(null); // top-banner is already covered by topLevelErrors
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  // Mirror dirty/saving/error to a parent (drawer footer, etc.).
  useEffect(() => {
    props.onStatus?.({ dirty, saving, error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, error]);

  // External save trigger: parent bumps `saveTrigger`, we save once.
  const lastTrigger = useRef(props.saveTrigger);
  useEffect(() => {
    if (props.saveTrigger === undefined) return;
    if (props.saveTrigger === lastTrigger.current) return;
    lastTrigger.current = props.saveTrigger;
    if (dirty && !saving) void handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.saveTrigger]);

  // Auto-apply the persisted draft as soon as it loads. The
  // alternative — making the maintainer click "Restore" every time —
  // produced lost work in practice: people skim past the banner,
  // edit something else, and then realise the form re-rendered with
  // disk values, not their previous edits. Auto-apply trusts the
  // persistence layer: if a draft exists we *always* prefer it over
  // the disk snapshot, because the form's job is to show "what the
  // maintainer was working on", not "what's currently in git".
  //
  // Guard: only run while the local form is still pristine (matches
  // disk). If the user has typed something *before* the async draft
  // load resolves (rare but possible), we don't clobber their work.
  const draftApplied = useRef(false);
  useEffect(() => {
    if (draftApplied.current) return;
    if (draft === null) return;
    const pristine = JSON.stringify(data) === initialDataString
      && JSON.stringify(translations) === initialTranslationsString;
    if (!pristine) {
      draftApplied.current = true; // user started editing; bail.
      return;
    }
    // Overlay the canonical envelope (id/type/slug/$schema/schema_version)
    // from the entity on disk over the draft. Drafts only ever mutate
    // properties + relations + translations; everything else is
    // immutable per the data model. An older draft missing those
    // fields — or carrying a stale envelope (schema_version bump,
    // pre-rename slug …) — would otherwise fail the server's
    // `data.id must equal …` check on save. Force-write the immutables
    // last so they always win over whatever the draft happened to
    // serialise.
    const restored = draft.data as EntityData;
    const initial = props.initialData as EntityData & {
      id?: unknown;
      type?: unknown;
      slug?: unknown;
      $schema?: unknown;
      schema_version?: unknown;
    };
    setData({
      ...initial,
      ...restored,
      id: initial.id,
      type: initial.type,
      slug: initial.slug,
      ...(initial.$schema !== undefined ? { $schema: initial.$schema } : {}),
      ...(initial.schema_version !== undefined
        ? { schema_version: initial.schema_version }
        : {}),
    });
    setTranslations(draft.translations);
    draftApplied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  type Decl = (typeof props.entityType.properties)[number];
  const visible: Decl[] = [];
  const hidden: Decl[] = [];
  for (const decl of props.entityType.properties) {
    const required = decl.required ?? false;
    const hasContent = entries(data.properties?.[decl.id]).length > 0;
    if (required || hasContent) visible.push(decl);
    else hidden.push(decl);
  }

  const navEntries: NavEntry[] = props.entityType.properties.map((decl) => {
    const pt = props.propertyTypes[decl.id];
    const label = pt?.labels[locale] ?? pt?.labels.en ?? decl.id;
    const section = pt !== undefined
      ? (FORM_SECTIONS.find((s) => s.match(pt)) ?? FORM_SECTIONS[FORM_SECTIONS.length - 1]!)
      : FORM_SECTIONS[FORM_SECTIONS.length - 1]!;
    // "Filled" iff at least one entry has actual content. An entry
    // that just exists (e.g. revealed via the sidebar but never typed
    // into) does NOT count — otherwise revealing then leaving blank
    // would mark the property as filled, which contradicts the
    // green-check semantics. See `isEntryEmpty`.
    const list = entries(data.properties?.[decl.id]);
    const filled = pt !== undefined
      && list.some((e) => !isEntryEmpty(e, pt, translations));
    return {
      id: decl.id,
      label,
      required: decl.required ?? false,
      filled,
      sectionId: section.id,
      sectionLabelKey: section.labelKey,
    };
  });

  function reveal(propertyId: string): void {
    const pt = props.propertyTypes[propertyId];
    if (pt === undefined) return;
    if (entries(data.properties?.[propertyId]).length > 0) return;
    addEntry(propertyId, pt);
  }

  // Slug-derived display names ("Portgas D Ace") used to appear as
  // placeholders + one-click "Use from slug" suggestions on the name
  // field, but the maintainer-facing UX was misleading: a slug isn't
  // a translation, just an URL identifier, and the suggestion implied
  // it was a sensible default in every locale. Keep the plumbing in
  // case we want a smarter suggestion later, but no fallback today.
  const fallbackName: string | undefined = undefined;

  function renderRow(decl: Decl, idx: number): JSX.Element {
    const propertyType = props.propertyTypes[decl.id];
    if (propertyType === undefined) {
      return (
        <div
          key={decl.id}
          id={propertyAnchorId(decl.id)}
          className='px-3 py-2 text-sm scroll-mt-20'
        >
          <code className='font-mono'>{decl.id}</code>{' '}
          <Badge variant='destructive'>unknown property type</Badge>
        </div>
      );
    }
    const valueField = getValueField(propertyType);
    const propertyEntries = entries(data.properties?.[decl.id]);
    const valueType = propertyType.value_type as ValueType;
    const valueCtx: ValueInputContext = {
      enumValues: enumValuesFor(propertyType, props.vocabularies),
      sources: props.sources,
      i18nKeys: props.i18nKeys,
      entityTypes: entityTypeOpts,
    };
    const propertyLabel = propertyType.labels[locale] ?? propertyType.labels.en ?? decl.id;
    return (
      <PropertyRow
        key={decl.id}
        anchorId={propertyAnchorId(decl.id)}
        propertyId={decl.id}
        propertyLabel={propertyLabel}
        required={decl.required ?? false}
        defaultOpen={idx === 0}
        propertyType={propertyType}
        valueType={valueType}
        valueField={valueField}
        entries={propertyEntries}
        translations={translations}
        valueCtx={valueCtx}
        vocabularies={props.vocabularies}
        fallbackName={fallbackName}
        showSchemaDetails={showSchemaDetails}
        locale={locale}
        {...(fieldErrors[decl.id] !== undefined ? { errors: fieldErrors[decl.id]! } : {})}
        onUpdate={(eIdx, next) => updateEntry(decl.id, propertyType.historical, eIdx, next)}
        onAdd={() => addEntry(decl.id, propertyType)}
        onRemove={(eIdx) => removeEntry(decl.id, propertyType, eIdx)}
        onTranslate={updateTranslation}
        setEmptyProperty={setEmptyProperty}
      />
    );
  }

  const adderItems = hidden.map((decl) => {
    const pt = props.propertyTypes[decl.id];
    const label = pt?.labels[locale] ?? pt?.labels.en ?? decl.id;
    return {
      value: decl.id,
      label,
      searchText: `${label} ${decl.id}`,
    };
  });

  return (
    <div className='pb-24'>
      {topLevelErrors.length > 0
        ? (
          <div
            role='alert'
            className='border-destructive/40 bg-destructive/5 text-destructive mb-4 rounded-[3px] border px-3 py-2'
          >
            <p className='mb-1 text-[11px] font-semibold uppercase tracking-wide'>
              {t('validationFailed')}
            </p>
            <ul className='space-y-0.5 text-[11px]'>
              {topLevelErrors.map((msg, i) => (
                <li key={i} className='flex items-start gap-1'>
                  <AlertCircle className='mt-[1px] size-3 shrink-0' aria-hidden='true' />
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )
        : null}
      {
        /* Compact "restored from draft" hint — data is already applied
          by the auto-apply effect, so no Restore button is needed.
          Discard rolls back to the on-disk values for this entity. */
      }
      {draftIsRecoverable
        ? (
          <div className='border-amber-500/40 bg-amber-500/5 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[3px] border px-3 py-1.5'>
            <span className='text-muted-foreground text-[11px]'>
              <span className='text-amber-500'>●</span> {t('unsavedDraft')}
              <span className='ml-2'>
                {t('savedAt')}{' '}
                {draft !== null ? new Date(draft.savedAt).toLocaleString(locale) : ''}
              </span>
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-6 px-2 text-[11px]'
              onClick={() => {
                clearStoredDraft();
                setData(props.initialData);
                setTranslations(props.initialTranslations);
              }}
            >
              {t('discard')}
            </Button>
          </div>
        )
        : null}

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[14rem_1fr]'>
        <aside className='lg:sticky lg:top-4 lg:self-start'>
          <PropertyNav
            entries={navEntries}
            onReveal={(id) => reveal(id)}
          />
        </aside>

        <div className='min-w-0 space-y-3'>
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='text-muted-foreground h-7 px-2 text-xs'
              onClick={() => setShowSchemaDetails((v) => !v)}
            >
              {showSchemaDetails ? t('hideSchemaDetails') : t('showSchemaDetails')}
            </Button>
          </div>

          {visible.length > 0
            ? (() => {
              const sections = groupBySection(visible, props.propertyTypes);
              let globalIdx = 0;
              return (
                <div className='space-y-5'>
                  {sections.map((s) => (
                    <section key={s.id}>
                      <header className='border-border mb-2 flex items-baseline justify-between border-b pb-1'>
                        <h2 className='text-foreground text-[11px] font-semibold uppercase tracking-wider'>
                          {t(s.labelKey)}
                        </h2>
                        <span className='text-muted-foreground text-[10px]'>
                          {s.items.length} {s.items.length === 1
                            ? t('fieldsSingular')
                            : t('fieldsPlural')}
                        </span>
                      </header>
                      <div className='divide-border/60 divide-y'>
                        {s.items.map((decl) => {
                          const row = renderRow(decl as Decl, globalIdx);
                          globalIdx++;
                          return row;
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              );
            })()
            : (
              <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>
                {t('noProperties')}
              </div>
            )}

          {hidden.length > 0
            ? (
              <Combobox
                value={undefined}
                onChange={(propertyId) => {
                  const pt = props.propertyTypes[propertyId];
                  if (pt !== undefined) addEntry(propertyId, pt);
                  requestAnimationFrame(() => {
                    const el = document.getElementById(propertyAnchorId(propertyId));
                    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                items={adderItems}
                placeholder={`+ ${t('addProperty')} (${hidden.length} ${t('available')})`}
                emptyText={t('noMatch')}
              />
            )
            : null}

          <RelationsEditor
            entityType={props.entityType}
            relationTypes={props.relationTypes}
            vocabularies={props.vocabularies}
            valueCtx={{
              enumValues: [],
              sources: props.sources,
              i18nKeys: props.i18nKeys,
              entityTypes: entityTypeOpts,
            }}
            relations={(data['relations'] as RelationEntry[] | undefined) ?? []}
            onChange={(next) => {
              setData((prev) => ({ ...prev, relations: next }));
            }}
          />
        </div>
      </div>

      {props.hideSaveBar === true
        ? null
        : (
          // Spans the *content* area only, never under the app sidebar.
          // `right-0 left-0` on mobile (no sidebar shown), `lg:left-64`
          // (= 16rem, matching the sidebar grid column width in
          // __root.tsx) on desktop pushes the bar past the sidebar.
          <div className='border-border bg-background/95 fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur lg:left-[16rem]'>
            <div className='mx-auto flex w-full max-w-[100rem] items-center justify-between gap-3 px-6 py-3'>
              <div className='text-muted-foreground text-xs flex items-center gap-2'>
                {dirty
                  ? (
                    <>
                      <DiffPopover
                        propertyLabels={Object.fromEntries(
                          Object.entries(props.propertyTypes).map(([id, pt]) => [
                            id,
                            pt.labels[locale] ?? pt.labels.en ?? id,
                          ]),
                        )}
                        // Use the same normalised payloads driving
                        // `dirty` — otherwise revealing an empty
                        // property would surface as a phantom diff
                        // ("∅ → [{}]") even though `dirty` is false.
                        initialData={initialDataNormalized}
                        initialTranslations={props.initialTranslations}
                        data={currentDataNormalized}
                        translations={translations}
                        locale={locale}
                      />
                      <span className='text-muted-foreground text-[10px]'>
                        · {t('saveShortcut')}
                      </span>
                    </>
                  )
                  : <span>{t('noChanges')}</span>}
                {error !== null
                  ? <span className='text-destructive ml-3'>{error}</span>
                  : null}
              </div>
              <div className='flex items-center gap-2'>
                {
                  /* Sign-in prompt — shown when no session is present.
                    The save button stays disabled until the user picks
                    a flow (anonymous-with-pseudo OR GitHub) on the
                    /login page. Identity is no longer captured here. */
                }
                {userLoaded && user === null
                  ? (
                    <a
                      href='/login'
                      className='text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline'
                      title={t('signInToSave')}
                    >
                      {t('signInToSave')}
                    </a>
                  )
                  : null}
                <Button
                  type='button'
                  disabled={saving || !dirty || (userLoaded && user === null)}
                  onClick={handleSave}
                >
                  {saving ? t('openingPr') : t('openPr')}
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

type PropertyRowProps = {
  anchorId: string;
  propertyId: string;
  propertyLabel: string;
  required: boolean;
  defaultOpen: boolean;
  propertyType: PropertyTypeSchema;
  valueType: ValueType;
  valueField: 'value' | 'value_key';
  entries: readonly PropertyEntry[];
  translations: Translations;
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  fallbackName?: string | undefined;
  showSchemaDetails: boolean;
  locale: Locale;
  /** Server-side Zod errors attached to this property (sub-path
   *  prefixed when the error targets a specific entry/qualifier).
   *  Renders as a red ring + bullet list under the entries. Undefined
   *  / empty = no error to show. */
  errors?: readonly string[];
  onUpdate: (idx: number, next: PropertyEntry) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onTranslate: (locale: 'en' | 'fr', key: string, value: string) => void;
  /** Auto-fill a sibling property's value; no-op if already set.
   *  Used today by the image uploader to populate format / width /
   *  height after a successful upload. */
  setEmptyProperty: (propertyId: string, value: unknown) => void;
};

/**
 * Accordion-style property row. Header is always visible (label,
 * summary of current value, expand/collapse toggle). Body shows a
 * stack of compact entry cards plus a "+" tile at the end for
 * historical properties. Maintainer scans collapsed rows, expands
 * what they want to edit.
 */
function PropertyRow(p: PropertyRowProps): JSX.Element {
  const t = useT();
  const isHistorical = p.propertyType.historical;
  const isLocalizable = p.propertyType.localizable;
  // Reserved for an opt-in collapse if we re-introduce it later.
  void p.defaultOpen;
  void summariseProperty;

  const isRequiredMissing = p.required && p.entries.length === 0;
  const hasError = (p.errors?.length ?? 0) > 0;
  // The error ring beats the required-missing ring — a server-rejected
  // value is a hard blocker the maintainer must look at first, before
  // worrying about missing optionals or required-empty hints.
  const ringClass = hasError
    ? 'bg-destructive/5 ring-1 ring-destructive/40 ring-inset'
    : isRequiredMissing
    ? 'bg-amber-500/5 ring-1 ring-amber-500/30 ring-inset'
    : '';
  return (
    <div
      id={p.anchorId}
      className={`scroll-mt-20 rounded-[3px] px-3 py-2.5 transition-colors ${ringClass}`}
    >
      <div className='mb-1.5 flex items-baseline gap-2'>
        <Label
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            isRequiredMissing ? 'text-amber-500' : 'text-muted-foreground'
          }`}
        >
          {p.propertyLabel}
          {p.required
            ? (
              <span
                className={isRequiredMissing ? 'text-amber-500 ml-0.5' : 'text-destructive ml-0.5'}
                title={t('required')}
              >
                *
              </span>
            )
            : null}
        </Label>
        {p.required && !isRequiredMissing
          ? null
          : !p.required
          ? <span className='text-muted-foreground/60 text-[9px] uppercase'>{t('optional')}</span>
          : null}
        {p.showSchemaDetails
          ? <span className='text-muted-foreground font-mono text-[10px]'>{p.propertyId}</span>
          : null}
        {p.showSchemaDetails
          ? (
            <span className='ml-auto flex flex-wrap gap-1'>
              <Badge variant='secondary' className='font-normal'>{p.valueType}</Badge>
              {isHistorical
                ? <Badge variant='outline' className='font-normal'>historical</Badge>
                : null}
              {isLocalizable
                ? <Badge variant='outline' className='font-normal'>localizable</Badge>
                : null}
            </span>
          )
          : null}
      </div>

      {p.entries.length === 0
        ? (
          <Button
            type='button'
            variant={isRequiredMissing ? 'default' : 'outline'}
            size='sm'
            onClick={p.onAdd}
          >
            <Plus className='size-3.5' />
            {isHistorical ? t('addEntry') : t('setValue')}
            {isRequiredMissing
              ? (
                <span className='ml-1 text-[10px] opacity-75'>
                  · {t('required')}
                </span>
              )
              : null}
          </Button>
        )
        : (
          <div className='space-y-2'>
            {p.entries.map((entry, idx) => (
              <EntryCard
                key={idx}
                entry={entry}
                propertyType={p.propertyType}
                valueType={p.valueType}
                valueField={p.valueField}
                translations={p.translations}
                valueCtx={p.valueCtx}
                vocabularies={p.vocabularies}
                fallbackName={p.fallbackName}
                showRemove={isHistorical || p.entries.length > 0}
                onUpdate={(next) => p.onUpdate(idx, next)}
                onRemove={() => p.onRemove(idx)}
                onTranslate={p.onTranslate}
                setEmptyProperty={p.setEmptyProperty}
              />
            ))}
            {isHistorical
              ? (
                <button
                  type='button'
                  onClick={p.onAdd}
                  className='border-input/60 text-muted-foreground hover:border-input hover:text-foreground hover:bg-accent/40 flex w-full items-center justify-center gap-1 rounded-[3px] border border-dashed py-2 text-xs transition-colors'
                >
                  <Plus className='size-3.5' />
                  {t('addEntry')}
                </button>
              )
              : null}
          </div>
        )}
      {hasError
        ? (
          <ul className='text-destructive mt-1.5 space-y-0.5 text-[11px]'>
            {p.errors!.map((msg, i) => (
              <li key={i} className='flex items-start gap-1'>
                <AlertCircle
                  className='mt-[1px] size-3 shrink-0'
                  aria-hidden='true'
                />
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        )
        : null}
    </div>
  );
}

type EntryCardProps = {
  entry: PropertyEntry;
  propertyType: PropertyTypeSchema;
  valueType: ValueType;
  valueField: 'value' | 'value_key';
  translations: Translations;
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  fallbackName?: string | undefined;
  showRemove: boolean;
  onUpdate: (next: PropertyEntry) => void;
  onRemove: () => void;
  onTranslate: (locale: 'en' | 'fr', key: string, value: string) => void;
  setEmptyProperty: (propertyId: string, value: unknown) => void;
};

/**
 * One historisable entry rendered as a compact, self-contained card.
 * Body: value (or EN/FR), then `since` (for historical), then a
 * "More options" Collapsible that exposes every remaining qualifier.
 */
function EntryCard(p: EntryCardProps): JSX.Element {
  const t = useT();
  const qLabel = useQualifierLabel();
  const { primary, secondary } = useMemo(
    () =>
      resolveQualifiers(
        p.propertyType.default_qualifiers,
        p.propertyType.allowed_qualifiers,
        ['since'],
      ),
    [p.propertyType],
  );

  function setQualifier(id: string, value: unknown): void {
    const next: PropertyEntry = { ...p.entry };
    if (
      value === undefined
      || value === null
      || (typeof value === 'string' && value === '')
      || (Array.isArray(value) && value.length === 0)
    ) {
      delete next[id];
    } else {
      next[id] = value;
    }
    p.onUpdate(next);
  }

  const allQualifiers = [...primary, ...secondary];
  const qualifierById = useMemo(
    () => new Map(allQualifiers.map((q) => [q.id, q])),
    [allQualifiers],
  );

  // The set of qualifier ids the user has actually populated. Drives
  // both the trigger badge and the QualifierSheet's "show only set"
  // behaviour.
  const setIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of allQualifiers) {
      const v = p.entry[q.id];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      s.add(q.id);
    }
    return s;
  }, [allQualifiers, p.entry]);
  const setQualifierCount = setIds.size;

  return (
    <div className='border-input/70 bg-card/40 relative flex flex-col gap-1.5 rounded-[3px] border p-2'>
      {
        /* Destructive ✕ pinned top-right alone, well away from any
          neutral affordance — accidental clicks on the remove button
          were too easy when it sat next to the more-options trigger. */
      }
      {p.showRemove
        ? (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='absolute right-0.5 top-0.5 size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10'
            onClick={p.onRemove}
            aria-label={t('removeEntry')}
          >
            <X className='size-3' />
          </Button>
        )
        : null}

      <div className='pr-12'>
        <EntryValue
          propertyType={p.propertyType}
          valueType={p.valueType}
          valueField={p.valueField}
          entry={p.entry}
          translations={p.translations}
          valueCtx={p.valueCtx}
          fallbackName={p.fallbackName}
          onUpdate={p.onUpdate}
          onTranslate={p.onTranslate}
          setEmptyProperty={p.setEmptyProperty}
        />
      </div>

      {p.propertyType.historical
        ? (
          <QualifierField
            qualifier={{
              id: 'since',
              label: 'Since',
              valueType: 'source_ref',
              required: true,
              multi: true,
            }}
            value={p.entry['since']}
            valueCtx={p.valueCtx}
            vocabularies={p.vocabularies}
            propertyValueType={p.valueType}
            onChange={(v) => setQualifier('since', v)}
          />
        )
        : null}

      {
        /* More-options sheet — slides in from the right. Renders only
          the qualifiers actually set + an "Add qualifier" picker, so
          a property with 12 allowed qualifiers doesn't dump 12 empty
          inputs on the maintainer's face. */
      }
      {allQualifiers.length > 0
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
            qualifiers={allQualifiers.map((q) => ({
              id: q.id,
              label: qLabel(q.id, q.label),
            }))}
            setIds={setIds}
            renderField={(id) => {
              const q = qualifierById.get(id);
              if (q === undefined) return null;
              return (
                <QualifierField
                  key={id}
                  qualifier={q}
                  value={p.entry[id]}
                  valueCtx={p.valueCtx}
                  vocabularies={p.vocabularies}
                  propertyValueType={p.valueType}
                  onChange={(v) => setQualifier(id, v)}
                />
              );
            }}
          />
        )
        : null}
    </div>
  );
}

/**
 * Build a one-line summary for the property's collapsed accordion
 * header. Localizable / enum / source_ref / number / boolean each get
 * a sensible compact rendering.
 */
function summariseProperty(args: {
  propertyType: PropertyTypeSchema;
  valueType: ValueType;
  valueField: 'value' | 'value_key';
  entries: readonly PropertyEntry[];
  translations: Translations;
  vocabularies: Record<string, VocabularySchema>;
  sources: readonly SourceRef[];
  locale: Locale;
}): string | null {
  if (args.entries.length === 0) return null;
  const last = args.entries[args.entries.length - 1]!;
  const raw = last[args.valueField];
  let display: string;
  if (args.propertyType.localizable) {
    const key = String(raw ?? '');
    display = args.translations[args.locale][key]
      ?? args.translations.en[key]
      ?? '—';
  } else if (args.valueType === 'enum') {
    const enumRef = args.propertyType.value_constraints?.enum_ref;
    const id = String(raw ?? '');
    if (enumRef !== undefined) {
      const v = args.vocabularies[enumRef]?.values[id];
      display = v?.labels[args.locale] ?? v?.labels.en ?? id;
    } else {
      display = id;
    }
  } else if (args.valueType === 'multi_enum') {
    const ids = Array.isArray(raw) ? (raw as unknown[]).map(String) : [];
    display = ids.length === 0 ? '—' : ids.join(', ');
  } else if (args.valueType === 'source_ref' || args.valueType === 'entity_ref') {
    const id = String(raw ?? '');
    const src = args.sources.find((s) => s.id === id);
    display = src?.displayName[args.locale]
      ?? src?.displayName.en
      ?? (id.includes(':') ? id.split(':')[1]! : id)
      ?? '—';
  } else if (args.valueType === 'boolean') {
    display = raw === true ? '✓' : raw === false ? '×' : '—';
  } else if (args.valueType === 'number') {
    if (typeof raw !== 'number') {
      display = '—';
    } else {
      const formatted = raw.toLocaleString(args.locale);
      display = args.propertyType.unit !== undefined
        ? `${formatted} ${args.propertyType.unit}`
        : formatted;
    }
  } else {
    display = raw === undefined || raw === null || raw === '' ? '—' : String(raw);
  }
  if (args.entries.length > 1) {
    return `${display} · ${args.entries.length} entries`;
  }
  return display;
}

type EntryValueProps = {
  propertyType: PropertyTypeSchema;
  valueType: ValueType;
  valueField: 'value' | 'value_key';
  entry: PropertyEntry;
  translations: Translations;
  valueCtx: ValueInputContext;
  /** Slug-derived display name (e.g. "Monkey D Luffy"). */
  fallbackName?: string | undefined;
  onUpdate: (next: PropertyEntry) => void;
  onTranslate: (locale: 'en' | 'fr', key: string, value: string) => void;
  setEmptyProperty: (propertyId: string, value: unknown) => void;
};

function EntryValue(p: EntryValueProps): JSX.Element {
  // Special-case the image entity-type's `url` property: instead of a
  // plain string input, render the drag-drop uploader that goes
  // straight to R2 via a presigned PUT. The property type is
  // applies_to_entity_types=['image'], so `id === 'url'` is enough.
  //
  // On successful upload we also derive sibling fields from the
  // file's metadata: format (from MIME type), image_width and
  // image_height (decoded in-browser via the Image API). Each is
  // applied via setEmptyProperty so a maintainer's manual override
  // is never clobbered.
  if (p.propertyType.id === 'url') {
    const current = p.entry[p.valueField];
    return (
      <ImageUpload
        value={typeof current === 'string' ? current : undefined}
        onChange={(next) => p.onUpdate({ ...p.entry, [p.valueField]: next })}
        onUploaded={(meta) => {
          if (meta.format !== undefined) p.setEmptyProperty('format', meta.format);
          if (meta.width !== undefined) p.setEmptyProperty('image_width', meta.width);
          if (meta.height !== undefined) p.setEmptyProperty('image_height', meta.height);
        }}
      />
    );
  }

  if (p.propertyType.localizable) {
    return (
      <LocalizedValueField
        propertyType={p.propertyType}
        valueField={p.valueField}
        entry={p.entry}
        translations={p.translations}
        fallbackName={p.fallbackName}
        onTranslate={p.onTranslate}
      />
    );
  }
  return (
    <ValueInput
      valueType={p.valueType}
      value={p.entry[p.valueField]}
      ctx={p.valueCtx}
      onChange={(next) => p.onUpdate({ ...p.entry, [p.valueField]: next })}
    />
  );
}

/**
 * Multi-locale translation editor. Inline view shows ONLY the active
 * locale's input — designed to scale to 5–10+ languages without
 * cluttering the form. A small globe button to the right opens a
 * popover listing every supported locale, each with its own input,
 * plus a count badge ("2 / 5") so the user knows how many languages
 * are filled at a glance.
 *
 * When the active-locale field is empty:
 *   - If another locale has a value → shown as muted italic placeholder
 *     ("preview of what would render"),
 *   - else if the property is `name` and a slug-derived fallback exists →
 *     shown as a clickable suggestion pill below the input so the
 *     maintainer can adopt it in one click.
 */
function LocalizedValueField(p: {
  propertyType: PropertyTypeSchema;
  valueField: 'value' | 'value_key';
  entry: PropertyEntry;
  translations: Translations;
  fallbackName?: string | undefined;
  onTranslate: (locale: Locale, key: string, value: string) => void;
}): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const i18nKey = String(p.entry[p.valueField] ?? '');

  const valueAt = (loc: Locale): string => p.translations[loc][i18nKey] ?? '';
  const activeValue = valueAt(locale);
  const filledCount = SUPPORTED_LOCALES.filter((loc) => valueAt(loc) !== '').length;
  const totalLocales = SUPPORTED_LOCALES.length;

  // The placeholder previews another-locale value when one exists, so
  // the maintainer can crib a translation. Stays italic so it can't
  // be confused with a real entry. Slug-derived fallbacks were
  // deliberately dropped — see the `fallbackName` comment in
  // EntityForm.
  const fallbackValue = (() => {
    const other = SUPPORTED_LOCALES.find((loc) => loc !== locale && valueAt(loc) !== '');
    if (other !== undefined) return { source: 'translation' as const, text: valueAt(other) };
    return null;
  })();

  const placeholder = fallbackValue !== null
    ? fallbackValue.text
    : locale === 'fr'
    ? 'Valeur française'
    : 'English value';

  return (
    <div className='space-y-1'>
      <div className='flex items-center gap-1.5'>
        <div className='border-input bg-background flex h-8 flex-1 items-stretch overflow-hidden rounded-[3px] border focus-within:border-ring'>
          <span className='bg-muted/60 text-muted-foreground border-input flex w-7 shrink-0 items-center justify-center border-r font-mono text-[10px] uppercase'>
            {locale}
          </span>
          <input
            type='text'
            value={activeValue}
            onChange={(e) => p.onTranslate(locale, i18nKey, e.target.value)}
            placeholder={placeholder}
            disabled={i18nKey === ''}
            className='flex-1 min-w-0 bg-transparent px-2 text-xs placeholder:text-muted-foreground/70 placeholder:italic focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
          />
        </div>

        {/* Translations popover — globe + count badge. */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type='button'
                variant='outline'
                className='h-8 shrink-0 gap-1 px-1.5 text-muted-foreground whitespace-nowrap'
                aria-label={t('translations')}
                title={`${t('translations')} · ${filledCount}/${totalLocales}`}
              />
            }
          >
            <Globe className='size-3.5' />
            <span className='text-[10px] font-medium tabular-nums leading-none'>
              {filledCount}/{totalLocales}
            </span>
          </PopoverTrigger>
          <PopoverContent align='end' side='bottom' className='w-80 max-w-[calc(100vw-2rem)] p-3'>
            <div className='mb-2 flex items-center gap-1.5'>
              <Globe className='text-muted-foreground size-3.5' />
              <span className='text-[11px] font-semibold uppercase tracking-wide'>
                {t('translations')}
              </span>
              <span className='text-muted-foreground ml-auto text-[10px]'>
                {filledCount}/{totalLocales}
              </span>
            </div>
            <div className='space-y-1.5'>
              {SUPPORTED_LOCALES.map((loc) => (
                <div
                  key={loc}
                  className={`border-input bg-background flex h-8 items-stretch overflow-hidden rounded-[3px] border focus-within:border-ring ${
                    loc === locale ? 'ring-1 ring-primary/40' : ''
                  }`}
                >
                  <span className='bg-muted/60 text-muted-foreground border-input flex w-7 shrink-0 items-center justify-center border-r font-mono text-[10px] uppercase'>
                    {loc}
                  </span>
                  <input
                    type='text'
                    value={valueAt(loc)}
                    onChange={(e) => p.onTranslate(loc, i18nKey, e.target.value)}
                    placeholder={fallbackValue !== null ? fallbackValue.text : ''}
                    disabled={i18nKey === ''}
                    className='flex-1 min-w-0 bg-transparent px-2 text-xs placeholder:text-muted-foreground/70 placeholder:italic focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                  />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

type QualifierFieldProps = {
  qualifier: QualifierDef;
  value: unknown;
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  /** The host property's value_type — used by `actual_value` to mirror it. */
  propertyValueType: ValueType;
  onChange: (next: unknown) => void;
  trailing?: JSX.Element | null;
};

function QualifierField(p: QualifierFieldProps): JSX.Element {
  const qLabel = useQualifierLabel();
  // Mirror the host property's value type, except for `i18n_key`. An
  // "actual value" stored as another translation key would force the
  // maintainer to invent a second key + translations — too much
  // friction for a corner case. Degrade to a free-form string instead;
  // the user types the literal "actual" text.
  const valueType: ValueType = p.qualifier.mirrorValueType === true
    ? (p.propertyValueType === 'i18n_key' ? 'string' : p.propertyValueType)
    : p.qualifier.valueType;

  const enumValues = useMemo(() => {
    if (valueType !== 'enum' && valueType !== 'multi_enum') return [];
    if (p.qualifier.enumRef === undefined) return p.valueCtx.enumValues;
    const vocab = p.vocabularies[p.qualifier.enumRef];
    if (vocab === undefined) return [];
    return Object.entries(vocab.values).map(([id, v]) => ({
      id,
      labels: { en: v.labels.en, fr: v.labels.fr },
    }));
  }, [valueType, p.qualifier.enumRef, p.valueCtx.enumValues, p.vocabularies]);

  const ctx: ValueInputContext = {
    enumValues,
    sources: p.valueCtx.sources,
    i18nKeys: p.valueCtx.i18nKeys,
    entityTypes: p.valueCtx.entityTypes,
  };

  // Multi-target entity_ref qualifiers (`believed_by`, `known_truth_by`).
  const isMultiEntityRef = p.qualifier.multi === true && valueType === 'entity_ref';
  const multiEntityList = isMultiEntityRef
    ? (Array.isArray(p.value)
      ? (p.value as unknown[]).map((v) => String(v ?? ''))
      : (typeof p.value === 'string' && p.value !== '' ? [p.value] : []))
    : null;

  // Multi-source qualifiers (`since`, `until`, `source`) — stacked
  // per-type pickers (manga + anime by default) saved as array.
  const isMultiSourceRef = p.qualifier.multi === true && valueType === 'source_ref';

  return (
    <div className='flex items-end gap-2'>
      <div className='flex-1 space-y-1'>
        <Label className='text-muted-foreground text-[10px] uppercase tracking-wide'>
          {qLabel(p.qualifier.id, p.qualifier.label)}
          {p.qualifier.required === true ? <span className='text-destructive'>*</span> : null}
        </Label>
        {multiEntityList !== null
          ? (
            <MultiEntityRefInput
              value={multiEntityList}
              onChange={(next) => p.onChange(next.length === 0 ? undefined : next)}
              entityTypes={p.valueCtx.entityTypes}
              restrictTo={p.qualifier.entityTypeFilter}
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
              valueType={valueType}
              value={p.value}
              ctx={ctx}
              onChange={p.onChange}
              restrictTo={p.qualifier.entityTypeFilter}
            />
          )}
        {p.qualifier.description !== undefined
          ? (
            <p className='text-muted-foreground text-[10px]'>
              {p.qualifier.description}
            </p>
          )
          : null}
      </div>
      {p.trailing ?? null}
    </div>
  );
}
