# Build Pipeline

The build pipeline transforms `/data/**` (JSON source of truth) into
`/dist/**` (queryable artifacts). It runs on every change and is the only
place derived facts are computed. The pipeline is deterministic: same input
→ same output.

## Entry point

```sh
bun run build:db
```

(`bun run build:data` is the historical alias and runs the same CLI;
`build:db` goes through the Turborepo task of the same name, which is
uncached — the artifact is disposable and written outside the package
directory.)

This runs `packages/db-builder` against `/data`. Output:

- `/dist/onepiece.db` — SQLite, read-only at runtime (the search index
  is inside it: ADR-108 replaced the planned Pagefind sidecar)
- `/dist/manifest.json` — build metadata (commit hash, date, counts)
- `/dist/translations/` — per-locale resolved string bundles (optional
  optimization)

## Pipeline stages

### 1. Schema load and Zod generation

- Read all files in `/data/schemas/**`
- Validate each against the relevant meta-schema
- Resolve internal references (a property type referenced by an entity
  type must exist)
- Generate typed Zod schemas into `packages/schemas/generated/`

If any schema is invalid, the build aborts with a precise error.

### 2. Vocabulary load

- Read `/data/schemas/vocabulary/**`
- Each becomes a Zod enum for use in qualifier validation

### 3. Entity load and validation

- Walk `/data/universes/**/entities/**.json`
- For each file:
  - Parse JSON
  - Validate against the generated Zod schema for its `type`
  - Validate property values against their property type's `value_constraints`
  - Collect all `id`s into a global index

Errors are accumulated; the build fails with a full list, not just the
first error.

### 4. Reference resolution

- For every `target`, `event`, `source`, `believed_by`, `known_truth_by`:
  - Look up the referenced entity in the global index
  - If missing, accumulate an error
- For every `i18n_key`:
  - Look up the key in the translations for each enabled locale
  - If missing in the default locale (`en`), error; missing other
    locales become warnings

### 5. Inverse relation generation

For **every stored edge A→B, of every relation type**, the pipeline
materializes the inverse edge B→A into the `relations` table
(ADR-086). The JSON source stores ONE direction only; the artifact
carries both. Materialized inverse rows carry:

- `is_inferred = 1`
- `relation_type` = the base type id suffixed `.inverse`
  (e.g. `features` → `features.inverse`)
- `label` = the relation type's localized **`inverse`** labels
  (stored rows carry the `active` labels), as a sorted
  `locale → string` JSON object
- every qualifier and axis mirrored from the stored edge — including
  the epistemic base qualifiers (ADR-037: a hidden link is equally
  hidden in both directions)

**Dedup invariant**: when the opposite direction is itself stored in
the JSON (known double-stored symmetric edges, e.g. the three
`family-of` pairs ace↔luffy / ace↔sabo / luffy↔sabo), no inverse is
materialized for either side — the two stored rows already cover both
directions, and the artifact never contains two rows for the same
(type, source, target) unless the source JSON does.

`inverse_inferred` on the relation type remains the editorial signal
that editors maintain one side only (`check:coherence` reports
double-storage as info); it no longer gates artifact materialization.
The dashboard never asks editors to maintain both sides.

### 6. Derived field computation

For each entity, precompute:

- **`first_appearance`**: minimum `since` source across the entity's
  appearances and properties
- **`last_appearance`**: maximum `since` source across appearances
- **`current_values`**: map of property → value at each "checkpoint"
  source (every arc end, plus optionally every chapter for small data)
- **`appearance_counts`**: per `appearance_type`
- For chapters: list of entities featured, with their appearance type
- For events: list of all participants and their qualifiers

These are stored as columns / tables in the SQLite, indexed appropriately.

### 7. Inference pass

Apply the rules described in `EPISTEMIC_MODEL.md`:

- Public events propagate reveals to participants/witnesses (phase 2+)
- Death events update status of the affected entity
- Reveal events update classification when applicable

Inferences are tagged in the DB so the read path can show "inferred from
event X" alongside the value.

### 8. Cross-medium reachability

Build a reachability map across sources:

- For each `manga-chapter`, list `anime-episode`s that adapt it fully
- For each `anime-episode`, list `manga-chapter`s it adapts fully
- Films reachable from chapter ranges they reference
- This enables the spoiler filter to handle "I'm at episode 1071" as
  equivalent to "I've read chapter 1044".

### 9. Search index (ADR-108)

Build the SQLite search index — **inside the artifact, at build time**.
Nothing about search is computed at request time: SQLite is derived and
disposable, and CLAUDE.md forbids mutating it at runtime.

`packages/db-builder/src/search.ts` walks the extracted entity rows and
the resolved translations and emits three tables plus an FTS5 index
(§ 10 below for the DDL). It is **fully schema-driven**:

- a property is indexed **iff its property type declares
  `value_type: "i18n_key"`** — i.e. iff its values are localizable
  text. Numbers, enums, dates and refs are not text and are not
  indexed. No property id appears anywhere in the builder.
- a value is classified **`name` iff its property type declares
  `romanizable: true`**. That flag exists (ADR-095) to mark "name-like
  values (`name`, `epithet`, `title_key`) — never free text", which is
  exactly the distinction ranking needs. Any other localizable value is
  `text`; the entity's slug is indexed as `slug`.
- display-name priority (`name_rank`) comes from the entity's
  `canonical_name_key`, then from the entity type's
  `display_name_properties` — mirroring `resolveEntityName` in the
  reader app.
- **only the UI locales (`en`, `fr`) are indexed.** `ja` / `ja-latn`
  are DATA locales (ADR-095): dashboard-only, never surfaced in the
  public UI — and a search hit IS a surfacing, since it is the reason a
  row appears. They stay in the `translations` table. A locale whose
  value is byte-identical (after folding) to one already emitted for
  the same entry is skipped: cross-locale matching already covers it.
- `actual_value` (the concealed truth behind a believed value) is
  **never** indexed — it would make a reveal findable before the reveal.

**Spoiler anchors are materialized, not computed at query time.** Every
doc gets a row in `search_gates` for each numeric progression anchor
that gates it: the entity's own id when it is a numbered source
(`manga-chapter:1044`), its `first_appearance_source`, and the entry's
own `since`. Per source type only the LATEST ordinal survives — a doc
is visible only once the reader has passed every one of its anchors.
The builder does not know which source types are cursor axes; it emits
every numeric anchor and the reader app (a presentation binding,
ADR-091) enforces only the axes it knows.

**Trigrams are stored per WORD** (`word_index`, `word_size`) so the
reader's fuzzy pass can score a query term against a document's best
word rather than against the union of all its words. Folding
(`normalizeSearchText`) and trigram slicing live in
`packages/schemas/src/search-text.ts`, shared verbatim with the query
side — a divergence between the two would silently stop matching.

Output is fully sorted and `doc_id`s are assigned in that order, so two
builds of the same data are byte-identical.

Narratives are **not** indexed in v1: their spoiler markers
(`:::spoiler chapter:N{…}:::`, I18N_STRATEGY.md) are not parsed
anywhere yet, so indexing the prose would leak past the cursor. The
corpus carries no narratives today; the day the markers are parsed into
per-block anchors, each block becomes a doc with its own gate rows and
nothing else changes.

### 10. SQLite write

The build-time writer uses **`bun:sqlite`** (see ADR-012). Positional
parameter binding is used throughout to avoid bun:sqlite's
named-parameter collision with SQL reserved words (`type`, etc.).

Schema (simplified):

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  first_appearance_source TEXT,
  last_appearance_source TEXT,
  primary_canon_scope TEXT,
  data JSON NOT NULL
);

CREATE TABLE properties (
  entity_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  value JSON NOT NULL,
  since_source TEXT NOT NULL,
  until_source TEXT,
  epistemic_status TEXT NOT NULL,
  canon_scope TEXT,
  event_id TEXT,
  PRIMARY KEY (entity_id, property_id, since_source)
);

CREATE TABLE relations (
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,                   -- base id, or "<id>.inverse" on materialized rows
  qualifiers JSON,
  since_source TEXT,
  until_source TEXT,
  epistemic_status TEXT NOT NULL DEFAULT 'true', -- relation base qualifiers (ADR-037)
  believed_by JSON,                              -- entity_ref[]
  known_truth_by JSON,                           -- entity_ref[]
  revealed_since TEXT,                           -- source_ref
  label JSON,                                    -- locale → display label for THIS direction
  is_inferred BOOLEAN NOT NULL DEFAULT 0         -- 1 = materialized inverse (stage 5)
);

CREATE TABLE appearances (
  entity_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  appearance_type TEXT NOT NULL,
  is_first_appearance BOOLEAN,
  is_first_full BOOLEAN,
  qualifiers JSON
);

-- Per-locale resolved strings from /data/universes/<u>/translations/**
-- (flat key → string maps, one row per key per locale).
CREATE TABLE translations (
  universe TEXT NOT NULL,
  locale TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (universe, locale, key)
);

-- Markdown prose from /data/universes/<u>/narratives/<locale>/<type>/<base>.md
-- (entity_id derived as "<type>:<base>"; the builder errors on ids that
-- do not exist in the entity catalogue).
CREATE TABLE narratives (
  universe TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  markdown TEXT NOT NULL,
  PRIMARY KEY (entity_id, locale)
);

CREATE TABLE source_reachability (
  from_source TEXT NOT NULL,
  to_source TEXT NOT NULL,
  PRIMARY KEY (from_source, to_source)
);

-- Indexes
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_slug ON entities(slug);
CREATE INDEX idx_properties_entity ON properties(entity_id);
CREATE INDEX idx_properties_since ON properties(since_source);
CREATE INDEX idx_relations_source ON relations(source_entity_id);
CREATE INDEX idx_relations_target ON relations(target_entity_id);
CREATE INDEX idx_relations_type ON relations(relation_type);
CREATE INDEX idx_appearances_entity ON appearances(entity_id);
CREATE INDEX idx_appearances_source ON appearances(source_id);

-- Search index (ADR-108). One row per (entity, field, entry, locale)
-- searchable string; the columns are generic, never per-property.
CREATE TABLE search_docs (
  doc_id      INTEGER PRIMARY KEY,
  entity_id   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  slug        TEXT NOT NULL,
  locale      TEXT NOT NULL,   -- 'en' | 'fr' | '*' (locale-neutral: slugs)
  field       TEXT NOT NULL,   -- property id, or 'slug'
  kind        TEXT NOT NULL,   -- 'name' | 'text' | 'slug' (schema-derived)
  name_rank   INTEGER,         -- 0 = canonical_name_key, else 1 + priority
  entry_index INTEGER NOT NULL,
  text        TEXT NOT NULL
);

-- External-content FTS5: the text lives once, in search_docs.
-- `remove_diacritics 2` folds accents at index AND query time, which is
-- what makes "equipage" find "Équipage".
CREATE VIRTUAL TABLE search_fts USING fts5(
  text,
  content='search_docs',
  content_rowid='doc_id',
  tokenize='unicode61 remove_diacritics 2'
);

-- The spoiler filter. A doc is visible iff the reader's cursor has
-- passed EVERY one of its anchors. Rows, not a packed ref, so the
-- cursor filters with integer comparisons inside the WHERE clause —
-- before any LIMIT.
CREATE TABLE search_gates (
  doc_id      INTEGER NOT NULL,
  source_type TEXT NOT NULL,   -- e.g. 'manga-chapter'
  ordinal     INTEGER NOT NULL
);

-- Typo tolerance: a (trigram → doc word) posting list scored with
-- Sørensen–Dice at query time. Per WORD, not per document.
CREATE TABLE search_trigrams (
  doc_id     INTEGER NOT NULL,
  word_index INTEGER NOT NULL,
  word_size  INTEGER NOT NULL, -- that word's trigram count
  trigram    TEXT NOT NULL
);

CREATE INDEX idx_search_docs_entity   ON search_docs(entity_id, name_rank);
CREATE INDEX idx_search_gates_doc     ON search_gates(doc_id);
CREATE INDEX idx_search_trigrams_gram ON search_trigrams(trigram);
```

The actual schema is generated from the entity types at build time; the
above is illustrative.

After the search rows are inserted, still inside the writer's
transaction, the external-content index is built with
`INSERT INTO search_fts(search_fts) VALUES('rebuild')` — so the
artifact is never observable with a stale index.

### 11. Manifest

```json
{
  "built_at": "2026-05-14T12:34:56Z",
  "commit": "abc123…",
  "data_version": "v0.3.0",
  "counts": {
    "entities": { "character": 234, "devil-fruit": 89, "manga-chapter": 1100 },
    "relations": 5612,
    "relations_inferred": 2740,
    "appearances": 18342,
    "translations": 40210,
    "narratives": 1876,
    "search_docs": 51204
  },
  "schema_versions": {
    "character": 1,
    "devil-fruit": 1
  }
}
```

## When the build runs

- **Locally**, via `bun run build:db` during development
- **On every PR**, in CI, to validate the change
- **On `main`**, the build runs and the resulting `dist/` is uploaded as a
  Vercel build artifact, consumed by the deployed apps
- **On a schedule** (nightly), to catch schema drift or external issues

## Determinism

The pipeline is deterministic:

- Reads are sorted by file path
- Maps are serialized with sorted keys
- Timestamps in the manifest are the only non-deterministic field

Two builds of the same data produce byte-identical SQLite (modulo
timestamps). This makes diffs reviewable and CI caching effective.

## Performance

With 10k entities and 50k properties:

- Full build: target < 30 seconds on a modest machine
- Incremental builds (for dev): target < 3 seconds (partial regeneration)

If performance becomes a problem, the priority order for optimization is:

1. Parallelize per-type validation passes
2. Memoize reference resolution
3. Cache schema generation between runs (it's the slowest step on cold
   start)
4. Reduce SQLite write to changed tables

## Error reporting

Errors are emitted in a structured JSON format alongside the human-readable
output, for tooling consumption (lint plugins, dashboard preview):

```json
{
  "errors": [
    {
      "code": "REFERENCE_NOT_FOUND",
      "file": "data/universes/one-piece/entities/character/luffy.json",
      "path": "relations[3].target",
      "value": "character:dragonn",
      "suggestion": "character:dragon"
    }
  ],
  "warnings": [...]
}
```

## Distribution

The SQLite is < 100MB even at full scale (10k+ entities). It's served as
a static asset to Vercel builds. For future use cases (offline app, third
party consumers), the same artifact can be downloaded as-is.
