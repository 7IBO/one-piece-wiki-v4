/**
 * Existing-entity matching for the api-onepiece candidate pool
 * (ADR-101 §3): API records matching an entity already in the corpus
 * (Luffy, Gomu Gomu, Straw Hats…) are NEVER overwritten — they yield
 * a DIFF entry in the import report instead; only genuinely new
 * records become candidate files.
 *
 * Matching is a normalized name/slug heuristic: an entity is indexed
 * under its slug, its id slug, and every translated `*.name*` string
 * (EN + FR), all normalized to bare alphanumerics. Devil-fruit names
 * additionally index without the "no Mi" suffix and crews without a
 * leading "the", covering the API's usual spellings.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type ExistingEntity = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  /** Entity file path, relative to the repo root. */
  readonly path: string;
  readonly entity: Readonly<Record<string, unknown>>;
  /** Display names collected from the EN/FR translation sidecars. */
  readonly names: readonly string[];
};

/** Normalized match key: lowercase, no diacritics, alphanumerics only. */
export function normalizeMatchKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Match-key variants for one name (id-type-aware suffix handling). */
function keyVariants(type: string, raw: string): readonly string[] {
  const base = normalizeMatchKey(raw);
  if (base === '') return [];
  const variants = new Set([base]);
  if (type === 'devil-fruit') {
    const noMi = normalizeMatchKey(raw.replace(/\bno\s*mi\b/gi, ''));
    if (noMi !== '') variants.add(noMi);
  }
  if (type === 'crew' || type === 'organization') {
    const noThe = normalizeMatchKey(raw.replace(/^the\s+/i, ''));
    if (noThe !== '') variants.add(noThe);
  }
  return [...variants];
}

/**
 * Walk `data/universes/<universe>/entities/<type>/*.json` and collect
 * every entity with the names its EN/FR translation sidecars declare
 * (any key containing `.name` — epithets/aliases included, they are
 * legitimate match handles).
 */
export async function loadExistingEntities(
  repoRoot: string,
  universe = 'one-piece',
): Promise<readonly ExistingEntity[]> {
  const entitiesDir = join(repoRoot, 'data', 'universes', universe, 'entities');
  const out: ExistingEntity[] = [];
  let typeDirs: readonly string[];
  try {
    typeDirs = (await readdir(entitiesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  for (const type of typeDirs) {
    const dir = join(entitiesDir, type);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const entity = (await Bun.file(join(dir, file)).json()) as Record<string, unknown>;
      const id = typeof entity['id'] === 'string' ? entity['id'] : null;
      if (id === null) continue;
      const slug = typeof entity['slug'] === 'string' ? entity['slug'] : '';
      const names: string[] = [];
      for (const locale of ['en', 'fr']) {
        const translationPath = join(
          repoRoot,
          'data',
          'universes',
          universe,
          'translations',
          locale,
          type,
          file,
        );
        try {
          const sidecar = (await Bun.file(translationPath).json()) as Record<string, unknown>;
          for (const [key, value] of Object.entries(sidecar)) {
            if (key.includes('.name') && typeof value === 'string') names.push(value);
          }
        } catch {
          // No sidecar for that locale — fine.
        }
      }
      out.push({
        id,
        type,
        slug,
        path: `data/universes/${universe}/entities/${type}/${file}`,
        entity,
        names,
      });
    }
  }
  return out;
}

export type MatchIndex = ReadonlyMap<string, ExistingEntity>;

/** `<type>|<normalized key>` → entity (first registration wins). */
export function buildMatchIndex(entities: readonly ExistingEntity[]): MatchIndex {
  const index = new Map<string, ExistingEntity>();
  for (const entity of entities) {
    const idSlug = entity.id.split(':')[1] ?? '';
    const handles = [entity.slug, idSlug, ...entity.names];
    for (const handle of handles) {
      if (handle === '') continue;
      for (const variant of keyVariants(entity.type, handle)) {
        const key = `${entity.type}|${variant}`;
        if (!index.has(key)) index.set(key, entity);
      }
    }
  }
  return index;
}

/** Look one candidate up by type + any of its display names/slugs. */
export function matchExisting(
  index: MatchIndex,
  type: string,
  handles: readonly string[],
): ExistingEntity | null {
  for (const handle of handles) {
    for (const variant of keyVariants(type, handle)) {
      const hit = index.get(`${type}|${variant}`);
      if (hit !== undefined) return hit;
    }
  }
  return null;
}

export type PropertyDiff = {
  readonly property: string;
  /** Compact JSON of the existing value; null = property absent. */
  readonly existing: string | null;
  /** Compact JSON of the candidate value. */
  readonly candidate: string;
};

/**
 * Property-level diff between an existing entity and a candidate —
 * report material ONLY (the existing file is never touched). Import
 * bookkeeping qualifiers (`review_status`) are stripped from the
 * candidate side so diffs show data, not stamps.
 */
export function diffProperties(
  existing: Readonly<Record<string, unknown>>,
  candidate: Readonly<Record<string, unknown>>,
): readonly PropertyDiff[] {
  const existingProps = (existing['properties'] ?? {}) as Record<string, unknown>;
  const diffs: PropertyDiff[] = [];
  for (const [property, rawValue] of Object.entries(candidate)) {
    const candidateJson = JSON.stringify(stripBookkeeping(rawValue));
    const existingValue = existingProps[property];
    const existingJson = existingValue === undefined ? null : JSON.stringify(existingValue);
    if (existingJson === candidateJson) continue;
    diffs.push({ property, existing: existingJson, candidate: candidateJson });
  }
  return diffs;
}

function stripBookkeeping(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripBookkeeping);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'review_status') continue;
      out[k] = stripBookkeeping(v);
    }
    return out;
  }
  return value;
}
