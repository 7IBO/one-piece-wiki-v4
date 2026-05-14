/**
 * SQL DDL for the read-side SQLite database. The shape mirrors the
 * "Build pipeline" §10 schema documented in /docs/BUILD_PIPELINE.md.
 * Phase 2 ships entities / properties / relations / appearances; the
 * source_reachability and FTS5 tables land when cross-medium sources
 * (anime-episode, film) join the model.
 */
export const DDL: readonly string[] = [
  `CREATE TABLE entities (
    id                       TEXT PRIMARY KEY,
    type                     TEXT NOT NULL,
    slug                     TEXT NOT NULL,
    schema_version           INTEGER NOT NULL,
    first_appearance_source  TEXT,
    last_appearance_source   TEXT,
    primary_canon_scope      TEXT,
    canonical_name_key       TEXT,
    data                     TEXT NOT NULL
  )`,
  `CREATE TABLE properties (
    entity_id        TEXT NOT NULL,
    property_id      TEXT NOT NULL,
    value            TEXT NOT NULL,
    since_source     TEXT,
    until_source     TEXT,
    epistemic_status TEXT NOT NULL DEFAULT 'true',
    review_status    TEXT NOT NULL DEFAULT 'reviewed',
    assisted_by      TEXT,
    canon_scope      TEXT,
    event_id         TEXT,
    entry_index      INTEGER NOT NULL,
    PRIMARY KEY (entity_id, property_id, entry_index)
  )`,
  `CREATE TABLE relations (
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    relation_type    TEXT NOT NULL,
    qualifiers       TEXT,
    since_source     TEXT,
    until_source     TEXT,
    is_inferred      INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE appearances (
    entity_id        TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    appearance_type  TEXT NOT NULL DEFAULT 'full',
    is_first         INTEGER NOT NULL DEFAULT 0,
    qualifiers       TEXT
  )`,
  `CREATE INDEX idx_entities_type      ON entities(type)`,
  `CREATE INDEX idx_entities_slug      ON entities(slug)`,
  `CREATE INDEX idx_properties_entity  ON properties(entity_id)`,
  `CREATE INDEX idx_properties_since   ON properties(since_source)`,
  `CREATE INDEX idx_relations_source   ON relations(source_entity_id)`,
  `CREATE INDEX idx_relations_target   ON relations(target_entity_id)`,
  `CREATE INDEX idx_relations_type     ON relations(relation_type)`,
  `CREATE INDEX idx_appearances_entity ON appearances(entity_id)`,
  `CREATE INDEX idx_appearances_source ON appearances(source_id)`,
];
