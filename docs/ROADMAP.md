# Roadmap

This is the sequential build order for the project. Each phase produces
something runnable and testable. **Do not start phase N+1 until phase N is
demonstrably working and reviewed.**

Current phase is tracked at the top of this file. Update it as you progress.

> **Current phase**: 1 — Foundations (not started)

## Phase 1 — Foundations

**Goal**: a typed, validated data model with a handful of real entities,
and the tooling to validate them.

**Exit criteria**:
- The monorepo builds cleanly
- Schema files exist for the 5 core primitives
- ~10 entities exist as JSON and pass validation
- `bun run validate` and `bun run typecheck` pass
- All linting and formatting set up
- CI runs on every PR

### Tasks

1. **Monorepo setup**
   - Bun + Turborepo
   - Workspace structure as in `/docs/ARCHITECTURE.md`
   - `tsconfig.base.json` with strict settings
   - oxlint + oxfmt (or dprint) configured
   - lefthook with pre-commit and commit-msg hooks
   - commitlint with Conventional Commits config
   - GitHub Actions for CI: install, typecheck, lint, format-check, test

2. **`packages/schemas`**
   - Zod primitives: `EntityId`, `Slug`, `SourceRef`, `EntityRef`,
     `I18nKey`, `EpistemicStatus`, `CanonScope`
   - Zod schemas for the schema files themselves (meta-schemas):
     `EntityTypeSchema`, `PropertyTypeSchema`, `RelationTypeSchema`,
     `VocabularySchema`
   - Type exports for everything

3. **`packages/schema-engine`**
   - Schema loader: read all files in `/data/schemas/**`
   - Meta-validator: validate schemas against meta-schemas
   - Zod generator: emit typed Zod schemas into
     `packages/schemas/generated/`
   - Reference resolver: check every reference between schemas

4. **`packages/i18n`**
   - Locale type (`'en' | 'fr'`)
   - Key resolution utility
   - Zod error map for FR/EN

5. **Initial schema files**
   - Entity types: `character`, `devil-fruit`, `manga-chapter`,
     `event`, `arc`, `crew`
   - Property types: `name`, `epithet`, `bounty`, `status`,
     `classification`, `event_subtype`, `number`, `title_key`,
     `published_at_jp`
   - Relation types: `member-of`, `ate-fruit`, `features`,
     `participant`, `part-of-arc`, `caused-death-of`,
     `adapted-by`, `family-of`
   - Vocabularies: `crew-roles`, `epistemic-statuses`,
     `canon-scopes`, `name-types`, `appearance-types`,
     `event-subtypes`

6. **Initial entities**
   - Characters: Luffy, Zoro, Shanks, Ace, Sabo
   - Crews: Straw Hat Pirates
   - Devil Fruits: Gomu Gomu no Mi
   - Chapters: 1, 96, 432, 1043, 1044, 1053
   - Arc: East Blue, Marineford, Wano
   - Event: Battle of Marineford, Nika Reveal

7. **Validation pipeline**
   - `bun run schema:check` — meta-validate schemas
   - `bun run schema:generate` — emit Zod
   - `bun run validate` — validate all entity JSON
   - `bun run check:references` — resolve all references

8. **Documentation**
   - All docs in `/docs/` exist (this set + deep dives written as needed)
   - `/docs/DECISIONS.md` started

## Phase 2 — Build pipeline

**Goal**: turn JSON into a queryable SQLite, with derived fields computed.

**Exit criteria**:
- `bun run build:data` produces `dist/onepiece.db`
- The DB has tables for every entity type, plus relation tables
- Derived fields are computed: `first_appearance`,
  `last_appearance`, `current_value` per (entity, property,
  user_progress)
- A snapshot per arc-end is precomputed for fast spoiler filtering
- An SDK package can read entities by id and resolve their relations
- E2E test: parse JSON, build DB, query an entity, assert shape

### Tasks

1. **`packages/db-builder`**
   - Schema-driven table generation
   - Entity loader (one pass per type)
   - Reference resolver (graph traversal)
   - Derived computation engine
     - First/last appearance per entity
     - Current value of each property at each source checkpoint
     - Inverse relation generation
     - Cross-medium adaptation reachability
   - Inference engine (simple rules in phase 2; advanced later):
     - Public events reveal facts to all participants
     - Death events transitively update status
   - SQLite writer (`better-sqlite3`), denormalized for read
   - Pagefind static search index generation
   - Build manifest with build metadata

2. **`packages/sdk`**
   - Read-only SQLite client
   - Typed query helpers: `getEntity(id)`, `getByType(type)`,
     `getRelations(entityId, direction?)`
   - Spoiler filter: given user progression, return only facts the user has
     reached
   - Locale-aware resolvers for `i18n_key` properties

3. **Tests**
   - Unit tests on derived computation
   - Integration test: full build of a fixture, query, assertions

## Phase 3 — Preview app

**Goal**: a minimal reading app that proves the data model end-to-end and
acts as a development sandbox for the dashboard.

**Exit criteria**:
- `apps/preview` runs locally and on Vercel
- Route `/preview/[type]/[slug]` displays an entity with all its data
- A user-progression input (chapter number) filters spoilers
- A locale switcher swaps EN/FR labels
- Search via Pagefind works for entity names

### Tasks

1. **`apps/preview`**
   - TanStack Start setup
   - Read SQLite via server function (or build-time data injection)
   - Routes:
     - `/preview` — type listing
     - `/preview/[type]` — entity listing of that type
     - `/preview/[type]/[slug]` — entity detail
   - Spoiler progression UI (in-page input or local-storage persisted)
   - Locale switcher
   - Pagefind integration

2. **`packages/ui`**
   - Base UI + Tailwind theme primitives
   - Layout primitives: `Page`, `Header`, `Content`
   - Data display: `PropertyHistory`, `RelationList`,
     `AppearanceTimeline`
   - All typed and tested

3. **Validation of model**
   - Walk through real cases: Gomu Gomu reveal, Sabo presumed death,
     Luffy bounty history
   - If the model breaks, **stop**, fix the data model in
     `/docs/DATA_MODEL.md`, then propagate

## Phase 4 — Dashboard (admin-only)

**Goal**: edit data through forms generated from schemas, submit changes as
GitHub PRs.

**Exit criteria**:
- `apps/dashboard` runs locally and on Vercel
- Admin authenticates via GitHub OAuth (App)
- Lists entities, creates entities, edits entities
- Forms are 100% schema-driven; no per-type form code
- Submitting an edit opens a PR on the data repo
- Drafts persist in IndexedDB
- Optimistic locking via file SHA prevents lost updates

### Tasks

1. **Auth (admin-only)**
   - GitHub App credentials
   - Server-side session
   - Phase 1 limitation: a single env var lists admin GitHub usernames

2. **`packages/github-client`**
   - Octokit-based wrapper
   - `getFile`, `writeFile`, `createBranch`, `openPR`
   - SHA-based lock helpers
   - Rate-limit-aware

3. **`apps/dashboard`**
   - TanStack Start setup
   - Server functions for read (delegates to SDK) and write (delegates to
     github-client)
   - Routes:
     - `/dashboard` — home
     - `/dashboard/[type]` — entity list
     - `/dashboard/[type]/[id]/edit` — entity form
     - `/dashboard/[type]/new` — new entity form
   - Form generator that consumes a schema and produces a form tree

4. **Value-input components**
   - `StringInput`, `NumberInput`, `EnumInput`, `MultiEnumInput`,
     `DateInput`, `BooleanInput`
   - `EntityRefInput` (autocomplete on existing entities, filtered by type)
   - `SourceRefInput` (specialized autocomplete on chapters/episodes/films)
   - `I18nKeyInput` (paired with translation editor)
   - `MarkdownInput` (narrative editor)
   - All composable via the `value_type` of the property schema

5. **Historical value editor**
   - Add/remove/reorder historical entries on a property
   - Each entry has its own form for value + qualifiers
   - Inline timeline visualization

6. **Relation editor**
   - Add/remove relations
   - Per-relation qualifier form (driven by relation type schema)

7. **Drafts**
   - IndexedDB store
   - Auto-save on every change
   - Restore on entity reopen
   - Manual "submit" creates PR

## Phase 5 — Referential and schema management

**Goal**: edit vocabularies and (with care) schema files from the
dashboard.

**Exit criteria**:
- Add a new vocabulary value via the dashboard (safe, additive)
- Add a new property to an existing entity type via the dashboard, with
  impact analysis and migration generation
- Add a new entity type via the dashboard
- All changes produce PRs with appropriate labels

### Tasks

1. **Vocabulary editor**
   - Form-based add/edit/disable
   - Always opens a PR labeled `vocabulary`

2. **Property type editor**
   - Add a new property type
   - Add an existing property type to an entity type
   - Impact analysis: how many entities would be affected
   - Migration skeleton generation if breaking

3. **Entity type editor (admin-only)**
   - Create a new entity type
   - Tightly gated; produces a PR labeled `schema-breaking`
   - Requires ≥2 admin reviews to merge

4. **Migration runner**
   - `bun run migrate <n>` runs a numbered migration on `/data/universes/**`
   - Migrations are reversible where possible
   - CI fails if migrations leave the data in an invalid state

## Phase 6 — Public web app

**Goal**: the actual wiki: SEO-optimized, fast, beautiful.

**Exit criteria**:
- `apps/web` (or replaces `apps/preview`) serves the public-facing wiki
- SSG or ISR for all entity pages
- Locale routes (`/en/...`, `/fr/...`)
- Hreflang, JSON-LD, OG images
- Progression UI persists in URL-shareable state
- Search with facets

### Tasks

1. **Design system finalization**
2. **SEO infrastructure**
   - Sitemap by entity type
   - JSON-LD per page
   - OG image generation (Satori)
   - Canonical URL strategy
3. **Progression UX**
   - Onboarding flow ("where are you in the story?")
   - URL-shareable progression
4. **Search**
   - Facet by type, arc, canon scope
5. **Performance pass**
   - Critical CSS
   - Image optimization via Cloudflare
   - JS payload audit

## Phase 7 — Community opening

**Goal**: open editing to non-admin contributors.

**Exit criteria**:
- GitHub OAuth login for any user
- Submission UX guides users through the form
- Moderation queue
- Contributor attribution

This phase is intentionally deferred until data quality is high and the
schema is stable, to avoid spam and corruption during the formative period.

## Phase 8+ — Beyond

Areas under consideration but not scheduled:

- **Knowledge graph** (per-character knowledge of facts)
- **Mystery / theory** entity types
- **Visualization tools** (timelines, relationship graphs, bounty charts)
- **Public API** (REST or GraphQL) for third-party consumers
- **Cross-universe** (Naruto, Bleach, …)
- **Mobile apps**

## Anti-patterns by phase

In each phase, refuse the temptation to:

- **Phase 1**: skip docs to "go fast". The whole project rests on the docs.
- **Phase 2**: store anything outside the SQLite that the read path needs at
  runtime.
- **Phase 3**: design the public app UI. It's a sandbox; ugly is fine.
- **Phase 4**: write per-type form code. If you find yourself special-casing
  `character`, stop and refactor.
- **Phase 5**: enable schema editing without impact analysis.
- **Phase 6**: optimize before measuring.
- **Phase 7**: open community contribution before moderation is in place.

## Definition of "phase complete"

A phase is complete when:

1. All tasks listed above are done
2. Exit criteria are demonstrably met (recorded in a short demo or doc
   update)
3. CI is green
4. The relevant `/docs/*.md` are updated
5. `/docs/DECISIONS.md` reflects any deviations from this roadmap
6. A retrospective note is added at the bottom of this file
