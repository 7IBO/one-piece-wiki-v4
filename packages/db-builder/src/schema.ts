/**
 * SQL DDL for the read-side SQLite database. The shape mirrors the
 * "Build pipeline" §10 schema documented in /docs/BUILD_PIPELINE.md.
 * Ships entities / properties / relations (both directions — inverse
 * edges are materialized with `is_inferred = 1`) / appearances /
 * translations / narratives / the search index (ADR-108); the
 * source_reachability table lands when cross-medium sources
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
    epistemic_status TEXT NOT NULL DEFAULT 'true',
    believed_by      TEXT,
    known_truth_by   TEXT,
    revealed_since   TEXT,
    label            TEXT,
    is_inferred      INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE appearances (
    entity_id        TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    appearance_type  TEXT NOT NULL DEFAULT 'full',
    is_first         INTEGER NOT NULL DEFAULT 0,
    qualifiers       TEXT
  )`,
  `CREATE TABLE translations (
    universe TEXT NOT NULL,
    locale   TEXT NOT NULL,
    key      TEXT NOT NULL,
    value    TEXT NOT NULL,
    PRIMARY KEY (universe, locale, key)
  )`,
  `CREATE TABLE narratives (
    universe  TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    locale    TEXT NOT NULL,
    markdown  TEXT NOT NULL,
    PRIMARY KEY (entity_id, locale)
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
  `CREATE INDEX idx_translations_key   ON translations(key)`,

  // -------------------------------------------------------------------
  // Search index (ADR-108, BUILD_PIPELINE.md § 9)
  //
  // One row per (entity, field, entry, locale) searchable string.
  // `search_fts` is an EXTERNAL-CONTENT FTS5 table over it: the text
  // is stored once, in `search_docs`, and FTS5 keeps only the inverted
  // index. `unicode61 remove_diacritics 2` folds accents at index AND
  // query time, which is what makes "equipage" find "Équipage".
  //
  // `search_trigrams` powers the typo-tolerant pass: a plain
  // (trigram → doc word) posting list, joined against the query's own
  // trigrams and scored with Sørensen–Dice. FTS5's `trigram` tokenizer
  // was NOT used for it — its MATCH is a contiguous-substring query,
  // so "zorro" would not find "Zoro"; overlap scoring does. Postings
  // are per WORD (`word_index`, and `word_size` = that word's trigram
  // count) so a query term is scored against a document's best word
  // instead of against the union of all its words, which would drown
  // the match in the other words' grams.
  //
  // `search_gates` is the spoiler filter: a doc is visible only when
  // the reader's cursor has passed EVERY one of its anchors. Storing
  // them as rows lets the cursor filter inside the WHERE clause,
  // before any LIMIT — post-filtering a limited result set would
  // silently drop results (and a "hidden result" placeholder is itself
  // a spoiler, so there is nothing to render in their place).
  `CREATE TABLE search_docs (
    doc_id        INTEGER PRIMARY KEY,
    entity_id     TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    slug          TEXT NOT NULL,
    locale        TEXT NOT NULL,
    field         TEXT NOT NULL,
    kind          TEXT NOT NULL,
    name_rank     INTEGER,
    entry_index   INTEGER NOT NULL,
    text          TEXT NOT NULL
  )`,
  `CREATE VIRTUAL TABLE search_fts USING fts5(
    text,
    content='search_docs',
    content_rowid='doc_id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TABLE search_gates (
    doc_id      INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    ordinal     INTEGER NOT NULL
  )`,
  `CREATE TABLE search_trigrams (
    doc_id     INTEGER NOT NULL,
    word_index INTEGER NOT NULL,
    word_size  INTEGER NOT NULL,
    trigram    TEXT NOT NULL
  )`,
  `CREATE INDEX idx_search_docs_entity   ON search_docs(entity_id, name_rank)`,
  `CREATE INDEX idx_search_gates_doc     ON search_gates(doc_id)`,
  `CREATE INDEX idx_search_trigrams_gram ON search_trigrams(trigram)`,
];

/**
 * Rebuild the external-content FTS5 index from `search_docs`. Runs
 * once, after the rows are inserted, inside the writer's transaction.
 */
export const SEARCH_FTS_REBUILD = `INSERT INTO search_fts(search_fts) VALUES('rebuild')`;
