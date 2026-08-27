# Inventory — One Piece Wiki Phase 1

Complete reference of every entity type, property type, relation type,
vocabulary, primitive value type, and universal qualifier defined for
Phase 1. This is the canonical inventory; all other docs reference it.

> This is a reference document. If you add a new schema element, update
> this file in the same PR.
>
> **Authoritative source.** The catalogue is authoritative (generated Zod in
> `packages/schemas`); this inventory is hand-maintained and can lag. **Since
> ADR-049 the schema files are split**: universal "core" lives in
> `/data/schemas/**`, One-Piece-specific schemas in
> `/data/universes/one-piece/schemas/**` (auto-scoped to `one-piece`). Sections
> 2–5 below list the **merged** catalogue (`core ∪ one-piece`) — what a One-Piece
> editor sees; they do not mark which side a type lives on (see ADR-049 for the
> partition). When in doubt, read the schema files or run `bun run schema:check`
> / `bun run check:coherence`. **Known lag
> (2026-06-14):** the §1 directory tree and the §2 per-type _allowed
> relations_ predate ADR-033/034's prefer-inferred cleanup — the deleted
> inverse mirrors (`eaten-by`, `used-by`, `wielded-by`, `enables-technique`,
> `birthplace-of`, `depicts`, `mentored-by`, `has-member-race`, `borne-by`,
> `contains-arc`, `contains-location`, `causes-event`, `replaced-by`,
> `participated-in`, `adapts`) are now **build-generated inverses**, not
> declarable relations. §3 (properties), §4 (relations) and §5 (vocabularies)
> are now fully enumerated and match their head counts; the §1 tree and the §2
> per-type _allowed relations_ are the remaining hand-maintained lag.

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
│   ├── schemas/                    # SHARED CORE only (universal; ADR-049)
│   │   ├── entity-types/           # image, manga-chapter, arc, event, person…
│   │   ├── property-types/         # name, dates, canon_scope, image fields…
│   │   ├── relation-types/         # depicted-by, features, participant…
│   │   └── vocabulary/             # epistemic-statuses, canon-scopes, name-types…
│   ├── universes/
│   │   └── one-piece/
│   │       ├── universe.json       # Metadata about the universe itself
│   │       ├── schemas/            # One-Piece-specific schemas (ADR-049)
│   │       │   ├── entity-types/   # character, devil-fruit, crew, location…
│   │       │   ├── property-types/ # bounty, haki_types, nullifies_devil_fruits…
│   │       │   ├── relation-types/ # ate-fruit, member-of, wields-weapon…
│   │       │   └── vocabulary/     # haki-types, marine-ranks, location-regions…
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

## 2. Entity types (38)

| ID                    | Category   | Description                                                      | URL segment            |
| --------------------- | ---------- | ---------------------------------------------------------------- | ---------------------- |
| `character`           | people     | Any named individual in the universe                             | `characters`           |
| `race`                | people     | A race or species                                                | `races`                |
| `crew`                | groups     | A pirate crew or other organized group                           | `crews`                |
| `organization`        | groups     | Navy, World Government, Cipher Pol, etc.                         | `organizations`        |
| `devil-fruit`         | things     | A Devil Fruit (Akuma no Mi)                                      | `devil-fruits`         |
| `technique`           | things     | A named combat or special technique                              | `techniques`           |
| `weapon`              | things     | A named weapon (Wado Ichimonji, etc.)                            | `weapons`              |
| `ship`                | things     | A named ship                                                     | `ships`                |
| `location`            | places     | An island, sea, city, kingdom, etc.                              | `locations`            |
| `title`               | abstract   | An inheritable title (Joy Boy, Pirate King)                      | `titles`               |
| `concept`             | abstract   | Mythological/philosophical entity (Nika)                         | `concepts`             |
| `manga-chapter`       | source     | A manga chapter                                                  | `chapters`             |
| `anime-episode`       | source     | An anime episode                                                 | `episodes`             |
| `film`                | source     | A film                                                           | `films`                |
| `sbs`                 | source     | An SBS question corner                                           | `sbs`                  |
| `databook`            | source     | A databook / Vivre Card / guide volume                           | `databooks`            |
| `arc`                 | container  | A narrative arc                                                  | `arcs`                 |
| `saga`                | container  | A saga (contains multiple arcs)                                  | `sagas`                |
| `event`               | occurrence | A significant in-universe occurrence                             | `events`               |
| `image`               | media      | An image, with R2-hosted URL and metadata                        | `images`               |
| `person`              | production | Real-world cast & staff (seiyū, VAs, actors, directors, mangaka) | `people`               |
| `material`            | things     | A named substance (Seastone, Adam Wood, Wapometal)               | `materials`            |
| `theme-song`          | production | An anime/film opening, ending, insert or image song              | `theme-songs`          |
| `streaming-platform`  | production | A watch/read platform (Netflix, Crunchyroll, MANGA Plus, Viz)    | `platforms`            |
| `company`             | production | A real-world company (studio, game dev/publisher, label, maker)  | `companies`            |
| `databook-card`       | source     | A numbered databook / Vivre Card profile card                    | `databook-cards`       |
| `transformation`      | powers     | A form/state (Gear 2-5, Sulong, Zoan form, awakening)            | `transformations`      |
| `album`               | production | A soundtrack / compilation / character-song album                | `albums`               |
| `video-game`          | sources    | A One Piece video game (console / handheld / PC / mobile)        | `games`                |
| `live-action-series`  | sources    | A live-action adaptation series (Netflix 2023)                   | `live-action`          |
| `live-action-episode` | sources    | An episode of a live-action series                               | `live-action-episodes` |
| `anime-special`       | sources    | An OVA, TV special, or ONA (non-theatrical anime)                | `specials`             |
| `live-performance`    | sources    | A stage adaptation (Premier Show, musical, kabuki, concert)      | `live-performances`    |
| `merchandise`         | production | Official merch (figure, model kit, plush, apparel, card)         | `merchandise`          |
| `volume`              | sources    | A collected manga volume (tankōbon)                              | `volumes`              |
| `sbs-qa`              | sources    | An atomic SBS question/answer entry (semi-canon reveal locus)    | `sbs-qa`               |
| `reference`           | meta       | An external attestation reference (interview, official site…)    | `references`           |
| `document`            | things     | An in-universe document (wanted poster, vivre card, newspaper…)  | `documents`            |

### 2.1 Properties per entity type

Each entity type accepts a specific set of properties. The full
property-type definitions are in section 3. Universal qualifiers
(section 6) are available on every historisable value of every type.

#### `character`

| Property            | Required     | Historical                   | Localizable | Notes                                              |
| ------------------- | ------------ | ---------------------------- | ----------- | -------------------------------------------------- |
| `name`              | yes          | yes                          | yes         | Multiple entries by name_type                      |
| `epithet`           | no           | yes                          | yes         | "Straw Hat", "Pirate Hunter"                       |
| `occupation`        | no           | yes                          | no          | Multi-enum `occupations`; profession (≠ crew role) |
| `bounty`            | no           | yes                          | no          | In berries                                         |
| `age`               | no           | yes                          | no          |                                                    |
| `height`            | no           | yes                          | no          | In cm                                              |
| `weight`            | no           | yes                          | no          | In kg (often unspecified)                          |
| `birthday`          | no           | no                           | no          | MM-DD format                                       |
| `blood_type`        | no           | no                           | no          | Enum `blood-types`: F/S/X/XF (One Piece system)    |
| `gender`            | no           | no                           | no          | Vocabulary `genders`                               |
| `weakness`          | `multi_enum` | `devil-fruit-drawback-kinds` |             |                                                    |
| `requires_haki`     | `multi_enum` | `haki-types`                 |             |                                                    |
| `awakening_outcome` | `enum`       | `awakening-outcomes`         |             |                                                    |
| `haki_types`        | no           | yes                          | no          | Multi-enum `haki-types`                            |
| `status`            | yes          | yes                          | no          | Vocabulary `character-statuses`                    |
| `birthplace`        | no           | no                           | no          | entity_ref to `location`                           |
| `description_key`   | no           | no                           | yes         | Short bio key                                      |

Allowed relations: `member-of`, `ate-fruit`, `uses-technique`,
`wields-weapon`, `family-of`, `ally-of`, `enemy-of`, `mentor-of`,
`mentored-by`, `bears-title`, `belongs-to-race`, `born-in`, `resides-in`,
`participated-in`, `depicted-by`.

---

#### `devil-fruit`

| Property                    | Required | Historical | Localizable | Notes                                    |
| --------------------------- | -------- | ---------- | ----------- | ---------------------------------------- |
| `name`                      | yes      | yes        | yes         | Common, true_name, etc.                  |
| `classification`            | yes      | yes        | no          | Vocabulary `devil-fruit-classifications` |
| `awakened`                  | no       | yes        | no          | Boolean                                  |
| `awakening_outcome`         | no       | yes        | no          | Vocabulary `awakening-outcomes`          |
| `weakness`                  | no       | yes        | no          | Multi — `devil-fruit-drawback-kinds`     |
| `abilities_description_key` | no       | yes        | yes         | Short description key                    |

Allowed relations: `eaten-by`, `held-by`, `interacts-with-fruit`,
`enables-technique`, `depicted-by`, `sourced-from`.

---

#### `crew`

| Property          | Required | Historical | Localizable | Notes                 |
| ----------------- | -------- | ---------- | ----------- | --------------------- |
| `name`            | yes      | yes        | yes         |                       |
| `founded_at`      | no       | no         | no          | source_ref            |
| `disbanded_at`    | no       | no         | no          | source_ref            |
| `jolly_roger`     | no       | yes        | no          | entity_ref to `image` |
| `description_key` | no       | no         | yes         |                       |

Allowed relations: `has-member`, `ally-of`, `enemy-of`, `based-in`,
`flies-flag`, `depicted-by`.

---

#### `organization`

| Property            | Required | Historical | Localizable | Notes                  |
| ------------------- | -------- | ---------- | ----------- | ---------------------- |
| `name`              | yes      | yes        | yes         |                        |
| `organization_type` | yes      | no         | no          | Vocabulary `org-types` |
| `founded_at`        | no       | no         | no          | source_ref             |
| `description_key`   | no       | no         | yes         |                        |

Allowed relations: `has-member`, `ally-of`, `enemy-of`, `based-in`,
`controls-territory`, `depicted-by`.

---

#### `location`

| Property           | Required | Historical | Localizable | Notes                          |
| ------------------ | -------- | ---------- | ----------- | ------------------------------ |
| `name`             | yes      | yes        | yes         |                                |
| `location_subtype` | yes      | no         | no          | Vocabulary `location-subtypes` |
| `region`           | no       | no         | no          | Vocabulary `location-regions`  |
| `location_status`  | no       | yes        | no          | Vocabulary `location-statuses` |
| `climate`          | no       | no         | yes         |                                |
| `population`       | no       | yes        | no          |                                |
| `log_pose_time`    | no       | no         | no          | Hours to set (Grand Line)      |
| `description_key`  | no       | no         | yes         |                                |

Allowed relations: `part-of-location`, `contains-location`,
`birthplace-of`, `home-of`, `ruled-by`, `depicted-by`.

---

#### `technique`

| Property          | Required | Historical | Localizable | Notes                        |
| ----------------- | -------- | ---------- | ----------- | ---------------------------- |
| `name`            | yes      | yes        | yes         |                              |
| `technique_type`  | yes      | no         | no          | Vocabulary `technique-types` |
| `is_secret`       | no       | yes        | no          | Boolean (e.g. Rokuōgan)      |
| `requires_haki`   | no       | no         | no          | Multi — `haki-types`         |
| `description_key` | no       | no         | yes         |                              |

Allowed relations: `used-by`, `enabled-by-fruit`, `derived-from`,
`variant-of`, `depicted-by`.

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
| `figurehead`      | no       | no         | no          | Freeform descriptor     |
| `built_at`        | no       | no         | no          | source_ref              |
| `destroyed_at`    | no       | no         | no          | source_ref              |
| `description_key` | no       | no         | yes         |                         |

Allowed relations: `crewed-by`, `flies-flag`,
`replaced-by`, `replaces`, `depicted-by`.

---

#### `race`

| Property                | Required | Historical | Localizable | Notes                               |
| ----------------------- | -------- | ---------- | ----------- | ----------------------------------- |
| `name`                  | yes      | yes        | yes         |                                     |
| `description_key`       | no       | no         | yes         |                                     |
| `lifespan`              | no       | no         | no          | Average                             |
| `average_height`        | no       | no         | no          |                                     |
| `slave_price`           | no       | yes        | no          | Berry — recurring quantified field  |
| `danger_classification` | no       | no         | no          | Vocabulary `danger-classifications` |

Allowed relations: `has-member-race`, `hybrid-of`, `originates-from`,
`depicted-by`.

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

Allowed relations: `embodied-by`, `depicted-by`. (Concept→source
appearances are `features`' generated inverse.)

---

#### `manga-chapter`

| Property          | Required | Historical | Localizable | Notes                         |
| ----------------- | -------- | ---------- | ----------- | ----------------------------- |
| `number`          | yes      | no         | no          |                               |
| `title_key`       | yes      | no         | yes         | Japanese title + translations |
| `released_at`     | yes      | no         | no          | ISO date; `territory: jp`     |
| `page_count`      | no       | no         | no          |                               |
| `is_color_spread` | no       | no         | no          | Opens on a color spread       |
| `canon_scope`     | yes      | no         | no          | Always `manga`                |
| `cover_image`     | no       | no         | no          | entity_ref to `image`         |

Allowed relations: `features`, `part-of-arc`, `part-of-volume`,
`has-cover-story`, `adapted-by`, `available-on`, `depicted-by`.

---

#### `anime-episode`

| Property          | Required | Historical | Localizable | Notes                     |
| ----------------- | -------- | ---------- | ----------- | ------------------------- |
| `number`          | yes      | no         | no          |                           |
| `title_key`       | yes      | no         | yes         |                           |
| `released_at`     | no       | no         | no          | ISO date; `territory: jp` |
| `runtime_minutes` | no       | no         | no          |                           |
| `canon_scope`     | yes      | no         | no          | `anime` or `anime_filler` |

Allowed relations: `features`, `adapts`, `part-of-arc`, `depicted-by`.

---

#### `film`

| Property          | Required | Historical | Localizable | Notes                            |
| ----------------- | -------- | ---------- | ----------- | -------------------------------- |
| `title_key`       | yes      | no         | yes         |                                  |
| `released_at`     | yes      | no         | no          | ISO date; `territory: jp`        |
| `runtime_minutes` | yes      | no         | no          |                                  |
| `canon_scope`     | yes      | no         | no          | `film_canon` or `film_non_canon` |
| `oda_supervised`  | no       | no         | no          | Boolean                          |
| `film_number`     | no       | no         | no          | Series ordinal                   |

Allowed relations: `features`, `staffed-by`, `produced-by`, `available-on`,
`depicted-by`. (Direction via `staffed-by` `role: film_director`.)

---

#### `sbs`

| Property      | Required | Historical | Localizable | Notes           |
| ------------- | -------- | ---------- | ----------- | --------------- |
| `released_at` | yes      | no         | no          | `territory: jp` |
| `canon_scope` | yes      | no         | no          | Always `sbs`    |

Allowed relations: `features`, `clarifies-fact`, `part-of-volume`.

---

#### `sbs-qa`

| Property         | Required | Historical | Localizable | Notes                  |
| ---------------- | -------- | ---------- | ----------- | ---------------------- |
| `question_key`   | yes      | no         | yes         | i18n key               |
| `answer_key`     | yes      | no         | yes         | i18n key               |
| `asker_pen_name` | no       | no         | no          | Reader's printed P.N.  |
| `page`           | no       | no         | no          | Page in the volume     |
| `canon_scope`    | yes      | no         | no          | Typically `semi_canon` |

Allowed relations: `qa-of`, `features`, `clarifies-fact`.

---

#### `databook`

| Property           | Required | Historical | Localizable | Notes                           |
| ------------------ | -------- | ---------- | ----------- | ------------------------------- |
| `name`             | yes      | yes        | yes         | "Vivre Card", "Yellow Magazine" |
| `released_at`      | yes      | no         | no          | `territory: jp`                 |
| `canon_scope`      | yes      | no         | no          | Always `databook`               |
| `databook_subtype` | yes      | no         | no          | Vocabulary `databook-subtypes`  |

Allowed relations: `features`, `clarifies-fact`.

---

#### `arc`

| Property        | Required | Historical | Localizable | Notes                        |
| --------------- | -------- | ---------- | ----------- | ---------------------------- |
| `name`          | yes      | yes        | yes         | "Wano Country", "Marineford" |
| `arc_number`    | no       | no         | no          | Global arc ordinal           |
| `arc_subtype`   | yes      | no         | no          | Vocabulary `arc-subtypes`    |
| `narrative_key` | no       | no         | yes         | Arc summary key              |
| `chapter_range` | no       | no         | no          | { first, last } source_refs  |

Allowed relations: `part-of-saga`, `features`, `set-in`, `depicted-by`.
(Arc→chapter/episode is `part-of-arc`'s inferred inverse; arc→event is
`occurs-during-arc`'s. ADR-105 folded `features-characters` into
`features`: an arc→character edge now exists to carry `role`, presence
being implied by the arc's chapter/episode edges.)

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

| Property        | Required | Historical | Localizable | Notes                         |
| --------------- | -------- | ---------- | ----------- | ----------------------------- |
| `event_subtype` | yes      | no         | no          | Vocabulary `event-subtypes`   |
| `narrative_key` | no       | no         | yes         |                               |
| `first_source`  | yes      | no         | no          | source_ref                    |
| `last_source`   | no       | no         | no          | source_ref                    |
| `is_public`     | no       | no         | no          | Boolean — affects propagation |

Allowed relations: `participant`,
`occurs-during-arc`, `caused-by-event`, `causes-event`, `part-of-event`,
`set-in`, `depicted-by`.

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

#### `person` (real-world)

| Property       | Required | Historical | Localizable | Notes                     |
| -------------- | -------- | ---------- | ----------- | ------------------------- |
| `name`         | yes      | yes        | yes         | Actor / staff name        |
| `person_roles` | no       | no         | no          | Multi-enum `person-roles` |

Allowed relations: `depicted-by`. Inbound: `voices`, `portrays` (from
`character` via `voiced-by` / `portrayed-by`).

---

#### `material`

| Property                 | Required | Historical | Localizable | Notes                          |
| ------------------------ | -------- | ---------- | ----------- | ------------------------------ |
| `name`                   | yes      | yes        | yes         |                                |
| `material_subtype`       | yes      | no         | no          | Vocabulary `material-subtypes` |
| `nullifies_devil_fruits` | no       | no         | no          | Boolean — `true` for Seastone  |
| `description_key`        | no       | no         | yes         |                                |

Allowed relations: `depicted-by`. Inbound: `material-of` (from `ship` /
`weapon` via `made-of`).

---

## 3. Property types (104)

Property types are reusable across entity types. The list below groups
them by domain. Each has a value_type (section 7), constraints, optional
unit, and qualifier policy (section 6).

### 3.1 Identity & naming

| Property          | Value type | Constraints                  | Vocabulary                |
| ----------------- | ---------- | ---------------------------- | ------------------------- |
| `name`            | `i18n_key` | name_type qualifier required | `name-types`              |
| `epithet`         | `i18n_key` | given_by qualifier optional  | —                         |
| `description_key` | `i18n_key` | —                            | —                         |
| `caption_key`     | `i18n_key` | —                            | —                         |
| `alt_text_key`    | `i18n_key` | required for `image`         | —                         |
| `narrative_key`   | `i18n_key` | —                            | —                         |
| `title_key`       | `i18n_key` | —                            | —                         |
| `question_key`    | `i18n_key` | sbs-qa                       | —                         |
| `answer_key`      | `i18n_key` | sbs-qa                       | —                         |
| `reference_kind`  | `enum`     | required for `reference`     | reference-kinds (ADR-093) |
| `accessed_at`     | `date`     | reference                    | — (ADR-093)               |
| `document_kind`   | `enum`     | required for `document`      | document-kinds (ADR-094)  |

### 3.2 Numeric properties

| Property          | Value type | Unit  | Constraints           |
| ----------------- | ---------- | ----- | --------------------- |
| `bounty`          | `number`   | berry | min:0, step:1_000_000 |
| `age`             | `number`   | year  | min:0                 |
| `height`          | `number`   | cm    | min:0                 |
| `weight`          | `number`   | kg    | min:0                 |
| `population`      | `number`   | —     | min:0                 |
| `number`          | `number`   | —     | min:0                 |
| `page_count`      | `number`   | —     | min:1                 |
| `page`            | `number`   | —     | min:1 (sbs-qa locus)  |
| `slave_price`     | `number`   | berry | min:0, historised     |
| `log_pose_time`   | `number`   | hour  | min:0                 |
| `runtime_minutes` | `number`   | min   | min:0                 |
| `saga_number`     | `number`   | —     | min:1                 |
| `arc_number`      | `number`   | —     | min:1                 |
| `film_number`     | `number`   | —     | min:1 (film ordinal)  |
| `season_number`   | `number`   | —     | min:1 (live-action)   |
| `width`           | `number`   | px    | min:0                 |
| `height` (image)  | `number`   | px    | min:0                 |
| `crew_capacity`   | `number`   | —     | min:0                 |
| `lifespan`        | `number`   | year  | (race average)        |
| `average_height`  | `number`   | cm    | (race average)        |

### 3.3 Dates and temporal references

| Property        | Value type   | Notes                                                                              |
| --------------- | ------------ | ---------------------------------------------------------------------------------- |
| `birthday`      | `date`       | MM-DD only (no year for characters)                                                |
| `released_at`   | `date`       | Unified release date; `territory` qualifier (enum `release-territories`) — ADR-067 |
| `founded_at`    | `source_ref` | When in-fiction the founding occurred                                              |
| `disbanded_at`  | `source_ref` | When in-fiction disbanded                                                          |
| `built_at`      | `source_ref` | Ship                                                                               |
| `destroyed_at`  | `source_ref` | Ship                                                                               |
| `spoiler_since` | `source_ref` | Image safety threshold                                                             |
| `first_source`  | `source_ref` | Event span start                                                                   |
| `last_source`   | `source_ref` | Event span end                                                                     |

### 3.4 Categorical (enum-backed)

| Property                | Value type   | Vocabulary                    |
| ----------------------- | ------------ | ----------------------------- |
| `status`                | `enum`       | `character-statuses`          |
| `gender`                | `enum`       | `genders`                     |
| `classification` (DF)   | `enum`       | `devil-fruit-classifications` |
| `location_subtype`      | `enum`       | `location-subtypes`           |
| `region`                | `enum`       | `location-regions`            |
| `location_status`       | `enum`       | `location-statuses`           |
| `danger_classification` | `enum`       | `danger-classifications`      |
| `material_subtype`      | `enum`       | `material-subtypes`           |
| `technique_type`        | `enum`       | `technique-types`             |
| `weapon_type`           | `enum`       | `weapon-types`                |
| `weapon_grade`          | `enum`       | `weapon-grades`               |
| `ship_type`             | `enum`       | `ship-types`                  |
| `organization_type`     | `enum`       | `org-types`                   |
| `arc_subtype`           | `enum`       | `arc-subtypes`                |
| `event_subtype`         | `enum`       | `event-subtypes`              |
| `concept_subtype`       | `enum`       | `concept-subtypes`            |
| `canon_scope`           | `enum`       | `canon-scopes`                |
| `databook_subtype`      | `enum`       | `databook-subtypes`           |
| `license`               | `enum`       | `image-licenses`              |
| `format`                | `enum`       | `image-formats`               |
| `haki_types`            | `multi_enum` | `haki-types`                  |
| `person_roles`          | `multi_enum` | `person-roles`                |
| `game_genre`            | `enum`       | `game-genres`                 |
| `game_platforms`        | `multi_enum` | `game-platforms`              |
| `special_kind`          | `enum`       | `special-kinds`               |
| `performance_kind`      | `enum`       | `performance-kinds`           |
| `merch_type`            | `enum`       | `merch-types`                 |

### 3.5 Boolean

| Property                 | Value type | Notes                                   |
| ------------------------ | ---------- | --------------------------------------- |
| `awakened`               | `boolean`  | Devil Fruit                             |
| `oda_supervised`         | `boolean`  | Film                                    |
| `is_public`              | `boolean`  | Event — controls knowledge propagation  |
| `single_holder`          | `boolean`  | Title                                   |
| `nullifies_devil_fruits` | `boolean`  | Material — `true` for Seastone          |
| `anime_original`         | `boolean`  | Anime-episode — filler / anime-only     |
| `is_color_spread`        | `boolean`  | Manga-chapter — opens on a color spread |
| `is_secret`              | `boolean`  | Technique — secret / unrevealed variant |

### 3.6 References

| Property         | Value type | Target type      |
| ---------------- | ---------- | ---------------- |
| `url`            | `string`   | (R2 URL)         |
| `attribution`    | `string`   | —                |
| `source_origin`  | `string`   | —                |
| `asker_pen_name` | `string`   | — (sbs-qa)       |
| `climate`        | `string`   | —                |
| `blood_type`     | `string`   | A, B, AB, O, +/− |

---

## 4. Relation types (64)

Relations are typed, directed links between entities. The build pipeline
generates inverses automatically when `inverse_inferred: true`.

### 4.1 Group affiliation

| Type              | From                                | To                     | Inverse           | Qualifiers                                                      |
| ----------------- | ----------------------------------- | ---------------------- | ----------------- | --------------------------------------------------------------- |
| `member-of`       | `character`                         | `crew`, `organization` | `(inferred)`      | role, since, until, loyalty_status, departure_reason, held_rank |
| `ally-of`         | `character`, `crew`, `organization` | (same)                 | (symmetric)       | since, until                                                    |
| `enemy-of`        | `character`, `crew`, `organization` | (same)                 | (symmetric)       | since, until, intensity                                         |
| `subordinate-to`  | `crew`, `organization`              | `crew`, `organization` | `has-subordinate` | since, until                                                    |
| `member-state-of` | `location`                          | `organization`         | `member-states`   | since, until, membership_status                                 |

(ADR-099 removed `led-by`: leadership is a membership function —
`member-of{role: leader|captain}`; both `loyalty_status` and
`membership_status` now share the merged `membership-statuses`
vocabulary, § 5.53.)

### 4.2 Powers & abilities

| Type               | From        | To            | Inverse             | Qualifiers              |
| ------------------ | ----------- | ------------- | ------------------- | ----------------------- |
| `ate-fruit`        | `character` | `devil-fruit` | `eaten-by`          | since, epistemic_status |
| `uses-technique`   | `character` | `technique`   | `used-by`           | since, mastery_level    |
| `enabled-by-fruit` | `technique` | `devil-fruit` | `enables-technique` | —                       |
| `wields-weapon`    | `character` | `weapon`      | `wielded-by`        | since, until            |
| `forged-by`        | `weapon`    | `character`   | `forged-weapon`     | —                       |

### 4.3 Relationships

| Type        | From        | To          | Inverse           | Qualifiers                          |
| ----------- | ----------- | ----------- | ----------------- | ----------------------------------- |
| `family-of` | `character` | `character` | (symmetric/typed) | relation_kind, known_publicly_since |
| `mentor-of` | `character` | `character` | `mentored-by`     | since, until                        |
| `friend-of` | `character` | `character` | (symmetric)       | since                               |
| `rival-of`  | `character` | `character` | (symmetric)       | since                               |

### 4.4 Race & origin

| Type              | From        | To         | Inverse           | Qualifiers   |
| ----------------- | ----------- | ---------- | ----------------- | ------------ |
| `belongs-to-race` | `character` | `race`     | `has-member-race` | —            |
| `hybrid-of`       | `race`      | `race`     | `has-hybrid`      | —            |
| `born-in`         | `character` | `location` | `birthplace-of`   | —            |
| `resides-in`      | `character` | `location` | `home-of`         | since, until |
| `originates-from` | `race`      | `location` | `origin-of-race`  | —            |

### 4.5 Geographic

| Type                 | From                   | To          | Inverse               | Qualifiers   |
| -------------------- | ---------------------- | ----------- | --------------------- | ------------ |
| `part-of-location`   | `location`             | `location`  | `contains-location`   | —            |
| `based-in`           | `crew`, `organization` | `location`  | `houses-organization` | since        |
| `controls-territory` | `organization`, `crew` | `location`  | `controlled-by`       | since, until |
| `set-in`             | `event`, `arc`         | `location`  | `setting-of`          | —            |
| `ruled-by`           | `location`             | `character` | `rules`               | since, until |

### 4.6 Titles & inheritance

| Type          | From        | To                          | Inverse        | Qualifiers                     |
| ------------- | ----------- | --------------------------- | -------------- | ------------------------------ |
| `bears-title` | `character` | `title`                     | `borne-by`     | since, until, epistemic_status |
| `granted-by`  | `title`     | `character`, `organization` | `grants-title` | —                              |

### 4.7 Ship-related

| Type         | From           | To      | Inverse       | Qualifiers   |
| ------------ | -------------- | ------- | ------------- | ------------ |
| `crewed-by`  | `ship`         | `crew`  | `sails`       | since, until |
| `flies-flag` | `ship`, `crew` | `image` | `flag-of`     | since        |
| `replaces`   | `ship`         | `ship`  | `replaced-by` | since        |

(ADR-099 removed `captains`: ship↔people routes through the crew —
`crewed-by` + incoming `member-of` roles.)

### 4.8 Source ↔ entity

| Type             | From                        | To         | Inverse                | Qualifiers                                                                                                                                                               |
| ---------------- | --------------------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features`       | source types + `arc`        | any entity | `featured-in` _(gen.)_ | appearance_type (optional — shown _or_ evoked), role (optional, `narrative-roles`); absorbs former `references`/`mentions` (ADR-069) and `features-characters` (ADR-105) |
| `clarifies-fact` | `sbs`, `sbs-qa`, `databook` | any entity | `clarified-in`         | property_name                                                                                                                                                            |

(ADR-099 removed `introduces-character`: first appearance is DERIVED
from the earliest `features` edge per character. ADR-105 removed
`features-characters`: granularity is carried by the SOURCE TYPE of a
`features` edge — chapter/episode/film = presence in that unit, `arc` =
the character's narrative `role` in the arc.)

### 4.9 Source ↔ source (adaptation)

| Type         | From            | To              | Inverse  | Qualifiers |
| ------------ | --------------- | --------------- | -------- | ---------- |
| `adapted-by` | `manga-chapter` | `anime-episode` | `adapts` | coverage   |

### 4.10 Narrative structure

| Type                | From                             | To                   | Inverse          | Qualifiers         |
| ------------------- | -------------------------------- | -------------------- | ---------------- | ------------------ |
| `part-of-arc`       | `manga-chapter`, `anime-episode` | `arc`                | `(inferred)`     | —                  |
| `part-of-volume`    | `manga-chapter`, `sbs`           | `volume`             | `collects`       | since              |
| `qa-of`             | `sbs-qa`                         | `sbs`                | `has-qa`         | —                  |
| `has-cover-story`   | `manga-chapter`                  | `arc`                | `cover-story-in` | installment_number |
| `part-of-series`    | `live-action-episode`            | `live-action-series` | `(inferred)`     | since              |
| `part-of-saga`      | `arc`                            | `saga`               | `contains-arc`   | —                  |
| `occurs-during-arc` | `event`                          | `arc`                | `contains-event` | —                  |

### 4.11 Events

| Type              | From    | To                                  | Inverse           | Qualifiers                          |
| ----------------- | ------- | ----------------------------------- | ----------------- | ----------------------------------- |
| `participant`     | `event` | `character`, `crew`, `organization` | `participated-in` | side, role, outcome, notable_action |
| `caused-by-event` | `event` | `event`                             | `causes-event`    | —                                   |
| `part-of-event`   | `event` | `event`                             | `has-phase`       | phase_order                         |

### 4.12 Concept embodiment

| Type          | From      | To          | Inverse    | Qualifiers              |
| ------------- | --------- | ----------- | ---------- | ----------------------- |
| `embodied-by` | `concept` | `character` | `embodies` | since, epistemic_status |

### 4.13 Images

| Type           | From                | To           | Inverse         | Qualifiers                   |
| -------------- | ------------------- | ------------ | --------------- | ---------------------------- |
| `depicted-by`  | (most entity types) | `image`      | `depicts`       | role, period, context, since |
| `sourced-from` | `image`             | source types | `sources-image` | —                            |

### 4.14 Documents (ADR-094)

| Type        | From       | To                                | Inverse  | Qualifiers   |
| ----------- | ---------- | --------------------------------- | -------- | ------------ |
| `issued-by` | `document` | `organization`/`crew`/`character` | `Issued` | since, until |

`profiles`, `held-by` and `depicted-by` accept `document` as source since ADR-094.

### 4.14 Cast & staff (real-world)

| Type           | From                                  | To        | Inverse     | Qualifiers                           |
| -------------- | ------------------------------------- | --------- | ----------- | ------------------------------------ |
| `voiced-by`    | `character`                           | `person`  | `voices`    | since, language, dub_studio, context |
| `portrayed-by` | `character`                           | `person`  | `portrays`  | since, production, context           |
| `staffed-by`   | `anime-episode`, `film`, `theme-song` | `person`  | `worked-on` | role, since, note                    |
| `produced-by`  | `anime-episode`, `film`               | `company` | `produced`  | role, since, note                    |

### 4.15 Materials

| Type      | From             | To         | Inverse       | Qualifiers       |
| --------- | ---------------- | ---------- | ------------- | ---------------- |
| `made-of` | `ship`, `weapon` | `material` | `material-of` | since, component |

### 4.16 Theme songs

| Type       | From         | To                                                   | Inverse     | Qualifiers                                                          |
| ---------- | ------------ | ---------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `theme-of` | `theme-song` | `anime-episode`, `film`, `arc`, `live-action-series` | `has-theme` | usage, sequence, episode_from, episode_to, broadcast_version, since |

### 4.17 Availability (where to watch / read)

| Type           | From                                     | To                   | Inverse | Qualifiers                                                                        |
| -------------- | ---------------------------------------- | -------------------- | ------- | --------------------------------------------------------------------------------- |
| `available-on` | `anime-episode`, `manga-chapter`, `film` | `streaming-platform` | `hosts` | url, region, requires_subscription, subtitle_langs, dub_langs, verified_at, since |

### 4.18 Databook cards

| Type       | From            | To                                 | Inverse       | Qualifiers |
| ---------- | --------------- | ---------------------------------- | ------------- | ---------- |
| `profiles` | `databook-card` | `character`, `devil-fruit`, `ship` | `profiled-by` | since      |
| `card-of`  | `databook-card` | `databook`                         | `has-card`    | —          |

---

## 5. Vocabularies / Enums (64)

Each vocabulary lives in `/data/schemas/vocabulary/<id>.json`. All
values have localized labels (EN, FR at minimum).

### 5.1 `epistemic-statuses`

`true`, `confirmed`, `believed_by_world`, `believed_by_characters`,
`revealed_to_reader`, `rumored`, `implied`, `retconned`, `disputed`

### 5.2 `review-statuses`

`reviewed`, `not_reviewed`, `flagged`, `auto_imported`

### 5.3 `canon-scopes`

`manga`, `anime`, `anime_filler`, `film_canon`, `film_non_canon`,
`sbs`, `databook`, `semi_canon`, `live_action`, `crossover`,
`video_game`, `stage`

### 5.4 `name-types`

`common`, `full_name`, `true_name`, `nickname`, `alias`,
`codename`, `insult`, `honorific`, `mistranslation`,
`native_script`, `romanized`, `literal_meaning`
(`epithet` and `title` were removed by ADR-098 — the dedicated
`epithet` property and the `bears-title` relation are the homes)

### 5.5 `appearance-types`

`full`, `silhouette`, `partial`, `mentioned`, `flashback`,
`cover_story`, `recap`, `vision`, `photograph`, `portrait`, `corpse`,
`imagined`, `revelation`, `wanted_poster`, `eyecatcher`
(the manner on a `features` edge — shown or, for `mentioned`, evoked)

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

`captain`, `leader`, `first_mate`, `vice_captain`, `navigator`, `cook`,
`doctor`, `archaeologist`, `shipwright`, `musician`, `sniper`,
`helmsman`, `apprentice`, `cabin_boy`, `combatant`, `tactician`
(`leader` added by ADR-099 — `member-of{role: leader}` is the single
home for who leads any group, replacing the removed `led-by`)

### 5.11 `loyalty-statuses` — REMOVED (ADR-099)

Merged into `membership-statuses` (§ 5.53), now shared by
`member-of.loyalty_status` and `member-state-of.membership_status`.
(Section number kept to avoid renumbering; the vocabulary count above
excludes it.)

### 5.12 `org-types`

`marine`, `world_government_branch`, `cipher_pol`, `revolutionary`,
`secret_society`, `royal_court`, `merchant_guild`, `religious_order`,
`unknown` (ADR-109: `organization_type` is required and the Fandom
Organization Box carries no type field)

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
`cutlass`, `saber`, `exotic`, `unknown` (ADR-109: `weapon_type` is
required and Fandom's Weapon Box `type` is prose)

### 5.16 `weapon-grades`

`saijo_o_wazamono`, `o_wazamono`, `ryo_wazamono`, `wazamono`, `unranked`
(the Meitō tiers, ADR-040; `cursed` and black-blade are now orthogonal
boolean properties `is_cursed` / `is_black_blade`, not grades)

### 5.17 `ship-types`

`caravel`, `galleon`, `sloop`, `frigate`, `marine_warship`, `submarine`,
`flying_ship`, `mini_ship`, `pirate_ship`, `unknown` (ADR-109: `ship_type`
is required and the Fandom Ship Box carries no vessel class at all)

### 5.18 `arc-subtypes`

`introductory`, `training`, `exploration`, `war`, `mystery`,
`political`, `tournament`, `flashback`, `cover_story`, `filler`
(ADR-109: the Arc Box `type` field's two observed values are `Cover`
and `Filler`)

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

### 5.26 `person-roles`

`voice_actor`, `dub_actor`, `live_action_actor`, `series_director`,
`episode_director`, `film_director`, `animation_director`, `storyboard`,
`art_director`, `screenwriter`, `character_designer`, `composer`,
`lyricist`, `arranger`, `producer`, `theme_performer`, `mangaka`

### 5.27 `dub-studios`

`toei`, `funimation`, `4kids`, `odex`, `netflix`

### 5.28 `marine-ranks`

`fleet_admiral`, `admiral`, `vice_admiral`, `rear_admiral`,
`commodore`, `captain`, `commander`, `lieutenant_commander`,
`lieutenant`, `lieutenant_junior_grade`, `ensign`, `warrant_officer`,
`chief_petty_officer`, `petty_officer`, `seaman`

### 5.29 `location-regions`

`east_blue`, `west_blue`, `north_blue`, `south_blue`, `grand_line`,
`paradise`, `new_world`, `calm_belt`, `red_line`

### 5.30 `location-statuses`

`active`, `destroyed`, `sunken`, `risen`, `undersea`, `frozen`,
`abandoned`, `occupied`

### 5.31 `material-subtypes`

`mineral`, `metal`, `alloy`, `wood`, `organic`, `synthetic`

### 5.32 `theme-song-usage`

`opening`, `ending`, `insert`, `image_song`

### 5.33 `platform-kinds`

`streaming`, `reader`, `store`

### 5.34 `company-roles`

`animation_studio`, `production_company`, `distributor`, `game_developer`,
`game_publisher`, `record_label`, `manufacturer`, `publisher`, `collaborator`

### 5.35 `card-kinds`

`character`, `extra`, `skill`, `ship`

### 5.36 `game-genres`

`action`, `action_adventure`, `fighting`, `hack_and_slash`,
`beat_em_up`, `rpg`, `action_rpg`, `adventure`, `strategy`, `card`,
`board`, `racing`, `party`, `rhythm`, `puzzle`, `mmo`, `other`

### 5.37 `game-platforms`

`game_boy_advance`, `nintendo_ds`, `nintendo_3ds`, `nintendo_switch`,
`nintendo_switch_2`, `gamecube`, `wii`, `wii_u`, `playstation`,
`playstation_2`, `playstation_3`, `playstation_4`, `playstation_5`,
`psp`, `ps_vita`, `xbox_360`, `xbox_one`, `xbox_series`, `pc`, `ios`,
`android`, `arcade`

### 5.38 `special-kinds`

`ova`, `tv_special`, `ona`

### 5.39 `performance-kinds`

`stage_play`, `musical`, `kabuki`, `live_attraction`, `premier_show`,
`concert`, `other`

### 5.40 `merch-types`

`figure`, `model_kit`, `plush`, `apparel`, `accessory`, `stationery`,
`homeware`, `food`, `trading_card`, `collectible`, `other`

### 5.41 `release-territories`

`jp`, `worldwide`, `north_america`, `europe`, `asia`, `other`
(qualifier values for `released_at` — ADR-067)

### 5.42 `adaptation-coverage`

`full`, `partial`, `summary`, `compressed`, `reordered`,
`filler_added`, `scene_added`, `scene_omitted`, `loose`

### 5.43 `album-kinds`

`movie_ost`, `tv_ost`, `compilation`, `character_song`, `image_song`,
`single`, `best`

### 5.44 `narrative-roles` (ex-`arc-roles`, ADR-105)

`protagonist`, `antagonist`, `deuteragonist`, `supporting`, `mentor`,
`ally`, `rival`, `villain`, `henchman`, `victim`, `narrator`, `cameo`,
`background`

### 5.45 `blood-types`

`F`, `S`, `X`, `XF` (the One Piece F/S/X/XF system, not the real-world ABO one)

### 5.46 `departure-reasons`

`declined`, `resigned`, `expelled`, `revoked`, `annulled`, `deceased`,
`mia`

### 5.47 `depiction-periods`

`infancy`, `childhood`, `adolescence`, `young_adulthood`, `adulthood`,
`elderly`, `pre_timeskip`, `post_timeskip`, `flashback`, `current`,
`transformed`, `alternate_form`

### 5.48 `during-periods`

`pre_story`, `void_century`, `rocks_era`, `ohara_incident`

### 5.49 `event-outcomes`

`victorious`, `defeated`, `survived`, `killed`, `captured`, `escaped`,
`rescued`, `wounded`, `withdrew`, `exiled`, `promoted`, `demoted`,
`awakened`, `revealed`, `transformed`, `joined`, `left`, `unresolved`

### 5.50 `event-roles`

`subject`, `combatant`, `commander`, `leader`, `supporter`, `rescuer`,
`target`, `victim`, `captive`, `witness`, `observer`, `antagonist`,
`mediator`, `ally`, `narrator`

### 5.51 `event-sides`

`marines`, `world_government`, `cipher_pol`, `pirates`, `shichibukai`,
`yonko`, `civilians`, `captive`, `neutral`, `other`

### 5.52 `family-relations`

`father`, `mother`, `son`, `daughter`, `brother`, `sister`,
`half_brother`, `half_sister`, `sworn_brother`, `sworn_sister`,
`adoptive_father`, `adoptive_mother`, `adopted_son`, `adopted_daughter`,
`step_father`, `step_mother`, `foster_parent`, `grandfather`,
`grandmother`, `grandson`, `granddaughter`, `uncle`, `aunt`, `nephew`,
`niece`, `cousin`, `spouse`, `partner`, `ancestor`, `descendant`

### 5.53 `membership-statuses`

`founder`, `member`, `honorary`, `observer`, `undercover`,
`former_member`, `defected`, `traitor`, `erased`
(ADR-099 merged `loyalty-statuses` in: one vocabulary for the state of
a membership, shared by `member-of.loyalty_status` and
`member-state-of.membership_status`; `founding_member` unified to
`founder`, `presumed_dead_member` dropped — that is the epistemic
model's job)

### 5.54 `occupations`

`pirate`, `marine`, `revolutionary`, `bounty_hunter`, `swordsman`,
`martial_artist`, `navigator`, `cook`, `doctor`, `scientist`,
`archaeologist`, `shipwright`, `musician`, `sniper`, `blacksmith`,
`merchant`, `noble`, `royalty`, `government_official`, `assassin`,
`mercenary`, `bandit`, `thief`, `slave`, `samurai`, `ninja`,
`gladiator`, `explorer`, `journalist`, `artist`

### 5.55 `publication-countries`

`jp`, `fr`, `us`, `uk`, `de`, `es`, `it`, `br`, `kr`, `cn`, `tw`,
`global`

### 5.56 `source-origins`

`manga_panel`, `manga_cover`, `manga_color_spread`, `anime_screenshot`,
`film_screenshot`, `databook`, `sbs`, `official_website`, `video_game`,
`live_action`, `fan_art`, `other`

### 5.57 `succession-reasons`

`transferred`, `relinquished`, `extracted`, `unknown`

### 5.58 `system-statuses`

`active`, `abolished`, `reformed`

### 5.59 `transformation-kinds`

`gear`, `zoan_form`, `sulong`, `awakening`, `other`

### 5.60 `danger-classifications`

`type_a`, `type_b`, `type_c` — World-Government race danger tiers (values
provisional `[V]`, to verify against canon before freeze).

### 5.61 `devil-fruit-drawback-kinds`

`seastone_water`, `elemental_inferiority`, `stamina_drain`, `lifespan_cost`,
`no_intangibility_extra_damage`, `range_bound`, `requires_contact`,
`requires_gesture`, `requires_knowledge` (`[V]` provisional)

### 5.62 `fruit-interaction-kinds`

`superior_to`, `inferior_to`, `mutual_cancellation`, `nullifies`, `immune_to`

### 5.63 `awakening-outcomes`

`successful`, `failed_berserk`, `partial`

---

### 5.64 `reference-kinds` (ADR-093)

interview · social_post · official_site · article · video · scan · fan_database · other

### 5.65 `document-kinds` (ADR-094, one-piece)

wanted_poster · vivre_card · newspaper · letter · map · photograph · flag · manuscript · other

## 6. Universal qualifiers

Available on every historisable property value. They are NOT declared
per-property; they are implicit. Since ADR-078 every base and common
qualifier is declared in the **qualifier-type registry**
(`/data/schemas/qualifier-types/*.json`, 28 entries: 8 `base` + 20
`common`) with localized labels/descriptions and picker metadata; the
dashboard derives its qualifier UI from the registry via
`/api/schemas` — nothing is hardcoded.

| Qualifier          | Value type                 | Default     | Meaning                                             |
| ------------------ | -------------------------- | ----------- | --------------------------------------------------- |
| `since`            | `source_ref`               | (required)  | When this value starts applying                     |
| `attested_by`      | `entity_ref[]` (reference) | —           | External reference(s) attesting the value (ADR-093) |
| `until`            | `source_ref`               | none        | When this value stops applying                      |
| `source`           | `source_ref`               | = since     | Source citing the value                             |
| `epistemic_status` | enum                       | `true`      | What kind of truth (see 5.1)                        |
| `actual_value`     | same as value              | none        | The real truth when value is a false belief         |
| `event`            | `entity_ref` (event)       | none        | The event that caused/revealed this value           |
| `believed_by`      | `entity_ref[]`             | none        | Specific characters who hold this belief            |
| `known_truth_by`   | `entity_ref[]`             | none        | Specific characters who know the actual truth       |
| `canon_scope`      | enum                       | from source | Override the source's canon scope                   |
| `in_universe_date` | `string`                   | none        | In-universe date when known                         |
| `assisted_by`      | `string`                   | none        | AI agent that generated this value                  |
| `review_status`    | enum                       | `reviewed`  | Human review state                                  |
| `note_key`         | `i18n_key`                 | none        | Localized explanatory note                          |
| `superseded_by`    | same as value              | none        | Replacement for retconned values                    |

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

`manga-chapter`, `anime-episode`, `film`, `video-game`,
`live-action-series`, `live-action-episode`, `anime-special`,
`live-performance`, `sbs`, `sbs-qa`, `databook`, `arc`

(The first eleven are units — the edge asserts presence in that exact
unit, and is what "appearances out of total chapters/episodes" counts.
`arc` is a container: its edges carry `role`, not presence — ADR-105.)

### 9.2 Entity types that can be `depicted-by` images

`character`, `devil-fruit`, `crew`, `organization`, `location`,
`technique`, `weapon`, `ship`, `race`, `title`, `concept`, `event`,
`arc`, `saga`, `manga-chapter`, `anime-episode`, `film`, `person`,
`material`, `theme-song`, `company`, `databook-card`, `transformation`,
`album`, `video-game`, `live-action-series`, `live-action-episode`,
`anime-special`, `live-performance`, `merchandise`, `volume`, `sbs-qa`

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

- **Entity types**: 38
- **Property types**: 104 (some shared across multiple entity types)
- **Relation types**: 63 (canonical declared; inverses are build-generated)
- **Vocabularies**: 64
- **Qualifier types**: 28 (8 base + 20 common — the ADR-078 registry)
- **Primitive value types**: 10
- **Universal qualifiers**: 14 (on property values) + 4 (on relations, ADR-037)
- **Source-type entities**: 5 (chapter, episode, film, sbs, databook)
- **Container entities**: 3 (arc, saga, event)
- **Things that depict / can be depicted**: 23 / 1 (image)

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
