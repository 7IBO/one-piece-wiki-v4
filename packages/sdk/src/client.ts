/**
 * Read-only SQLite client over the Phase 2 build artefact. Uses
 * bun:sqlite at the type level; the Database is injected so the SDK
 * can be tested against any compatible driver and so Phase 6's
 * serverless deployment can swap in better-sqlite3 under Node without
 * code changes here. See ADR-012.
 */
export type Row = Record<string, unknown>;

export type SqliteLike = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Row[];
    get: (...params: unknown[]) => Row | undefined;
  };
  close?: () => void;
};

export type EntityRecord = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly schema_version: number;
  readonly first_appearance_source: string | null;
  readonly last_appearance_source: string | null;
  readonly primary_canon_scope: string | null;
  readonly canonical_name_key: string | null;
  readonly data: Record<string, unknown>;
};

export type PropertyRecord = {
  readonly entity_id: string;
  readonly property_id: string;
  readonly value: Record<string, unknown>;
  readonly since_source: string | null;
  readonly until_source: string | null;
  readonly epistemic_status: string;
  readonly review_status: string;
  readonly assisted_by: string | null;
  readonly canon_scope: string | null;
  readonly event_id: string | null;
  readonly entry_index: number;
};

export type RelationRecord = {
  readonly source_entity_id: string;
  readonly target_entity_id: string;
  readonly relation_type: string;
  readonly qualifiers: Record<string, unknown> | null;
  readonly since_source: string | null;
  readonly until_source: string | null;
  // Relation base qualifiers (ADR-037). `epistemic_status` defaults to
  // 'true'; `believed_by` / `known_truth_by` are entity-ref lists.
  readonly epistemic_status: string;
  readonly believed_by: readonly string[] | null;
  readonly known_truth_by: readonly string[] | null;
  readonly revealed_since: string | null;
  readonly is_inferred: boolean;
};

export type RelationDirection = 'outgoing' | 'incoming' | 'both';

function parseJsonField<T>(value: unknown): T {
  if (typeof value !== 'string') return value as T;
  return JSON.parse(value) as T;
}

export function createClient(db: SqliteLike) {
  const entityById = db.prepare(
    `SELECT id, type, slug, schema_version, first_appearance_source,
            last_appearance_source, primary_canon_scope, canonical_name_key, data
       FROM entities WHERE id = ?`,
  );
  const entityBySlug = db.prepare(
    `SELECT id, type, slug, schema_version, first_appearance_source,
            last_appearance_source, primary_canon_scope, canonical_name_key, data
       FROM entities WHERE type = ? AND slug = ?`,
  );
  const entitiesByType = db.prepare(
    `SELECT id, type, slug, schema_version, first_appearance_source,
            last_appearance_source, primary_canon_scope, canonical_name_key, data
       FROM entities WHERE type = ? ORDER BY slug`,
  );
  const propertiesByEntity = db.prepare(
    `SELECT entity_id, property_id, value, since_source, until_source,
            epistemic_status, review_status, assisted_by, canon_scope,
            event_id, entry_index
       FROM properties WHERE entity_id = ?
       ORDER BY property_id, entry_index`,
  );
  const relationsOutgoing = db.prepare(
    `SELECT source_entity_id, target_entity_id, relation_type, qualifiers,
            since_source, until_source, epistemic_status, believed_by,
            known_truth_by, revealed_since, is_inferred
       FROM relations WHERE source_entity_id = ?`,
  );
  const relationsIncoming = db.prepare(
    `SELECT source_entity_id, target_entity_id, relation_type, qualifiers,
            since_source, until_source, epistemic_status, believed_by,
            known_truth_by, revealed_since, is_inferred
       FROM relations WHERE target_entity_id = ?`,
  );

  const mapEntity = (row: Row | undefined): EntityRecord | null => {
    if (row === undefined) return null;
    return {
      id: row['id'] as string,
      type: row['type'] as string,
      slug: row['slug'] as string,
      schema_version: row['schema_version'] as number,
      first_appearance_source: (row['first_appearance_source'] as string | null) ?? null,
      last_appearance_source: (row['last_appearance_source'] as string | null) ?? null,
      primary_canon_scope: (row['primary_canon_scope'] as string | null) ?? null,
      canonical_name_key: (row['canonical_name_key'] as string | null) ?? null,
      data: parseJsonField<Record<string, unknown>>(row['data']),
    };
  };

  const mapProperty = (row: Row): PropertyRecord => ({
    entity_id: row['entity_id'] as string,
    property_id: row['property_id'] as string,
    value: parseJsonField<Record<string, unknown>>(row['value']),
    since_source: (row['since_source'] as string | null) ?? null,
    until_source: (row['until_source'] as string | null) ?? null,
    epistemic_status: row['epistemic_status'] as string,
    review_status: row['review_status'] as string,
    assisted_by: (row['assisted_by'] as string | null) ?? null,
    canon_scope: (row['canon_scope'] as string | null) ?? null,
    event_id: (row['event_id'] as string | null) ?? null,
    entry_index: row['entry_index'] as number,
  });

  const mapRelation = (row: Row): RelationRecord => ({
    source_entity_id: row['source_entity_id'] as string,
    target_entity_id: row['target_entity_id'] as string,
    relation_type: row['relation_type'] as string,
    qualifiers: row['qualifiers'] === null || row['qualifiers'] === undefined
      ? null
      : parseJsonField<Record<string, unknown>>(row['qualifiers']),
    since_source: (row['since_source'] as string | null) ?? null,
    until_source: (row['until_source'] as string | null) ?? null,
    epistemic_status: (row['epistemic_status'] as string | null) ?? 'true',
    believed_by: row['believed_by'] === null || row['believed_by'] === undefined
      ? null
      : parseJsonField<string[]>(row['believed_by']),
    known_truth_by: row['known_truth_by'] === null || row['known_truth_by'] === undefined
      ? null
      : parseJsonField<string[]>(row['known_truth_by']),
    revealed_since: (row['revealed_since'] as string | null) ?? null,
    is_inferred: Number(row['is_inferred']) === 1,
  });

  return {
    getEntity(id: string): EntityRecord | null {
      return mapEntity(entityById.get(id));
    },

    getEntityBySlug(type: string, slug: string): EntityRecord | null {
      return mapEntity(entityBySlug.get(type, slug));
    },

    getByType(type: string): readonly EntityRecord[] {
      return entitiesByType.all(type).map((row) => mapEntity(row) as EntityRecord);
    },

    getProperties(entityId: string): readonly PropertyRecord[] {
      return propertiesByEntity.all(entityId).map(mapProperty);
    },

    getRelations(
      entityId: string,
      direction: RelationDirection = 'outgoing',
    ): readonly RelationRecord[] {
      if (direction === 'outgoing') return relationsOutgoing.all(entityId).map(mapRelation);
      if (direction === 'incoming') return relationsIncoming.all(entityId).map(mapRelation);
      return [
        ...relationsOutgoing.all(entityId).map(mapRelation),
        ...relationsIncoming.all(entityId).map(mapRelation),
      ];
    },

    close(): void {
      db.close?.();
    },
  };
}

export type Client = ReturnType<typeof createClient>;
