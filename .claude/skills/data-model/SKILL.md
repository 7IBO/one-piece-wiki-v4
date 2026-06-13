---
name: data-model
description: Use when creating or editing One Piece wiki entities, properties, relations, vocabularies, or schema files under /data; when writing historisable values (bounty, status, name, classification…); or when adding a new entity type. Covers the schema-driven data model, generated Zod, the four historisation axes, and the validate workflow.
version: "1.0.0"
---

# Data model

The source of truth is **JSON files in `/data`**. SQLite is a derived,
disposable build artifact — never write code that mutates SQLite at
runtime. Full spec: `/docs/DATA_MODEL.md`, `/docs/SCHEMA_SPEC.md`.

## Hard rules

- **Zod is generated**, not hand-written. Entity/qualifier validation
  comes from `/data/schemas/**` via `bun run schema:generate` into
  `packages/schemas/generated/`. To change a shape: edit the schema
  JSON, regenerate — never hand-author entity Zod.
- **No hardcoded names.** Property, relation, qualifier and
  entity-type ids are discovered through the schema catalogue
  (`loadSchemas` / the dashboard `/api/schemas`). Never hardcode
  `'bounty'`, `'name'`, `['name','title_key']`, a type id, etc. in
  app/component code. A shared display-name resolver already lives in
  `@onepiece-wiki/schemas` (`resolveDisplayName` / `nameKeyFor`).
- **The four axes.** Every historisable value carries `since`,
  `epistemic_status` (default `true`), optional `event`, and `source`.
  Plus provenance: `assisted_by` (AI-generated; format
  `claude-<family>-<version>-via-<surface>`) and `review_status`.
  Never drop these on edit.
- **IDs are `type:slug`, immutable.** Slugs are kebab-case English and
  appear in URLs; ids never do.
- **Introduce concepts in `/docs/DATA_MODEL.md` first**, then code. If
  it isn't in the doc, don't invent it — add the doc + an ADR.

## Renames / breaking shape changes (pre-freeze regime, ADR-029/030)

The schema is volatile and there are no external API consumers yet, so
breaking changes are routine and done in one PR — no deprecation, no
aliasing:

1. edit the schema file
2. `bun run migrate <data/migrations/NNNN-slug.ts>` to rewrite `/data`
   (use the helpers: `renameProperty`, `removeProperty`,
   `renameRelationType`, …; `--dry-run` first)
3. bump the entity type's `schema_version`
4. `bun run schema:generate`
5. update internal consumers (sdk, dashboard, preview) in the SAME PR

## Verify before "done"

```
bun run schema:check && bun run validate && bun run check:references && bun test
```

Deep dives: `/docs/EPISTEMIC_MODEL.md`, `/docs/CANON_MODEL.md`,
`/docs/I18N_STRATEGY.md`, `/docs/IMAGES.md`.
