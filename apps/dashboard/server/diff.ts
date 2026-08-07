/**
 * Server-side structured diff for the admin queue's per-PR detail
 * (W-B slice 2). Pure functions over parsed entity / translation
 * JSON — computed server-side so the client renders a dumb payload
 * (no business logic in components).
 *
 * The shapes mirror the editor's DiffPopover sections (properties /
 * relations / translations) in a compact wire form.
 */

export type FieldDiff = {
  readonly id: string;
  /** Compact JSON of the side; null = absent on that side. */
  readonly before: string | null;
  readonly after: string | null;
};

export type RelationSetDiff = {
  readonly type: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
};

export type EntityFileDiff = {
  readonly path: string;
  readonly entityId: string | null;
  readonly kind: 'added' | 'modified' | 'removed';
  readonly properties: readonly FieldDiff[];
  readonly relations: readonly RelationSetDiff[];
};

export type TranslationChange = {
  readonly key: string;
  readonly before: string | null;
  readonly after: string | null;
};

export type TranslationFileDiff = {
  readonly path: string;
  readonly locale: string;
  readonly changed: readonly TranslationChange[];
};

function compact(v: unknown): string {
  return JSON.stringify(v) ?? 'null';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function relationTargets(v: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!Array.isArray(v)) return out;
  for (const rel of v) {
    const r = asRecord(rel);
    const type = typeof r['type'] === 'string' ? r['type'] : '?';
    const target = typeof r['target'] === 'string' ? r['target'] : '?';
    const set = out.get(type) ?? new Set<string>();
    set.add(target);
    out.set(type, set);
  }
  return out;
}

/** Structured diff of one entity file (either side may be null). */
export function diffEntityFile(
  path: string,
  before: unknown,
  after: unknown,
): EntityFileDiff {
  const b = before === null ? null : asRecord(before);
  const a = after === null ? null : asRecord(after);
  const kind: EntityFileDiff['kind'] = b === null ? 'added' : a === null ? 'removed' : 'modified';
  const entityIdRaw = (a ?? b)?.['id'];
  const entityId = typeof entityIdRaw === 'string' ? entityIdRaw : null;

  const bProps = asRecord(b?.['properties']);
  const aProps = asRecord(a?.['properties']);
  const properties: FieldDiff[] = [];
  for (const id of new Set([...Object.keys(bProps), ...Object.keys(aProps)])) {
    const beforeV = id in bProps ? compact(bProps[id]) : null;
    const afterV = id in aProps ? compact(aProps[id]) : null;
    if (beforeV !== afterV) properties.push({ id, before: beforeV, after: afterV });
  }

  const bRel = relationTargets(b?.['relations']);
  const aRel = relationTargets(a?.['relations']);
  const relations: RelationSetDiff[] = [];
  for (const type of new Set([...bRel.keys(), ...aRel.keys()])) {
    const beforeSet = bRel.get(type) ?? new Set<string>();
    const afterSet = aRel.get(type) ?? new Set<string>();
    const added = [...afterSet].filter((t) => !beforeSet.has(t));
    const removed = [...beforeSet].filter((t) => !afterSet.has(t));
    if (added.length > 0 || removed.length > 0) relations.push({ type, added, removed });
  }

  return { path, entityId, kind, properties, relations };
}

/** Changed keys of one translation file (either side may be null). */
export function diffTranslationFile(
  path: string,
  locale: string,
  before: unknown,
  after: unknown,
): TranslationFileDiff {
  const b = asRecord(before);
  const a = asRecord(after);
  const changed: TranslationChange[] = [];
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const beforeV = key in b ? String(b[key]) : null;
    const afterV = key in a ? String(a[key]) : null;
    if (beforeV !== afterV) changed.push({ key, before: beforeV, after: afterV });
  }
  return { path, locale, changed };
}

const ENTITY_PATH = /^data\/universes\/[^/]+\/entities\/[^/]+\/[^/]+\.json$/;
const TRANSLATION_PATH = /^data\/universes\/[^/]+\/translations\/([^/]+)\//;

export function classifyDataPath(
  path: string,
): { kind: 'entity'; } | { kind: 'translation'; locale: string; } | { kind: 'other'; } {
  if (ENTITY_PATH.test(path)) return { kind: 'entity' };
  const t = TRANSLATION_PATH.exec(path);
  if (t !== null && t[1] !== undefined) return { kind: 'translation', locale: t[1] };
  return { kind: 'other' };
}
