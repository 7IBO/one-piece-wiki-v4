# Schema Specification

Schemas are JSON files that declare the shape of the data. They are the
single source of truth for what can be expressed. Application code reads
schemas at startup, generates Zod validators from them, and renders forms
dynamically based on them. **No code knows about specific property or
relation names**; everything is mediated by the schema layer.

This document is the formal spec. The conceptual overview is in
`/docs/DATA_MODEL.md`.

## Directory layout

```
/data/schemas/
├── entity-types/
│   ├── character.json
│   ├── devil-fruit.json
│   ├── manga-chapter.json
│   ├── event.json
│   └── ...
├── property-types/
│   ├── name.json
│   ├── bounty.json
│   ├── classification.json
│   ├── status.json
│   └── ...
├── relation-types/
│   ├── member-of.json
│   ├── ate-fruit.json
│   ├── features.json
│   ├── participant.json
│   └── ...
└── vocabulary/
    ├── haki-types.json
    ├── crew-roles.json
    ├── canon-scopes.json
    ├── epistemic-statuses.json
    └── ...
```

Every schema file starts with `$schema` pointing to its meta-schema, used
for editor support and validation of schemas themselves.

## Entity type schema

A file in `/data/schemas/entity-types/<id>.json`.

### Fields

| Field                  | Type        | Required | Description                                                     |
| ---------------------- | ----------- | -------- | --------------------------------------------------------------- |
| `$schema`              | string      | yes      | Meta-schema reference                                           |
| `id`                   | string      | yes      | Type identifier, kebab-case (e.g. `character`)                  |
| `schema_version`       | integer     | yes      | Bumped on breaking changes                                      |
| `labels`               | object      | yes      | Locale → label, used in UI and breadcrumbs                      |
| `url_segment`          | string      | yes      | Segment used in URLs (kebab-case English, e.g. `characters`)    |
| `properties`           | array       | yes      | Allowed property declarations                                   |
| `allowed_relations`    | string[]    | yes      | IDs of relation types entities of this type may participate in  |
| `requires_translations`| boolean     | no       | If true, translations are mandatory for the entity's `canonical_name_key` and all `i18n_key`-valued properties |
| `ui_hint`              | object      | no       | Hints for the dashboard (icon, color, group)                    |

### Property declaration

Each entry in `properties` declares whether a property is required, historisable,
localizable, and what default qualifiers it carries.

```json
{
  "id": "bounty",
  "required": false,
  "historical": true,
  "localizable": false,
  "spoiler_sensitive": true,
  "default_qualifiers": ["since", "source", "epistemic_status"]
}
```

The shape of values is defined in the corresponding property type file.

### Example

```json
{
  "$schema": "../../../packages/schema-engine/meta-schemas/entity-type.schema.json",
  "id": "character",
  "schema_version": 1,
  "labels": {
    "en": "Character",
    "fr": "Personnage"
  },
  "url_segment": "characters",
  "properties": [
    { "id": "name", "required": true, "historical": true, "localizable": true },
    { "id": "epithet", "required": false, "historical": true, "localizable": true },
    { "id": "bounty", "required": false, "historical": true, "localizable": false },
    { "id": "age", "required": false, "historical": true, "localizable": false },
    { "id": "height", "required": false, "historical": true, "localizable": false },
    { "id": "birthday", "required": false, "historical": false, "localizable": false },
    { "id": "blood_type", "required": false, "historical": false, "localizable": false },
    { "id": "haki_types", "required": false, "historical": true, "localizable": false },
    { "id": "status", "required": true, "historical": true, "localizable": false }
  ],
  "allowed_relations": [
    "member-of",
    "ate-fruit",
    "uses-technique",
    "family-of",
    "ally-of",
    "enemy-of",
    "mentor-of",
    "appears-in",
    "bears-title",
    "participated-in"
  ],
  "ui_hint": {
    "icon": "user",
    "group": "people",
    "color": "blue"
  }
}
```

## Property type schema

A file in `/data/schemas/property-types/<id>.json`.

### Fields

| Field                | Type         | Required | Description                                                  |
| -------------------- | ------------ | -------- | ------------------------------------------------------------ |
| `$schema`            | string       | yes      | Meta-schema reference                                        |
| `id`                 | string       | yes      | Property identifier, kebab-case                              |
| `schema_version`     | integer      | yes      | Bumped on breaking changes                                   |
| `labels`             | object       | yes      | Locale → label                                               |
| `value_type`         | enum         | yes      | One of the value type primitives (see below)                 |
| `value_constraints`  | object       | no       | Type-specific constraints (min, max, pattern, enum_ref, etc.)|
| `unit`               | string       | no       | Display unit (e.g. `berry`, `cm`, `kg`)                      |
| `historical`         | boolean      | yes      | Whether values are versioned                                 |
| `localizable`        | boolean      | yes      | Whether values are translated (then `value_key` is stored)   |
| `spoiler_sensitive`  | boolean      | yes      | Whether values must be filtered by spoiler progression       |
| `applies_to_entity_types` | string[] | no    | Restrict which entity types can have this property           |
| `default_qualifiers` | string[]     | no       | Property-declared qualifiers shown in the form by default    |
| `allowed_qualifiers` | object[]     | no       | Property-declared qualifiers accessible via "more options"   |
| `ui_hint`            | object       | no       | Display format, input widget, icon                           |

### Value types

The following primitive `value_type`s are supported:

| value_type    | TypeScript                | Example                                        |
| ------------- | ------------------------- | ---------------------------------------------- |
| `string`      | `string`                  | `"alive"`                                      |
| `number`      | `number`                  | `30000000`                                     |
| `boolean`     | `boolean`                 | `true`                                         |
| `enum`        | one of `enum_ref` values  | `"paramecia"`                                  |
| `multi_enum`  | array of `enum_ref` values| `["conqueror", "armament"]`                    |
| `date`        | ISO 8601 string           | `"2022-03-07"`                                 |
| `entity_ref`  | entity ID                 | `"location:goa-kingdom"`                       |
| `source_ref`  | source entity ID          | `"manga-chapter:1044"`                         |
| `i18n_key`    | localizable key           | `"character.luffy.name.full"` (resolved later) |
| `markdown`    | light markdown string     | `"### Personality\n\nLuffy is **fearless**…"`  |

### Qualifiers

A qualifier is metadata on a value entry. Qualifiers come in two flavors:
**base qualifiers** (implicit on every historisable property) and
**property-declared qualifiers** (declared per property type).

#### Base qualifiers

The following qualifiers are **implicit on every historisable property**.
They are provided by the schema engine and MUST NOT be listed in a
property type's `default_qualifiers` or `allowed_qualifiers`. They serve
two roles: expressing epistemic nuance (false beliefs, reveals, partial
knowledge — see `/docs/EPISTEMIC_MODEL.md`) and tracking AI-assisted
entry plus human-review state (see `/docs/DATA_MODEL.md` § "Provenance
and review status").

| Qualifier          | Type                   | Meaning                                                       |
| ------------------ | ---------------------- | ------------------------------------------------------------- |
| `epistemic_status` | enum (epistemic)       | What kind of truth this is. Defaults to `true`.               |
| `actual_value`     | same as the value      | The real value when status is a false belief                  |
| `event`            | entity_ref (event)     | The event that caused/revealed this value                     |
| `believed_by`      | array of entity_refs   | Characters who hold this belief                               |
| `known_truth_by`   | array of entity_refs   | Characters who know the actual truth                          |
| `assisted_by`      | string                 | AI agent that generated/last edited the value. Absent = human. |
| `review_status`    | enum (review-statuses) | Human-review state. Defaults to `reviewed`.                   |

**Defaults and omission.** `epistemic_status` defaults to `true`;
`review_status` defaults to `reviewed`; the others default to absent.
Per `/docs/CONVENTIONS.md` § "Entity JSON", default-equal qualifiers
MUST NOT appear in entity JSON. A typical human-edited value therefore
carries none of these qualifiers; an AI-generated value awaiting review
typically carries `assisted_by` and `review_status: "not_reviewed"`.

Example — an AI-suggested epithet awaiting human review:

```json
{
  "value_key": "character.unknown.epithet.fifth-emperor",
  "since": "manga-chapter:903",
  "epistemic_status": "confirmed",
  "assisted_by": "claude-opus-4.7-via-cc",
  "review_status": "not_reviewed"
}
```

#### Property-declared qualifiers

Each property type declares its own qualifiers via two fields:

- **`default_qualifiers`** — keys shown in the form by default. The form
  generator surfaces these as primary inputs on every entry.
- **`allowed_qualifiers`** — additional keys accessible behind a "more
  options" affordance in the form. Editors who need them can reveal them;
  most edits won't.

Common property-declared qualifiers across the model:

| Qualifier          | Type                  | Meaning                                          |
| ------------------ | --------------------- | ------------------------------------------------ |
| `since`            | source_ref            | First source where this value applies            |
| `until`            | source_ref            | Last source where this value applies (optional)  |
| `source`           | source_ref            | Source proving the value                         |
| `canon_scope`      | enum (canon-scopes)   | Restricts the value to a specific canon          |
| `in_universe_date` | string                | In-universe date (e.g. `"12_years_before_story"`)|

A property type may also declare bespoke qualifiers in
`allowed_qualifiers` (e.g. `issued_by` on `bounty`).

### Example

```json
{
  "$schema": "../../../packages/schema-engine/meta-schemas/property-type.schema.json",
  "id": "bounty",
  "schema_version": 1,
  "labels": {
    "en": "Bounty",
    "fr": "Prime"
  },
  "value_type": "number",
  "value_constraints": {
    "min": 0,
    "step": 1000000
  },
  "unit": "berry",
  "historical": true,
  "localizable": false,
  "spoiler_sensitive": true,
  "applies_to_entity_types": ["character"],
  "default_qualifiers": ["since", "source"],
  "allowed_qualifiers": [
    { "id": "issued_by", "value_type": "entity_ref" }
  ],
  "ui_hint": {
    "display_format": "currency_short",
    "input_widget": "number_with_units",
    "icon": "bounty_poster"
  }
}
```

## Relation type schema

A file in `/data/schemas/relation-types/<id>.json`.

### Fields

| Field                | Type         | Required | Description                                                   |
| -------------------- | ------------ | -------- | ------------------------------------------------------------- |
| `$schema`            | string       | yes      | Meta-schema reference                                         |
| `id`                 | string       | yes      | Relation identifier, kebab-case                               |
| `schema_version`     | integer      | yes      | Bumped on breaking changes                                    |
| `labels`             | object       | yes      | Locale → `{ active, inverse }` labels                         |
| `valid_from_types`   | string[]     | yes      | Allowed source entity types                                   |
| `valid_to_types`     | string[]     | yes      | Allowed target entity types                                   |
| `qualifiers`         | object[]     | no       | Qualifier declarations (id, value_type, required, enum_ref…)  |
| `allow_multiple_concurrent` | boolean | no    | If true, multiple active relations of this type are allowed   |
| `inverse_inferred`   | boolean      | yes      | If true, the build pipeline generates the inverse direction   |
| `historical`         | boolean      | no       | If true, relations themselves carry `since`/`until`           |
| `ui_hint`            | object       | no       | Display hints                                                 |

### When `since` is required on a relation

Most relations should carry `since` — it anchors the relation to a
specific source and makes spoiler filtering possible. Declare it
`required: true` on the relation type whenever the relation can be
unambiguously anchored to a chapter, episode, or other source entity.

For a small number of relations involving **pre-canon events** — facts
established before the story begins or during periods with no specific
source coverage (Void Century, distant backstory, mythological eras) —
`since` cannot point to a meaningful source. In those cases the relation
declares `since` as `required: false` and uses `during_period` instead.

The `during_period` qualifier is a controlled vocabulary
(`/data/schemas/vocabulary/during-periods.json`) of named historical
ranges: `void_century`, `god_valley_incident`, `pre_story`, etc. The
build pipeline treats `during_period`-anchored relations as reachable
once the user has read the source that *reveals* the fact (carried via
`epistemic_status` and `event` on the relation, not `since`).

### Example: member-of (source-anchored)

```json
{
  "$schema": "../../../packages/schema-engine/meta-schemas/relation-type.schema.json",
  "id": "member-of",
  "schema_version": 1,
  "labels": {
    "en": { "active": "Member of", "inverse": "Members" },
    "fr": { "active": "Membre de", "inverse": "Membres" }
  },
  "valid_from_types": ["character"],
  "valid_to_types": ["crew", "organization"],
  "qualifiers": [
    { "id": "role", "value_type": "enum", "enum_ref": "crew-roles", "required": true },
    { "id": "since", "value_type": "source_ref", "required": true },
    { "id": "until", "value_type": "source_ref", "required": false },
    { "id": "loyalty_status", "value_type": "enum", "enum_ref": "loyalty-statuses", "required": false, "default": "member" },
    { "id": "appears_to_world_as", "value_type": "enum", "enum_ref": "loyalty-statuses", "required": false }
  ],
  "allow_multiple_concurrent": true,
  "inverse_inferred": true,
  "historical": true
}
```

### Example: eaten-by (pre-canon allowed)

```json
{
  "$schema": "../../../packages/schema-engine/meta-schemas/relation-type.schema.json",
  "id": "eaten-by",
  "schema_version": 1,
  "labels": {
    "en": { "active": "Eaten by", "inverse": "Ate fruit" },
    "fr": { "active": "Mangé par", "inverse": "A mangé" }
  },
  "valid_from_types": ["devil-fruit"],
  "valid_to_types": ["character"],
  "qualifiers": [
    { "id": "since", "value_type": "source_ref", "required": false },
    { "id": "during_period", "value_type": "enum", "enum_ref": "during-periods", "required": false }
  ],
  "allow_multiple_concurrent": true,
  "inverse_inferred": true,
  "historical": true
}
```

Either `since` or `during_period` should be present. The build pipeline
errors if both are missing (`MISSING_TEMPORAL_ANCHOR`). This pattern
covers the Joy Boy / Gomu Gomu case (`during_period: "void_century"`)
without forcing editors to invent a fake source ID.

## Vocabulary schema

A file in `/data/schemas/vocabulary/<id>.json`. Vocabularies are flat
enumerated lists with localized labels and optional metadata.

### Fields

| Field            | Type    | Required | Description                                  |
| ---------------- | ------- | -------- | -------------------------------------------- |
| `$schema`        | string  | yes      | Meta-schema reference                        |
| `id`             | string  | yes      | Vocabulary identifier                        |
| `schema_version` | integer | yes      | Bumped on breaking changes                   |
| `values`         | object  | yes      | Map value → { labels, optional metadata }    |

### Example

```json
{
  "$schema": "../../../packages/schema-engine/meta-schemas/vocabulary.schema.json",
  "id": "crew-roles",
  "schema_version": 1,
  "values": {
    "captain":       { "labels": { "en": "Captain", "fr": "Capitaine" } },
    "first_mate":    { "labels": { "en": "First Mate", "fr": "Second" } },
    "navigator":     { "labels": { "en": "Navigator", "fr": "Navigateur" } },
    "cook":          { "labels": { "en": "Cook", "fr": "Cuisinier" } },
    "doctor":        { "labels": { "en": "Doctor", "fr": "Docteur" } },
    "archaeologist": { "labels": { "en": "Archaeologist", "fr": "Archéologue" } },
    "shipwright":    { "labels": { "en": "Shipwright", "fr": "Charpentier" } },
    "musician":      { "labels": { "en": "Musician", "fr": "Musicien" } },
    "sniper":        { "labels": { "en": "Sniper", "fr": "Tireur d'élite" } },
    "helmsman":      { "labels": { "en": "Helmsman", "fr": "Barreur" } }
  }
}
```

## Localization terminology

Three related but distinct names appear across the data model and
schemas. Use these exact terms; do not coin synonyms.

- **`i18n_key`** — the **`value_type`** name that marks a property value
  as localizable. Declared on a property type:
  `"value_type": "i18n_key"`. The dashboard's value-input registry maps
  this to `I18nKeyInput` (see `/docs/DASHBOARD_ARCHITECTURE.md`).

- **`value_key`** — the **field** that carries an `i18n_key` inside a
  historisable property entry. Replaces the bare `value` when the
  property type's `value_type` is `i18n_key`. Example:

  ```json
  "name": [
    { "value_key": "character.luffy.name.short", "since": "manga-chapter:1" }
  ]
  ```

- **`canonical_name_key`** — a dedicated **field on the entity itself**
  (not inside a property entry) holding the i18n key for the entity's
  canonical display name. Used by listings, breadcrumbs, search results,
  and inverse-relation rendering, so the app never has to pick the
  "right" entry out of a historisable `name` array. Convention: the
  canonical name is the one most readers recognize today, not the
  earliest historisable entry.

The token `name_key` is **not part of the model**. Earlier drafts used it
loosely as a generic stand-in; treat any remaining occurrence as a doc
bug to be cleaned up.

The same terminology is mirrored in `/docs/I18N_STRATEGY.md`.

## Generated Zod schemas

At build time, `packages/schema-engine` reads `/data/schemas/**` and emits
generated Zod schemas in `packages/schemas/generated/`. These are
**git-ignored** and regenerated on every build.

Example output for the bounty property declaration above:

```ts
// packages/schemas/generated/property-bounty.ts
import { z } from 'zod';
import { SourceRef, EntityRef } from '../primitives';
import { EpistemicStatus } from '../vocabularies/epistemic-statuses';

export const BountyValue = z.object({
  value: z.number().int().min(0).multipleOf(1_000_000),
  since: SourceRef,
  source: SourceRef,
  issued_by: EntityRef.optional(),
  epistemic_status: EpistemicStatus.default('true'),
});

export type BountyValue = z.infer<typeof BountyValue>;
```

Generated schemas compose into entity schemas. Example for the character
type:

```ts
export const CharacterEntity = z.object({
  id: EntityId,
  type: z.literal('character'),
  schema_version: z.number(),
  slug: Slug,
  slug_history: z.array(Slug).default([]),
  canonical_name_key: I18nKey,
  properties: z.object({
    name:      z.array(NameValue).optional(),
    epithet:   z.array(EpithetValue).optional(),
    bounty:    z.array(BountyValue).optional(),
    age:       z.array(AgeValue).optional(),
    height:    z.array(HeightValue).optional(),
    birthday:  z.array(BirthdayValue).optional(),
    blood_type: z.array(BloodTypeValue).optional(),
    haki_types: z.array(HakiTypesValue).optional(),
    status:    z.array(StatusValue),
  }),
  relations: z.array(RelationSchema),
});
```

## Adding a new entity type

1. Create `/data/schemas/entity-types/<new-type>.json`
2. List the properties it accepts in `properties` (referencing existing
   property types, or creating new ones in `property-types/`)
3. List the relations in `allowed_relations`
4. Run `bun run schema:generate` to regenerate Zod
5. Run `bun run validate` to check existing data isn't broken
6. The dashboard now shows the new type in its menus, and the form generator
   produces the right inputs automatically
7. Document the new type in `/docs/DATA_MODEL.md` (in the "Entity types"
   inventory) **in the same PR**

## Adding a new property to an existing entity type

1. If the property type doesn't exist yet, create
   `/data/schemas/property-types/<new-prop>.json`
2. Add it to the `properties` list of the relevant entity type
3. Generate, validate, document
4. If the property is `required: true`, write a migration to fill it on
   existing entities (`/data/migrations/<n>-fill-<prop>-on-<type>.ts`)

## Adding a new relation type

1. Create `/data/schemas/relation-types/<new-rel>.json`
2. Add it to the `allowed_relations` of the relevant entity types
3. If `inverse_inferred: true`, no further action; the inverse is generated
4. Generate, validate, document

## Adding a new vocabulary value

1. Edit `/data/schemas/vocabulary/<voc>.json`
2. Add the new key with localized labels
3. Generate, validate

This operation is always safe (additive). It can be performed via the
dashboard's referential admin (phase 4+).

## Breaking changes

The following are breaking changes and require a migration script:

- Removing a property from an entity type
- Renaming a property type or relation type
- Changing a property type's `value_type`
- Tightening a constraint (e.g. min from 0 to 100)
- Removing a value from a vocabulary
- Making an optional property required

All breaking changes:

1. Bump `schema_version` on the affected schema file
2. Provide a migration script in `/data/migrations/`
3. Are reviewed by ≥2 admins
4. Are labeled `schema-breaking` on the PR

## Schema validation

The schema files themselves are validated by **meta-schemas** living in
`/packages/schema-engine/meta-schemas/`. The CI runs:

1. `bun run schema:check` — meta-validate all schema files
2. `bun run schema:generate` — generate Zod
3. `bun run validate` — validate every entity JSON file
4. `bun run check:references` — every reference resolves
5. `bun run typecheck`
6. `bun run lint`
7. `bun run test`

Any failure aborts the PR.

## File naming

- Schema files: `<id>.json`, where `<id>` is the kebab-case identifier
- Entity files: `<type-singular>/<id-without-prefix>.json`
  - Example: `entities/character/luffy.json` (the file's contents have
    `"id": "character:luffy"`)
- Vocabulary files: `<id>.json` (e.g. `crew-roles.json`)

## JSON formatting

- 2-space indentation
- Trailing commas where the JSON parser allows (we use JSONC for `.jsonc`
  files; plain `.json` is strict)
- `$schema` is always the first field
- `id`, `type`, `schema_version` come right after `$schema`
- Properties and relations are ordered by their declaration order in the
  schema (the validator does not enforce this, but `bun run format:data`
  reorders them automatically)
