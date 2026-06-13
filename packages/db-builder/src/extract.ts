/**
 * Extract rows for each SQLite table from the loaded entity catalogue.
 * The extractor is pure: it does not touch the database. The writer
 * inserts the rows in a single transaction.
 */
import type { LoadedEntity, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';

export type EntityRow = {
  id: string;
  type: string;
  slug: string;
  schema_version: number;
  first_appearance_source: string | null;
  last_appearance_source: string | null;
  primary_canon_scope: string | null;
  canonical_name_key: string | null;
  data: string;
};

export type PropertyRow = {
  entity_id: string;
  property_id: string;
  value: string;
  since_source: string | null;
  until_source: string | null;
  epistemic_status: string;
  review_status: string;
  assisted_by: string | null;
  canon_scope: string | null;
  event_id: string | null;
  entry_index: number;
};

export type RelationRow = {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  qualifiers: string | null;
  since_source: string | null;
  until_source: string | null;
  // Relation base qualifiers (ADR-037), promoted from the qualifiers bag.
  epistemic_status: string;
  believed_by: string | null;
  known_truth_by: string | null;
  revealed_since: string | null;
  is_inferred: number;
};

export type AppearanceRow = {
  entity_id: string;
  source_id: string;
  appearance_type: string;
  is_first: number;
  qualifiers: string | null;
};

export type ExtractedRows = {
  entities: EntityRow[];
  properties: PropertyRow[];
  relations: RelationRow[];
  appearances: AppearanceRow[];
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Serialize an entity_ref[] qualifier (`believed_by` / `known_truth_by`)
 * for its column, or null when absent / not a non-empty array. The full
 * value is also preserved in the `qualifiers` JSON blob.
 */
function jsonArrayOrNull(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
}

function compareSources(a: string, b: string): number {
  // For Phase 2: chapters compare by their numeric suffix when the
  // prefix matches. Returns negative if a < b, positive if a > b.
  const [typeA, slugA = ''] = a.split(':');
  const [typeB, slugB = ''] = b.split(':');
  if (typeA === typeB) {
    const numA = Number(slugA.replace(/[^0-9]/g, ''));
    const numB = Number(slugB.replace(/[^0-9]/g, ''));
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return slugA.localeCompare(slugB);
  }
  return a.localeCompare(b);
}

function readCanonScope(data: Record<string, unknown>): string | null {
  // An entity's canon scope is declared as a (historisable) property on
  // the source itself, e.g. a manga-chapter carries `canon_scope`. Read
  // the first declared value. No inference from the entity type: if the
  // source never declares its scope, the answer is honestly null rather
  // than a hardcoded type-to-scope guess.
  const properties = data['properties'];
  if (properties === null || properties === undefined || typeof properties !== 'object') {
    return null;
  }
  const canonScope = (properties as Record<string, unknown>)['canon_scope'];
  if (canonScope === undefined || canonScope === null) return null;
  const entries = Array.isArray(canonScope) ? canonScope : [canonScope];
  for (const entry of entries) {
    if (entry === null || entry === undefined || typeof entry !== 'object') continue;
    const value = (entry as Record<string, unknown>)['value'];
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * Mark, for each entity, the appearance whose source is earliest in
 * in-universe order as `is_first = 1`. Ties on the same earliest source
 * are all marked (defensive; the data should not produce duplicates).
 */
function markFirstAppearances(appearances: AppearanceRow[]): void {
  const earliestByEntity = new Map<string, string>();
  for (const row of appearances) {
    const current = earliestByEntity.get(row.entity_id);
    if (current === undefined || compareSources(row.source_id, current) < 0) {
      earliestByEntity.set(row.entity_id, row.source_id);
    }
  }
  for (const row of appearances) {
    if (earliestByEntity.get(row.entity_id) === row.source_id) {
      row.is_first = 1;
    }
  }
}

function collectSinceSources(data: Record<string, unknown>): string[] {
  const sources = new Set<string>();
  const properties = data['properties'];
  if (properties !== null && properties !== undefined && typeof properties === 'object') {
    for (const value of Object.values(properties as Record<string, unknown>)) {
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (entry === null || entry === undefined || typeof entry !== 'object') continue;
        const since = (entry as Record<string, unknown>)['since'];
        if (typeof since === 'string') sources.add(since);
      }
    }
  }
  const relations = data['relations'];
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      if (rel === null || rel === undefined || typeof rel !== 'object') continue;
      const q = (rel as Record<string, unknown>)['qualifiers'];
      if (q !== null && q !== undefined && typeof q === 'object') {
        const since = (q as Record<string, unknown>)['since'];
        if (typeof since === 'string') sources.add(since);
      }
    }
  }
  return [...sources];
}

function extractEntityRow(entity: LoadedEntity): EntityRow {
  const sources = collectSinceSources(entity.data).sort(compareSources);
  return {
    id: entity.id,
    type: entity.type,
    slug: asString(entity.data['slug']) ?? '',
    schema_version: asNumber(entity.data['schema_version']),
    first_appearance_source: sources[0] ?? null,
    last_appearance_source: sources[sources.length - 1] ?? null,
    primary_canon_scope: null,
    canonical_name_key: asString(entity.data['canonical_name_key']),
    data: JSON.stringify(entity.data),
  };
}

function extractPropertyRows(entity: LoadedEntity): PropertyRow[] {
  const rows: PropertyRow[] = [];
  const properties = entity.data['properties'];
  if (properties === null || properties === undefined || typeof properties !== 'object') {
    return rows;
  }

  for (const [propertyId, rawValue] of Object.entries(properties as Record<string, unknown>)) {
    const entries = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const [entryIndex, entry] of entries.entries()) {
      if (entry === null || entry === undefined || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      rows.push({
        entity_id: entity.id,
        property_id: propertyId,
        value: JSON.stringify(record),
        since_source: asString(record['since']),
        until_source: asString(record['until']),
        epistemic_status: asString(record['epistemic_status']) ?? 'true',
        review_status: asString(record['review_status']) ?? 'reviewed',
        assisted_by: asString(record['assisted_by']),
        canon_scope: asString(record['canon_scope']),
        event_id: asString(record['event']),
        entry_index: entryIndex,
      });
    }
  }
  return rows;
}

function extractRelationRows(
  entity: LoadedEntity,
  catalogue: ValidatedCatalogue,
): RelationRow[] {
  const rows: RelationRow[] = [];
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return rows;

  for (const rel of relations) {
    if (rel === null || rel === undefined || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    const relationType = asString(record['type']);
    const target = asString(record['target']);
    if (relationType === null || target === null) continue;
    const qualifiers = record['qualifiers'];
    const qualifiersObj = qualifiers !== null && qualifiers !== undefined
        && typeof qualifiers === 'object'
      ? (qualifiers as Record<string, unknown>)
      : null;
    const since = qualifiersObj !== null ? asString(qualifiersObj['since']) : null;
    const until = qualifiersObj !== null ? asString(qualifiersObj['until']) : null;
    // Relation base qualifiers (ADR-037). The generated inverse edge
    // carries the same epistemic state — a hidden link is equally hidden
    // in both directions.
    const epistemicStatus = (qualifiersObj !== null
      ? asString(qualifiersObj['epistemic_status'])
      : null) ?? 'true';
    const believedBy = qualifiersObj !== null
      ? jsonArrayOrNull(qualifiersObj['believed_by'])
      : null;
    const knownTruthBy = qualifiersObj !== null
      ? jsonArrayOrNull(qualifiersObj['known_truth_by'])
      : null;
    const revealedSince = qualifiersObj !== null ? asString(qualifiersObj['revealed_since']) : null;

    rows.push({
      source_entity_id: entity.id,
      target_entity_id: target,
      relation_type: relationType,
      qualifiers: qualifiersObj !== null ? JSON.stringify(qualifiersObj) : null,
      since_source: since,
      until_source: until,
      epistemic_status: epistemicStatus,
      believed_by: believedBy,
      known_truth_by: knownTruthBy,
      revealed_since: revealedSince,
      is_inferred: 0,
    });

    const relationDef = catalogue.relationTypes.get(relationType);
    if (relationDef?.inverse_inferred === true) {
      rows.push({
        source_entity_id: target,
        target_entity_id: entity.id,
        relation_type: `${relationType}.inverse`,
        qualifiers: qualifiersObj !== null ? JSON.stringify(qualifiersObj) : null,
        since_source: since,
        until_source: until,
        epistemic_status: epistemicStatus,
        believed_by: believedBy,
        known_truth_by: knownTruthBy,
        revealed_since: revealedSince,
        is_inferred: 1,
      });
    }
  }
  return rows;
}

function extractAppearanceRows(
  entity: LoadedEntity,
): AppearanceRow[] {
  const rows: AppearanceRow[] = [];
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return rows;

  for (const rel of relations) {
    if (rel === null || rel === undefined || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    if (record['type'] !== 'features') continue;
    const target = asString(record['target']);
    if (target === null) continue;
    const qualifiers = record['qualifiers'];
    const qualifiersObj = qualifiers !== null && qualifiers !== undefined
        && typeof qualifiers === 'object'
      ? (qualifiers as Record<string, unknown>)
      : null;
    const appearanceType = qualifiersObj !== null
      ? (asString(qualifiersObj['appearance_type']) ?? 'full')
      : 'full';
    rows.push({
      entity_id: target,
      source_id: entity.id,
      appearance_type: appearanceType,
      is_first: 0,
      qualifiers: qualifiersObj !== null ? JSON.stringify(qualifiersObj) : null,
    });
  }
  return rows;
}

export function extract(
  entities: ReadonlyMap<string, LoadedEntity>,
  catalogue: ValidatedCatalogue,
): ExtractedRows {
  const out: ExtractedRows = {
    entities: [],
    properties: [],
    relations: [],
    appearances: [],
  };

  for (const entity of entities.values()) {
    out.entities.push(extractEntityRow(entity));
    out.properties.push(...extractPropertyRows(entity));
    out.relations.push(...extractRelationRows(entity, catalogue));
    out.appearances.push(...extractAppearanceRows(entity));
  }

  // Derived: an entity's primary canon scope is the canon_scope declared
  // by the source where it first appears. Resolved here because it needs
  // the full entity map to look the source up.
  for (const row of out.entities) {
    if (row.first_appearance_source === null) continue;
    const source = entities.get(row.first_appearance_source);
    if (source !== undefined) {
      row.primary_canon_scope = readCanonScope(source.data);
    }
  }

  // Derived: flag the earliest appearance per entity.
  markFirstAppearances(out.appearances);

  // Stable order for deterministic builds.
  out.entities.sort((a, b) => a.id.localeCompare(b.id));
  out.properties.sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id)
    || a.property_id.localeCompare(b.property_id)
    || a.entry_index - b.entry_index
  );
  out.relations.sort((a, b) =>
    a.source_entity_id.localeCompare(b.source_entity_id)
    || a.relation_type.localeCompare(b.relation_type)
    || a.target_entity_id.localeCompare(b.target_entity_id)
  );
  out.appearances.sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id) || a.source_id.localeCompare(b.source_id)
  );

  return out;
}
