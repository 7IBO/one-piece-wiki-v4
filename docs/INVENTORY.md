# Inventory — One Piece Wiki Phase 1

Complete reference of every entity type, property type, relation type,
vocabulary, primitive value type, and universal qualifier defined for
Phase 1. This is the canonical inventory; all other docs reference it.

> This is a reference document. If you add a new schema element, update
> this file in the same PR.
>
> **Authoritative source.** The catalogue in `/data/schemas/**` (and the
> generated Zod in `packages/schemas`) is authoritative; this inventory is
> hand-maintained and can lag. When in doubt, read the schema files or run
> `bun run schema:check` / `bun run check:coherence`. **Known lag
> (2026-06-13):** the §1 directory tree and the §2 per-type _allowed
> relations_ predate ADR-033/034's prefer-inferred cleanup — the deleted
> inverse mirrors (`eaten-by`, `used-by`, `wielded-by`, `enables-technique`,
> `birthplace-of`, `depicts`, `mentored-by`, `has-member-race`, `borne-by`,
> `contains-arc`, `contains-location`, `causes-event`, `replaced-by`,
> `participated-in`, `adapts`) are now **build-generated inverses**, not
> declarable relations; and §5 omits 11 vocabularies added since
> ADR-022/023 (`adaptation-coverage`, `arc-roles`, `blood-types`,
> `depiction-periods`, `during-periods`, `event-outcomes`, `event-roles`,
> `event-sides`, `family-relations`, `source-origins`,
> `publication-countries`). A catalogue-generated refresh of this file is
> tracked (see `DATA_EXPANSION_PLAN.md` §5).

---

## 1. Directory structure

```
/
├── apps/
│   ├── dashboard/                  # Editing UI (Phase 4)
│   │   ├── app/                    # TanStack Start routes
│   │   ├── e2e/                    # Playwright tests
│   │   └── package.json
│   └── preview/                    # Minimal reading app (Phase 3)
│       ├── app/
│       ├── e2e/
│       └── package.json
│
├── packages/
│   ├── schemas/                    # Zod primitives + generated schemas
│   │   ├── src/
│   │   │   ├── primitives.ts       # EntityId, Slug, SourceRef, etc.
│   │   │   ├── qualifiers.ts       # Universal qualifier types
│   │   │   ├── vocabularies/       # Generated from /data/schemas/vocabulary
│   │   │   └── generated/          # Generated entity/property/relation Zods
│   │   └── package.json
│   │
│   ├── schema-engine/              # Parses /data/schemas → Zod
│   │   ├── src/
│   │   │   ├── meta-schemas/       # Schemas that validate schemas
│   │   │   ├── loader.ts
│   │   │   ├── validator.ts
│   │   │   └── generator.ts
│   │   └── package.json
│   │
│   ├── db-builder/                 # JSON → SQLite pipeline
│   │   ├── src/
│   │   │   ├── stages/             # One file per pipeline stage
│   │   │   ├── inferences/         # Inference rules
│   │   │   └── sqlite-writer.ts
│   │   └── package.json
│   │
│   ├── sdk/                        # Runtime data access
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── spoiler-filter.ts
│   │   │   └── i18n-resolver.ts
│   │   └── package.json
│   │
│   ├── ui/                         # Base UI + Tailwind components
│   │   ├── src/
│   │   │   ├── primitives/         # Base UI wrappers
│   │   │   ├── data-display/       # PropertyHistory, RelationList...
│   │   │   ├── value-inputs/       # StringInput, EntityRefInput, etc.
│   │   │   └── form-generator/     # Schema → form tree
│   │   └── package.json
│   │
│   ├── github-client/              # Octokit wrapper for PR automation
│   │   └── src/
│   │
│   ├── i18n/                       # Translation utilities
│   │   └── src/
│   │
│   ├── importers/                  # AI-assisted ingestion harness
│   │   ├── src/
│   │   │   ├── core/               # Importer<TSource, TEntity> interface
│   │   │   ├── validators/         # Output validation
│   │   │   └── strategies/         # Per-source mappers
│   │   └── package.json
│   │
│   ├── tsconfig/                   # Shared tsconfig presets
│   ├── oxlint-config/              # Shared lint config
│   └── tailwind-config/            # Shared Tailwind preset + tokens
│
├── data/
│   ├── schemas/
│   │   ├── entity-types/           # See section 2
│   │   ├── property-types/         # See section 3
│   │   ├── relation-types/         # See section 4
│   │   └── vocabulary/             # See section 5
│   ├── universes/
│   │   └── one-piece/
│   │       ├── universe.json       # Metadata about the universe itself
│   │       ├── entities/
│   │       │   ├── character/
│   │       │   ├── devil-fruit/
│   │       │   ├── crew/
│   │       │   ├── organization/
│   │       │   ├── location/
│   │       │   ├── technique/
│   │       │   ├── weapon/
│   │       │   ├── ship/
│   │       │   ├── race/
│   │       │   ├── manga-chapter/
│   │       │   ├── anime-episode/
│   │       │   ├── film/
│   │       │   ├── arc/
│   │       │   ├── saga/
│   │       │   ├── event/
│   │       │   ├── sbs/
│   │       │   ├── databook/
│   │       │   ├── title/
│   │       │   ├── concept/
│   │       │   └── image/
│   │       ├── translations/
│   │       │   ├── en/
│   │       │   │   └── <type>/...
│   │       │   └── fr/
│   │       │       └── <type>/...
│   │       └── narratives/
│   │           ├── en/
│   │           │   ├── character/
│   │           │   ├── event/
│   │           │   └── arc/
│   │           └── fr/
│   │               └── ...
│   └── migrations/                 # Numbered TS scripts on JSON
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── SCHEMA_SPEC.md
│   ├── CONVENTIONS.md
│   ├── ROADMAP.md
│   ├── DECISIONS.md
│   ├── EPISTEMIC_MODEL.md
│   ├── CANON_MODEL.md
│   ├── BUILD_PIPELINE.md
│   ├── DASHBOARD_ARCHITECTURE.md
│   ├── I18N_STRATEGY.md
│   ├── GITHUB_INTEGRATION.md
│   ├── IMAGES.md
│   └── INVENTORY.md                # This file
│
├── scripts/                        # One-off scripts (migration runners)
├── .github/                        # CI workflows, PR templates
├── dist/                           # Build artifacts (gitignored)
│
├── CLAUDE.md
├── README.md
├── IDEAS.md                        # Parking lot for deferred ideas
├── package.json                    # Workspace root
├── turbo.json
├── bunfig.toml
├── tsconfig.base.json
├── dprint.json
├── lefthook.yml
└── commitlint.config.ts
```

---

## 2. Entity types (20)

| ID              | Category   | Description                                 | URL segment     |
| --------------- | ---------- | ------------------------------------------- | --------------- |
| `character`     | people     | Any named individual in the universe        | `characters`    |
| `race`          | people     | A race or species                           | `races`         |
| `crew`          | groups     | A pirate crew or other organized group      | `crews`         |
| `organization`  | groups     | Navy, World Government, Cipher Pol, etc.    | `organizations` |
| `devil-fruit`   | things     | A Devil Fruit (Akuma no Mi)                 | `devil-fruits`  |
| `technique`     | things     | A named combat or special technique         | `techniques`    |
| `weapon`        | things     | A named weapon (Wado Ichimonji, etc.)       | `weapons`       |
| `ship`          | things     | A named ship                                | `ships`         |
| `location`      | places     | An island, sea, city, kingdom, etc.         | `locations`     |
| `title`         | abstract   | An inheritable title (Joy Boy, Pirate King) | `titles`        |
| `concept`       | abstract   | Mythological/philosophical entity (Nika)    | `concepts`      |
| `manga-chapter` | source     | A manga chapter                             | `chapters`      |
| `anime-episode` | source     | An anime episode                            | `episodes`      |
| `film`          | source     | A film                                      | `films`         |
| `sbs`           | source     | An SBS question corner                      | `sbs`           |
| `databook`      | source     | A databook / Vivre Card / guide volume      | `databooks`     |
| `arc`           | container  | A narrative arc                             | `arcs`          |
| `saga`          | container  | A saga (contains multiple arcs)             | `sagas`         |
| `event`         | occurrence | A significant in-universe occurrence        | `events`        |
| `image`         | media      | An image, with R2-hosted URL and metadata   | `images`        |

### 2.1 Properties per entity type

Each entity type accepts a specific set of properties. The full
property-type definitions are in section 3. Universal qualifiers
(section 6) are available on every historisable value of every type.

#### `character`

| Property          | Required | Historical | Localizable | Notes                           |
| ----------------- | -------- | ---------- | ----------- | ------------------------------- |
| `name`            | yes      | yes        | yes         | Multiple entries by name_type   |
| `epithet`         | no       | yes        | yes         | "Straw Hat", "Pirate Hunter"    |
| `bounty`          | no       | yes        | no          | In berries                      |
| `age`             | no       | yes        | no          |                                 |
| `height`          | no       | yes        | no          | In cm                           |
| `weight`          | no       | yes        | no          | In kg (often unspecified)       |
| `birthday`        | no       | no         | no          | MM-DD format                    |
| `blood_type`      | no       | no         | no          | A, B, AB, O, with +/-           |
| `gender`          | no       | no         | no          | Vocabulary `genders`            |
| `haki_types`      | no       | yes        | no          | Multi-enum `haki-types`         |
| `status`          | yes      | yes        | no          | Vocabulary `character-statuses` |
| `birthplace`      | no       | no         | no          | entity_ref to `location`        |
| `description_key` | no       | no         | yes         | Short bio key                   |

Allowed relations: `member-of`, `ate-fruit`, `uses-technique`,
`wields-weapon`, `family-of`, `ally-of`, `enemy-of`, `mentor-of`,
`mentored-by`, `bears-title`, `belongs-to-race`, `born-in`, `resides-in`,
`captains`, `pilots`, `participated-in`, `depicted-by`.

---

#### `devil-fruit`

| Property                    | Required | Historical | Localizable | Notes                                    |
| --------------------------- | -------- | ---------- | ----------- | ---------------------------------------- |
| `name`                      | yes      | yes        | yes         | Common, true_name, etc.                  |
| `classification`            | yes      | yes        | no          | Vocabulary `devil-fruit-classifications` |
| `awakened`                  | no       | yes        | no          | Boolean                                  |
| `abilities_description_key` | no       | yes        | yes         | Short description key                    |

Allowed relations: `eaten-by`, `enables-technique`, `depicted-by`,
`sourced-from`.

---

#### `crew`

| Property          | Required | Historical | Localizable | Notes                  |
| ----------------- | -------- | ---------- | ----------- | ---------------------- |
| `name`            | yes      | yes        | yes         |                        |
| `total_bounty`    | no       | yes        | no          | Computed at build time |
| `founded_at`      | no       | no         | no          | source_ref             |
| `disbanded_at`    | no       | no         | no          | source_ref             |
| `jolly_roger`     | no       | yes        | no          | entity_ref to `image`  |
| `description_key` | no       | no         | yes         |                        |

Allowed relations: `has-member`, `ally-of`, `enemy-of`, `based-in`,
`captained-by`, `flies-flag`, `depicted-by`.

---

#### `organization`

| Property            | Required | Historical | Localizable | Notes                  |
| ------------------- | -------- | ---------- | ----------- | ---------------------- |
| `name`              | yes      | yes        | yes         |                        |
| `organization_type` | yes      | no         | no          | Vocabulary `org-types` |
| `founded_at`        | no       | no         | no          | source_ref             |
| `description_key`   | no       | no         | yes         |                        |

Allowed relations: `has-member`, `ally-of`, `enemy-of`, `based-in`,
`led-by`, `controls-territory`, `depicted-by`.

---

#### `location`

| Property           | Required | Historical | Localizable | Notes                          |
| ------------------ | -------- | ---------- | ----------- | ------------------------------ |
| `name`             | yes      | yes        | yes         |                                |
| `location_subtype` | yes      | no         | no          | Vocabulary `location-subtypes` |
| `climate`          | no       | no         | yes         |                                |
| `population`       | no       | yes        | no          |                                |
| `description_key`  | no       | no         | yes         |                                |

Allowed relations: `part-of-location`, `contains-location`,
`birthplace-of`, `home-of`, `ruled-by`, `depicted-by`.

---

#### `technique`

| Property          | Required | Historical | Localizable | Notes                        |
| ----------------- | -------- | ---------- | ----------- | ---------------------------- |
| `name`            | yes      | yes        | yes         |                              |
| `technique_type`  | yes      | no         | no          | Vocabulary `technique-types` |
| `description_key` | no       | no         | yes         |                              |

Allowed relations: `used-by`, `enabled-by-fruit`, `derived-from`,
`depicted-by`.

---

#### `weapon`

| Property          | Required | Historical | Localizable | Notes                      |
| ----------------- | -------- | ---------- | ----------- | -------------------------- |
| `name`            | yes      | yes        | yes         |                            |
| `weapon_type`     | yes      | no         | no          | Vocabulary `weapon-types`  |
| `weapon_grade`    | no       | no         | no          | Vocabulary `weapon-grades` |
| `description_key` | no       | no         | yes         |                            |

Allowed relations: `wielded-by`, `forged-by`, `depicted-by`.

---

#### `ship`

| Property          | Required | Historical | Localizable | Notes                   |
| ----------------- | -------- | ---------- | ----------- | ----------------------- |
| `name`            | yes      | yes        | yes         |                         |
| `ship_type`       | yes      | no         | no          | Vocabulary `ship-types` |
| `crew_capacity`   | no       | no         | no          |                         |
| `built_at`        | no       | no         | no          | source_ref              |
| `destroyed_at`    | no       | no         | no          | source_ref              |
| `description_key` | no       | no         | yes         |                         |

Allowed relations: `captained-by`, `crewed-by`, `flies-flag`,
`replaced-by`, `replaces`, `depicted-by`.

---

#### `race`

| Property          | Required | Historical | Localizable | Notes   |
| ----------------- | -------- | ---------- | ----------- | ------- |
| `name`            | yes      | yes        | yes         |         |
| `description_key` | no       | no         | yes         |         |
| `lifespan`        | no       | no         | no          | Average |
| `average_height`  | no       | no         | no          |         |

Allowed relations: `has-member-race`, `originates-from`, `depicted-by`.

---

#### `title`

| Property          | Required | Historical | Localizable | Notes                        |
| ----------------- | -------- | ---------- | ----------- | ---------------------------- |
| `name`            | yes      | yes        | yes         |                              |
| `description_key` | no       | no         | yes         |                              |
| `single_holder`   | no       | no         | no          | Boolean — only one at a time |

Allowed relations: `borne-by`, `granted-by`, `depicted-by`.

---

#### `concept`

| Property          | Required | Historical | Localizable | Notes                         |
| ----------------- | -------- | ---------- | ----------- | ----------------------------- |
| `name`            | yes      | yes        | yes         |                               |
| `concept_subtype` | yes      | no         | no          | Vocabulary `concept-subtypes` |
| `description_key` | no       | no         | yes         |                               |

Allowed relations: `embodied-by`, `appears-in`, `depicted-by`.

---

#### `manga-chapter`

| Property          | Required | Historical | Localizable | Notes                         |
| ----------------- | -------- | ---------- | ----------- | ----------------------------- |
| `number`          | yes      | no         | no          |                               |
| `title_key`       | yes      | no         | yes         | Japanese title + translations |
| `published_at_jp` | yes      | no         | no          | ISO date                      |
| `volume`          | no       | no         | no          | Volume number/string          |
| `page_count`      | no       | no         | no          |                               |
| `canon_scope`     | yes      | no         | no          | Always `manga`                |
| `cover_image`     | no       | no         | no          | entity_ref to `image`         |

Allowed relations: `features`, `part-of-arc`, `adapted-by`,
`introduces-character`, `references-event`, `depicted-by`.

---

#### `anime-episode`

| Property          | Required | Historical | Localizable | Notes                     |
| ----------------- | -------- | ---------- | ----------- | ------------------------- |
| `number`          | yes      | no         | no          |                           |
| `title_key`       | yes      | no         | yes         |                           |
| `aired_at_jp`     | yes      | no         | no          | ISO date                  |
| `runtime_minutes` | no       | no         | no          |                           |
| `canon_scope`     | yes      | no         | no          | `anime` or `anime_filler` |

Allowed relations: `features`, `adapts`, `part-of-arc`, `depicted-by`.

---

#### `film`

| Property             | Required | Historical | Localizable | Notes                            |
| -------------------- | -------- | ---------- | ----------- | -------------------------------- |
| `title_key`          | yes      | no         | yes         |                                  |
| `released_at_jp`     | yes      | no         | no          | ISO date                         |
| `runtime_minutes`    | yes      | no         | no          |                                  |
| `canon_scope`        | yes      | no         | no          | `film_canon` or `film_non_canon` |
| `oda_supervised`     | no       | no         | no          | Boolean                          |
| `director`           | no       | no         | no          | String                           |
| `canonical_elements` | no       | no         | no          | String array — what's canon      |

Allowed relations: `features`, `depicted-by`.

---

#### `sbs`

| Property          | Required | Historical | Localizable | Notes         |
| ----------------- | -------- | ---------- | ----------- | ------------- |
| `volume`          | yes      | no         | no          | Volume number |
| `published_at_jp` | yes      | no         | no          |               |
| `canon_scope`     | yes      | no         | no          | Always `sbs`  |

Allowed relations: `mentions`, `clarifies-fact`.

---

#### `databook`

| Property           | Required | Historical | Localizable | Notes                           |
| ------------------ | -------- | ---------- | ----------- | ------------------------------- |
| `name`             | yes      | yes        | yes         | "Vivre Card", "Yellow Magazine" |
| `published_at_jp`  | yes      | no         | no          |                                 |
| `canon_scope`      | yes      | no         | no          | Always `databook`               |
| `databook_subtype` | yes      | no         | no          | Vocabulary `databook-subtypes`  |

Allowed relations: `mentions`, `clarifies-fact`, `depicted-by`.

---

#### `arc`

| Property        | Required | Historical | Localizable | Notes                        |
| --------------- | -------- | ---------- | ----------- | ---------------------------- |
| `name`          | yes      | yes        | yes         | "Wano Country", "Marineford" |
| `arc_subtype`   | yes      | no         | no          | Vocabulary `arc-subtypes`    |
| `narrative_key` | no       | no         | yes         | Arc summary key              |
| `chapter_range` | no       | no         | no          | { first, last } source_refs  |

Allowed relations: `part-of-saga`, `contains-chapter`,
`features-characters`, `set-in`, `depicted-by`.

---

#### `saga`

| Property        | Required | Historical | Localizable | Notes                   |
| --------------- | -------- | ---------- | ----------- | ----------------------- |
| `name`          | yes      | yes        | yes         | "Paradise", "New World" |
| `saga_number`   | yes      | no         | no          |                         |
| `narrative_key` | no       | no         | yes         |                         |

Allowed relations: `contains-arc`.

---

#### `event`

| Property           | Required | Historical | Localizable | Notes                         |
| ------------------ | -------- | ---------- | ----------- | ----------------------------- |
| `event_subtype`    | yes      | no         | no          | Vocabulary `event-subtypes`   |
| `narrative_key`    | no       | no         | yes         |                               |
| `first_source`     | yes      | no         | no          | source_ref                    |
| `last_source`      | no       | no         | no          | source_ref                    |
| `primary_location` | no       | no         | no          | entity_ref to `location`      |
| `is_public`        | no       | no         | no          | Boolean — affects propagation |

Allowed relations: `participant`, `caused-death-of`,
`occurs-during-arc`, `caused-by-event`, `causes-event`, `set-in`,
`depicted-by`.

---

#### `image`

| Property        | Required | Historical | Localizable | Notes                        |
| --------------- | -------- | ---------- | ----------- | ---------------------------- |
| `url`           | yes      | yes        | no          | R2 URL                       |
| `caption_key`   | no       | yes        | yes         | i18n key                     |
| `alt_text_key`  | yes      | yes        | yes         | A11y; required               |
| `license`       | yes      | no         | no          | Vocabulary `image-licenses`  |
| `attribution`   | yes      | no         | no          | "Eiichiro Oda / Shueisha"    |
| `source_origin` | no       | no         | no          | Where the image was obtained |
| `width`         | no       | no         | no          | Pixels                       |
| `height`        | no       | no         | no          | Pixels                       |
| `format`        | yes      | no         | no          | Vocabulary `image-formats`   |
| `spoiler_since` | yes      | no         | no          | source_ref                   |

Allowed relations: `depicts`, `sourced-from`.

---

## 3. Property types (~35)

Property types are reusable across entity types. The list below groups
them by domain. Each has a value_type (section 7), constraints, optional
unit, and qualifier policy (section 6).

### 3.1 Identity & naming

| Property          | Value type | Constraints                  | Vocabulary   |
| ----------------- | ---------- | ---------------------------- | ------------ |
| `name`            | `i18n_key` | name_type qualifier required | `name-types` |
| `epithet`         | `i18n_key` | given_by qualifier optional  | —            |
| `description_key` | `i18n_key` | —                            | —            |
| `caption_key`     | `i18n_key` | —                            | —            |
| `alt_text_key`    | `i18n_key` | required for `image`         | —            |
| `narrative_key`   | `i18n_key` | —                            | —            |
| `title_key`       | `i18n_key` | —                            | —            |

### 3.2 Numeric properties

| Property          | Value type | Unit  | Constraints           |
| ----------------- | ---------- | ----- | --------------------- |
| `bounty`          | `number`   | berry | min:0, step:1_000_000 |
| `age`             | `number`   | year  | min:0                 |
| `height`          | `number`   | cm    | min:0                 |
| `weight`          | `number`   | kg    | min:0                 |
| `population`      | `number`   | —     | min:0                 |
| `number`          | `number`   | —     | min:0                 |
| `volume`          | `string`   | —     | (numeric or named)    |
| `page_count`      | `number`   | —     | min:1                 |
| `runtime_minutes` | `number`   | min   | min:0                 |
| `saga_number`     | `number`   | —     | min:1                 |
| `width`           | `number`   | px    | min:0                 |
| `height` (image)  | `number`   | px    | min:0                 |
| `crew_capacity`   | `number`   | —     | min:0                 |
| `total_bounty`    | `number`   | berry | computed at build     |
| `lifespan`        | `number`   | year  | (race average)        |
| `average_height`  | `number`   | cm    | (race average)        |

### 3.3 Dates and temporal references

| Property          | Value type   | Notes                                 |
| ----------------- | ------------ | ------------------------------------- |
| `birthday`        | `date`       | MM-DD only (no year for characters)   |
| `published_at_jp` | `date`       | ISO 8601 full date                    |
| `aired_at_jp`     | `date`       | ISO 8601 full date                    |
| `released_at_jp`  | `date`       | ISO 8601 full date                    |
| `founded_at`      | `source_ref` | When in-fiction the founding occurred |
| `disbanded_at`    | `source_ref` | When in-fiction disbanded             |
| `built_at`        | `source_ref` | Ship                                  |
| `destroyed_at`    | `source_ref` | Ship                                  |
| `spoiler_since`   | `source_ref` | Image safety threshold                |
| `first_source`    | `source_ref` | Event span start                      |
| `last_source`     | `source_ref` | Event span end                        |

### 3.4 Categorical (enum-backed)

| Property              | Value type   | Vocabulary                    |
| --------------------- | ------------ | ----------------------------- |
| `status`              | `enum`       | `character-statuses`          |
| `gender`              | `enum`       | `genders`                     |
| `classification` (DF) | `enum`       | `devil-fruit-classifications` |
| `location_subtype`    | `enum`       | `location-subtypes`           |
| `technique_type`      | `enum`       | `technique-types`             |
| `weapon_type`         | `enum`       | `weapon-types`                |
| `weapon_grade`        | `enum`       | `weapon-grades`               |
| `ship_type`           | `enum`       | `ship-types`                  |
| `organization_type`   | `enum`       | `org-types`                   |
| `arc_subtype`         | `enum`       | `arc-subtypes`                |
| `event_subtype`       | `enum`       | `event-subtypes`              |
| `concept_subtype`     | `enum`       | `concept-subtypes`            |
| `canon_scope`         | `enum`       | `canon-scopes`                |
| `databook_subtype`    | `enum`       | `databook-subtypes`           |
| `license`             | `enum`       | `image-licenses`              |
| `format`              | `enum`       | `image-formats`               |
| `haki_types`          | `multi_enum` | `haki-types`                  |

### 3.5 Boolean

| Property         | Value type | Notes                                  |
| ---------------- | ---------- | -------------------------------------- |
| `awakened`       | `boolean`  | Devil Fruit                            |
| `oda_supervised` | `boolean`  | Film                                   |
| `is_public`      | `boolean`  | Event — controls knowledge propagation |
| `single_holder`  | `boolean`  | Title                                  |

### 3.6 References

| Property             | Value type   | Target type       |
| -------------------- | ------------ | ----------------- |
| `url`                | `string`     | (R2 URL)          |
| `birthplace`         | `entity_ref` | `location`        |
| `primary_location`   | `entity_ref` | `location`        |
| `jolly_roger`        | `entity_ref` | `image`           |
| `cover_image`        | `entity_ref` | `image`           |
| `attribution`        | `string`     | —                 |
| `source_origin`      | `string`     | —                 |
| `director`           | `string`     | (free-form)       |
| `climate`            | `string`     | —                 |
| `blood_type`         | `string`     | A, B, AB, O, +/−  |
| `canonical_elements` | `string[]`   | (film canonicity) |

---

## 4. Relation types (52)

Relations are typed, directed links between entities. The build pipeline
generates inverses automatically when `inverse_inferred: true`.

### 4.1 Group affiliation

| Type        | From                                | To                     | Inverse      | Qualifiers                                              |
| ----------- | ----------------------------------- | ---------------------- | ------------ | ------------------------------------------------------- |
| `member-of` | `character`                         | `crew`, `organization` | `has-member` | role, since, until, loyalty_status, appears_to_world_as |
| `led-by`    | `crew`, `organization`              | `character`            | `leads`      | since, until                                            |
| `ally-of`   | `character`, `crew`, `organization` | (same)                 | (symmetric)  | since, until                                            |
| `enemy-of`  | `character`, `crew`, `organization` | (same)                 | (symmetric)  | since, until, intensity                                 |

### 4.2 Powers & abilities

| Type               | From        | To            | Inverse             | Qualifiers              |
| ------------------ | ----------- | ------------- | ------------------- | ----------------------- |
| `ate-fruit`        | `character` | `devil-fruit` | `eaten-by`          | since, epistemic_status |
| `uses-technique`   | `character` | `technique`   | `used-by`           | since, mastery_level    |
| `enabled-by-fruit` | `technique` | `devil-fruit` | `enables-technique` | —                       |
| `wields-weapon`    | `character` | `weapon`      | `wielded-by`        | since, until            |
| `forged-by`        | `weapon`    | `character`   | `forged-weapon`     | —                       |

### 4.3 Relationships

| Type         | From        | To          | Inverse           | Qualifiers                          |
| ------------ | ----------- | ----------- | ----------------- | ----------------------------------- |
| `family-of`  | `character` | `character` | (symmetric/typed) | relation_kind, known_publicly_since |
| `mentor-of`  | `character` | `character` | `mentored-by`     | since, until                        |
| `friend-of`  | `character` | `character` | (symmetric)       | since                               |
| `rival-of`   | `character` | `character` | (symmetric)       | since                               |
| `married-to` | `character` | `character` | (symmetric)       | since, until                        |

### 4.4 Race & origin

| Type              | From        | To         | Inverse           | Qualifiers   |
| ----------------- | ----------- | ---------- | ----------------- | ------------ |
| `belongs-to-race` | `character` | `race`     | `has-member-race` | —            |
| `born-in`         | `character` | `location` | `birthplace-of`   | —            |
| `resides-in`      | `character` | `location` | `home-of`         | since, until |
| `originates-from` | `race`      | `location` | `origin-of-race`  | —            |

### 4.5 Geographic

| Type                 | From                   | To          | Inverse               | Qualifiers   |
| -------------------- | ---------------------- | ----------- | --------------------- | ------------ |
| `part-of-location`   | `location`             | `location`  | `contains-location`   | —            |
| `based-in`           | `crew`, `organization` | `location`  | `houses-organization` | since        |
| `controls-territory` | `organization`         | `location`  | `controlled-by`       | since, until |
| `set-in`             | `event`, `arc`         | `location`  | `setting-of`          | —            |
| `ruled-by`           | `location`             | `character` | `rules`               | since, until |

### 4.6 Titles & inheritance

| Type          | From        | To                          | Inverse        | Qualifiers                     |
| ------------- | ----------- | --------------------------- | -------------- | ------------------------------ |
| `bears-title` | `character` | `title`                     | `borne-by`     | since, until, epistemic_status |
| `granted-by`  | `title`     | `character`, `organization` | `grants-title` | —                              |

### 4.7 Ship-related

| Type         | From           | To      | Inverse        | Qualifiers   |
| ------------ | -------------- | ------- | -------------- | ------------ |
| `captains`   | `character`    | `ship`  | `captained-by` | since, until |
| `pilots`     | `character`    | `ship`  | `piloted-by`   | since, until |
| `crewed-by`  | `ship`         | `crew`  | `sails`        | since, until |
| `flies-flag` | `ship`, `crew` | `image` | `flag-of`      | since        |
| `replaces`   | `ship`         | `ship`  | `replaced-by`  | since        |

### 4.8 Source ↔ entity

| Type                   | From              | To          | Inverse                | Qualifiers                                          |
| ---------------------- | ----------------- | ----------- | ---------------------- | --------------------------------------------------- |
| `features`             | source types      | any entity  | `appears-in`           | appearance_type, is_first_appearance, is_first_full |
| `introduces-character` | source types      | `character` | `introduced-in`        | —                                                   |
| `references-event`     | source types      | `event`     | `referenced-by-source` | —                                                   |
| `mentions`             | `sbs`, `databook` | any entity  | `mentioned-in`         | —                                                   |
| `clarifies-fact`       | `sbs`, `databook` | any entity  | `clarified-in`         | property_name                                       |

### 4.9 Source ↔ source (adaptation)

| Type         | From            | To              | Inverse         | Qualifiers |
| ------------ | --------------- | --------------- | --------------- | ---------- |
| `adapted-by` | `manga-chapter` | `anime-episode` | `adapts`        | coverage   |
| `references` | source types    | source types    | `referenced-by` | —          |

### 4.10 Narrative structure

| Type                  | From                             | To          | Inverse            | Qualifiers |
| --------------------- | -------------------------------- | ----------- | ------------------ | ---------- |
| `part-of-arc`         | `manga-chapter`, `anime-episode` | `arc`       | `contains-chapter` | —          |
| `part-of-saga`        | `arc`                            | `saga`      | `contains-arc`     | —          |
| `occurs-during-arc`   | `event`                          | `arc`       | `contains-event`   | —          |
| `features-characters` | `arc`                            | `character` | `featured-in-arc`  | role       |

### 4.11 Events

| Type              | From    | To                                  | Inverse           | Qualifiers                          |
| ----------------- | ------- | ----------------------------------- | ----------------- | ----------------------------------- |
| `participant`     | `event` | `character`, `crew`, `organization` | `participated-in` | side, role, outcome, notable_action |
| `caused-death-of` | `event` | `character`                         | `died-in-event`   | cause                               |
| `caused-by-event` | `event` | `event`                             | `causes-event`    | —                                   |

### 4.12 Concept embodiment

| Type          | From      | To          | Inverse    | Qualifiers              |
| ------------- | --------- | ----------- | ---------- | ----------------------- |
| `embodied-by` | `concept` | `character` | `embodies` | since, epistemic_status |

### 4.13 Images

| Type           | From                | To           | Inverse         | Qualifiers                   |
| -------------- | ------------------- | ------------ | --------------- | ---------------------------- |
| `depicted-by`  | (most entity types) | `image`      | `depicts`       | role, period, context, since |
| `sourced-from` | `image`             | source types | `sources-image` | —                            |

---

## 5. Vocabularies / Enums (36)

Each vocabulary lives in `/data/schemas/vocabulary/<id>.json`. All
values have localized labels (EN, FR at minimum).

### 5.1 `epistemic-statuses`

`true`, `confirmed`, `believed_by_world`, `believed_by_characters`,
`revealed_to_reader`, `rumored`, `implied`, `retconned`, `disputed`

### 5.2 `review-statuses`

`reviewed`, `not_reviewed`, `flagged`, `auto_imported`

### 5.3 `canon-scopes`

`manga`, `anime`, `anime_filler`, `film_canon`, `film_non_canon`,
`sbs`, `databook`, `live_action`, `crossover`, `video_game`

### 5.4 `name-types`

`common`, `full_name`, `true_name`, `epithet`, `nickname`, `alias`,
`codename`, `title`, `insult`, `honorific`, `mistranslation`,
`native_script`, `romanized`, `literal_meaning`

### 5.5 `appearance-types`

`full`, `silhouette`, `partial`, `mentioned`, `named_only`,
`flashback`, `cover_story`, `recap`, `vision`, `photograph`,
`portrait`, `corpse`, `imagined`, `narrator_only`

### 5.6 `character-statuses`

`alive`, `dead`, `presumed_dead`, `missing`, `unknown`, `in_hiding`,
`incapacitated`

### 5.7 `genders`

`male`, `female`, `non_binary`, `unknown`, `not_applicable`

### 5.8 `haki-types`

`observation`, `armament`, `conqueror`, `observation_advanced`,
`armament_advanced`, `conqueror_advanced`

### 5.9 `devil-fruit-classifications`

`paramecia`, `zoan`, `logia`, `mythical_zoan`, `ancient_zoan`,
`special_paramecia`, `smile`, `artificial`, `unknown`

### 5.10 `crew-roles`

`captain`, `first_mate`, `vice_captain`, `navigator`, `cook`, `doctor`,
`archaeologist`, `shipwright`, `musician`, `sniper`, `helmsman`,
`apprentice`, `cabin_boy`, `combatant`, `tactician`

### 5.11 `loyalty-statuses`

`founder`, `member`, `former_member`, `traitor`, `undercover`,
`allied`, `presumed_dead_member`, `honorary`

### 5.12 `org-types`

`marine`, `world_government_branch`, `cipher_pol`, `revolutionary`,
`secret_society`, `royal_court`, `merchant_guild`, `religious_order`

### 5.13 `location-subtypes`

`ocean`, `sea`, `island`, `archipelago`, `kingdom`, `country`, `city`,
`town`, `village`, `region`, `building`, `sky_island`, `undersea`,
`fishman_district`, `ghost_island`, `floating_island`,
`pirate_haven`, `marine_base`, `prison`

### 5.14 `technique-types`

`haki_based`, `devil_fruit_based`, `swordsmanship`, `hand_to_hand`,
`ranged`, `support`, `defensive`, `combo`, `signature`

### 5.15 `weapon-types`

`sword`, `katana`, `gun`, `cannon`, `staff`, `knife`, `spear`, `axe`,
`hammer`, `whip`, `kanabo`, `bow`, `shuriken`, `naginata`, `shikomizue`,
`cutlass`, `saber`, `exotic`

### 5.16 `weapon-grades`

`saijo_o_wazamono`, `o_wazamono`, `ryo_wazamono`, `wazamono`, `unranked`
(the Meitō tiers, ADR-040; `cursed` and black-blade are now orthogonal
boolean properties `is_cursed` / `is_black_blade`, not grades)

### 5.17 `ship-types`

`caravel`, `galleon`, `sloop`, `frigate`, `marine_warship`, `submarine`,
`flying_ship`, `mini_ship`, `pirate_ship`

### 5.18 `arc-subtypes`

`introductory`, `training`, `exploration`, `war`, `mystery`,
`political`, `tournament`, `flashback`, `cover_story`

### 5.19 `event-subtypes`

`battle`, `death`, `presumed_death`, `recruitment`, `separation`,
`revelation`, `bounty_change`, `alliance_formed`, `alliance_broken`,
`awakening`, `transformation`, `capture`, `escape`, `declaration`,
`coronation`, `execution`, `betrayal`

### 5.20 `concept-subtypes`

`mythological_figure`, `philosophical`, `in_universe_phenomenon`,
`cosmological`, `cultural`, `historical_period`

### 5.21 `databook-subtypes`

`vivre_card`, `magazine`, `guide_volume`, `yellow`, `green`, `blue`,
`red`, `gold`, `silver`

### 5.22 `image-licenses`

`official_shueisha`, `fan_art_permitted`, `fan_art_fair_use`,
`screenshot_anime`, `screenshot_manga`, `public_domain`, `cc_by`,
`cc_by_sa`

### 5.23 `image-formats`

`webp`, `jpg`, `png`, `gif`, `avif`, `svg`

### 5.24 `depiction-roles`

`primary_portrait`, `secondary_portrait`, `scene`,
`ability_illustration`, `group_photo`, `equipment_view`,
`location_view`, `emotional_moment`, `cover`, `silhouette`,
`color_spread`, `wanted_poster_illustration`

### 5.25 `translation-variants`

`viz` (Viz Media EN), `glenat` (Glénat FR), `kana` (Kana FR),
`official_dub_en`, `official_dub_fr`, `fan_translation`

---

## 6. Universal qualifiers

Available on every historisable property value. They are NOT declared
per-property; they are implicit.

| Qualifier          | Value type           | Default     | Meaning                                       |
| ------------------ | -------------------- | ----------- | --------------------------------------------- |
| `since`            | `source_ref`         | (required)  | When this value starts applying               |
| `until`            | `source_ref`         | none        | When this value stops applying                |
| `source`           | `source_ref`         | = since     | Source citing the value                       |
| `epistemic_status` | enum                 | `true`      | What kind of truth (see 5.1)                  |
| `actual_value`     | same as value        | none        | The real truth when value is a false belief   |
| `event`            | `entity_ref` (event) | none        | The event that caused/revealed this value     |
| `believed_by`      | `entity_ref[]`       | none        | Specific characters who hold this belief      |
| `known_truth_by`   | `entity_ref[]`       | none        | Specific characters who know the actual truth |
| `canon_scope`      | enum                 | from source | Override the source's canon scope             |
| `in_universe_date` | `string`             | none        | In-universe date when known                   |
| `assisted_by`      | `string`             | none        | AI agent that generated this value            |
| `review_status`    | enum                 | `reviewed`  | Human review state                            |
| `note_key`         | `i18n_key`           | none        | Localized explanatory note                    |
| `superseded_by`    | same as value        | none        | Replacement for retconned values              |

### 6.1 Universal relation qualifiers (ADR-037)

A parallel epistemic set is implicit on **every relation**, inside its
`qualifiers` object. NOT declared per relation type; `check:coherence`
rejects a relation that re-declares one
(`RELATION_DECLARES_BASE_QUALIFIER`). Promoted to columns on the
`relations` table (mirrored onto the generated inverse) and surfaced on
the SDK `RelationRecord`. The temporal/citation qualifiers `since` /
`until` / `source` stay relation-type-declared, not base.

| Qualifier          | Value type           | Default | Meaning                                          |
| ------------------ | -------------------- | ------- | ------------------------------------------------ |
| `epistemic_status` | enum                 | `true`  | What kind of truth the link is (see 5.1)         |
| `believed_by`      | `entity_ref[]`       | none    | Characters who believe the link holds            |
| `known_truth_by`   | `entity_ref[]`       | none    | Characters who know its real nature              |
| `revealed_since`   | `source_ref` or list | none    | Source at which the link/its truth becomes known |

---

## 7. Primitive value types

The atomic types used by all property and qualifier value declarations.

| Type         | TS                               | Description                        |
| ------------ | -------------------------------- | ---------------------------------- |
| `string`     | `string`                         | UTF-8 text                         |
| `number`     | `number`                         | Integer or decimal                 |
| `boolean`    | `boolean`                        | `true` / `false`                   |
| `enum`       | `string` (validated)             | One of vocabulary values           |
| `multi_enum` | `string[]` (validated)           | Multiple vocabulary values         |
| `date`       | `string` (ISO 8601)              | Calendar date (real-world)         |
| `entity_ref` | `EntityId` (`type:slug` branded) | Reference to any entity            |
| `source_ref` | `EntityId` of source type        | Reference to a source entity       |
| `i18n_key`   | `string` (dotted path)           | Reference to a translation key     |
| `markdown`   | `string` (light Markdown)        | Used in narratives, not properties |

---

## 8. Special structural fields

These exist on every entity, declared once in primitives.

| Field                | Type         | Notes                                       |
| -------------------- | ------------ | ------------------------------------------- |
| `$schema`            | URL          | Pointer to meta-schema                      |
| `id`                 | `EntityId`   | `type:slug`, immutable                      |
| `type`               | string       | Must match the entity type                  |
| `schema_version`     | integer      | For migration tracking                      |
| `slug`               | string       | URL-facing, mutable                         |
| `slug_history`       | `string[]`   | Defaults to `[]`, omit when empty           |
| `canonical_name_key` | `i18n_key`   | For display in listings                     |
| `properties`         | object       | Keyed by property id                        |
| `relations`          | `Relation[]` | Outgoing relations                          |
| `spans`              | object       | For events: first_source, last_source, etc. |

---

## 9. Cross-reference matrix

### 9.1 Entity types that can appear in `features` relations (source side)

`manga-chapter`, `anime-episode`, `film`, `sbs`, `databook`

### 9.2 Entity types that can be `depicted-by` images

`character`, `devil-fruit`, `crew`, `organization`, `location`,
`technique`, `weapon`, `ship`, `race`, `title`, `concept`, `event`,
`arc`, `saga`, `manga-chapter`, `anime-episode`, `film`

### 9.3 Entity types that can be `participant` of events

`character`, `crew`, `organization`

### 9.4 Source-type entities (the ones a `source_ref` can point to)

`manga-chapter`, `anime-episode`, `film`, `sbs`, `databook`

### 9.5 Container-type entities (organize other entities)

`arc`, `saga`, `event`

### 9.6 Image as universal "stuff sink"

Every concrete entity type can have images. Image is the only entity
type that does NOT have a `depicted-by` relation (an image cannot be
depicted by another image).

---

## 10. Stats summary

- **Entity types**: 20
- **Property types**: ~35 (some shared across multiple entity types)
- **Relation types**: 52 (canonical declared; inverses are build-generated)
- **Vocabularies**: 36
- **Primitive value types**: 10
- **Universal qualifiers**: 14 (on property values) + 4 (on relations, ADR-037)
- **Source-type entities**: 5 (chapter, episode, film, sbs, databook)
- **Container entities**: 3 (arc, saga, event)
- **Things that depict / can be depicted**: 17 / 1 (image)

---

## 11. Phase 1 minimum vs full inventory

For Phase 1, the goal is to define **all schema types** in this inventory
but only seed ~10-20 sample entities. The schemas are the lasting
infrastructure; entity data comes via Phase 3 imports and ongoing
contribution.

What Phase 1 ships with:

- All 20 entity type schemas
- All ~35 property type schemas
- All ~30 relation type schemas
- All 25 vocabularies populated
- ~10 character entities (East Blue stars)
- ~5 devil fruits (Gomu Gomu and a few others)
- 1 crew (Straw Hat Pirates)
- 1 saga (East Blue saga)
- ~3 arcs (Romance Dawn, Orange Town, Syrup Village)
- ~10 chapters (1, 50, 95, 100, 432, 1043, 1044, 1053)
- 1 ship (Going Merry)
- 2 events (Luffy meets Zoro, first bounty)
- 1 image (Luffy primary portrait) — optional
- EN translations for everything
- FR translations for ~3 characters as proof of i18n

This is the seed set against which the build pipeline (Phase 2) and
preview app (Phase 3) are validated.

---

## 12. Adding to this inventory

Adding a new entity type, property type, relation type, or vocabulary
follows the procedure in SCHEMA_SPEC.md. **Update this file in the same
PR.** Inventory drift is the #1 risk for schema-driven projects.

When adding:

- Update the relevant section above
- Update the stats summary in section 10
- Update the cross-reference matrix in section 9 if applicable
- If the addition is non-trivial, add an ADR in DECISIONS.md

When removing:

- Mark as deprecated in this file for one release
- Provide a migration script in `/data/migrations/`
- Update DECISIONS.md
