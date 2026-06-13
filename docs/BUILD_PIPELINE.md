# Build Pipeline

The build pipeline transforms `/data/**` (JSON source of truth) into
`/dist/**` (queryable artifacts). It runs on every change and is the only
place derived facts are computed. The pipeline is deterministic: same input
→ same output.

## Entry point

```sh
bun run build:data
```

This runs `packages/db-builder` against `/data`. Output:

- `/dist/onepiece.db` — SQLite, read-only at runtime
- `/dist/search/` — Pagefind index
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

For every relation type with `inverse_inferred: true`:

- For each entity carrying the relation, generate the inverse on the
  target entity in memory (not in the JSON file)
- Example: `chapter:1044` features `character:luffy` → memory adds
  `character:luffy.appears-in chapter:1044`

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

### 9. Search index

Generate Pagefind-compatible static index:

- For each entity, emit a stub HTML document with name, type, and key
  fields
- Pagefind builds a chunked, ranked index for client-side fuzzy search
- The index is filtered at query time by entity type, canon scope, and
  spoiler progression

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
  relation_type TEXT NOT NULL,
  qualifiers JSON,
  since_source TEXT,
  until_source TEXT,
  epistemic_status TEXT NOT NULL DEFAULT 'true', -- relation base qualifiers (ADR-037)
  believed_by JSON,                              -- entity_ref[]
  known_truth_by JSON,                           -- entity_ref[]
  revealed_since TEXT,                           -- source_ref
  is_inferred BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE appearances (
  entity_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  appearance_type TEXT NOT NULL,
  is_first_appearance BOOLEAN,
  is_first_full BOOLEAN,
  qualifiers JSON
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

-- FTS5 for full-text search on key fields
CREATE VIRTUAL TABLE entities_fts USING fts5(
  id UNINDEXED,
  name_en,
  name_fr,
  epithet_en,
  epithet_fr,
  content='',
  contentless_delete=1
);
```

The actual schema is generated from the entity types at build time; the
above is illustrative.

### 11. Manifest

```json
{
  "built_at": "2026-05-14T12:34:56Z",
  "commit": "abc123…",
  "data_version": "v0.3.0",
  "counts": {
    "entities": { "character": 234, "devil-fruit": 89, "manga-chapter": 1100 },
    "relations": 5612,
    "appearances": 18342
  },
  "schema_versions": {
    "character": 1,
    "devil-fruit": 1
  }
}
```

## When the build runs

- **Locally**, via `bun run build:data` during development
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
