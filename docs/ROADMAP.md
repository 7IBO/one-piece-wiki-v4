# Roadmap

This is the sequential build order for the project. Each phase produces
something runnable and testable. **Do not start phase N+1 until phase N is
demonstrably working and reviewed.**

Current phase is tracked at the top of this file. Update it as you progress.

> **Current phase**: 4.3 — Contribution surface expansion (entity creation + apparitions hub + mobile triage). 4.2 shipped end-to-end (admin PR flow verified on prod).

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
     `event`, `arc`, `crew`, `image`
   - Property types: `name`, `epithet`, `bounty`, `status`,
     `classification`, `event_subtype`, `number`, `title_key`,
     `published_at_jp`, `url`, `caption_key`, `license`,
     `attribution`, `source_origin`, `width`, `height`, `format`,
     `spoiler_since`, `alt_text_key`
   - Relation types: `member-of`, `ate-fruit`, `features`,
     `participant`, `part-of-arc`, `caused-death-of`,
     `adapted-by`, `family-of`, `depicted-by`, `sourced-from`
   - Vocabularies: `crew-roles`, `epistemic-statuses`,
     `canon-scopes`, `name-types`, `appearance-types`,
     `event-subtypes`, `review-statuses`, `image-licenses`,
     `depiction-roles`, `image-formats`
   - Note: `assisted_by` and `review_status` are **universal base
     qualifiers** (see `/docs/SCHEMA_SPEC.md` § "Base qualifiers" and
     `/docs/DATA_MODEL.md` § "Provenance and review status"). They are
     declared once at the schema-engine level — no per-property-type or
     per-relation-type work is required to enable them on every value.

6. **Initial entities**
   - Characters: Luffy, Zoro, Shanks, Ace, Sabo
   - Crews: Straw Hat Pirates
   - Devil Fruits: Gomu Gomu no Mi
   - Chapters: 1, 96, 432, 1043, 1044, 1053
   - Arc: East Blue, Marineford, Wano
   - Event: Battle of Marineford, Nika Reveal
   - Images: ~3 examples covering the model end-to-end, e.g.
     `image:luffy-primary-portrait` (depicted-by character:luffy,
     role: primary_portrait), `image:gomu-gomu-no-mi`
     (depicted-by devil-fruit:gomu-gomu), and one group photo
     exercising the reuse pattern (depicted-by multiple characters)

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

4. **`packages/importers` foundation**
   - Package scaffold and exports; no concrete importer yet.
   - Typed core interface: `Importer<TSource, TEntity>` with
     `fetch`, `map`, and `emit` stages, each generic over the source
     shape and the target entity type.
   - Mandatory Zod validation step between `map` and `emit`; no write
     of any kind is allowed without it passing.
   - **Dry-run mode**: emits a JSON diff (proposed entity files vs.
     existing files in `/data`) without writing anything.
   - **Stage-to-local mode**: writes to `/data/universes/<u>/entities/`
     so the maintainer can inspect, edit, and commit manually.
   - **PR mode**: writes via `packages/github-client` (built in
     Phase 4), opens a branch and PR labelled `auto-imported`.
   - Every emitted value carries `assisted_by` and
     `review_status: "auto_imported"`. Logging records the source URL,
     the model identifier, and the timestamp for every value.

   **Exit criteria**: the package builds, `bun run typecheck` passes
   across the affected workspaces, the public interface is documented
   in `packages/importers/README.md`, and no concrete importer is
   implemented yet — those land in Phase 3 onward.

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

4. **First experimental bulk import (10 characters)**
   - **Source**: a public One Piece data API or dataset, picked at
     execution time. Candidates: `api.api-onepiece.com`, the OPDB
     project, the Fandom MediaWiki API. Selection criteria: licence
     compatible with attribution, machine-readable, covers East Blue
     arc characters.
   - **Scope**: 10 named characters from the East Blue arc (working
     candidate list: Luffy, Zoro, Nami, Usopp, Sanji, Coby, Buggy,
     Kuro, Krieg, Arlong).
   - **Procedure**: Claude Code reads source data, maps fields to the
     wiki schema, produces JSON files under
     `/data/universes/one-piece/entities/character/`. Every value
     carries `assisted_by: "claude-<family>-<version>-via-cc"` and
     `review_status: "auto_imported"`.
   - Workflow uses `packages/importers` in **stage-to-local mode** for
     the first run; **PR mode** is exercised once at least one
     character has been reviewed.

   **Exit criteria**:
   - 10 character files exist on disk and validate against the
     generated Zod.
   - All 10 open cleanly in `apps/preview`.
   - Every value in every file carries either an `assisted_by`
     qualifier or a commit-history trail proving human review.
   - The maintainer has reviewed at least **3 of the 10** files,
     dropping `assisted_by` and `review_status` (or flipping
     `review_status` to a non-default value) to validate the
     human-review loop end-to-end.
   - A short retrospective is appended to ADR-010 capturing what the
     review pass surfaced (mismatches, gaps in the source data, prompt
     issues).

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

8. **Image upload value input**
   - Server function for R2 upload: accepts a file, validates format
     and size, deduplicates by content hash, writes to
     `images/<image-slug>.<format>` per the R2 convention in
     `/docs/ARCHITECTURE.md`.
   - `ImageUpload` value input component for the form generator,
     registered under `value_type: "entity_ref"` constrained to
     `image` targets (or a dedicated `image_ref` variant if the
     existing entity-ref input is insufficient).
   - On submission, the upload server function creates the `image`
     entity (with url, license, attribution, alt_text_key,
     spoiler_since, format, optional caption) **and** the
     `depicted-by` relation on the parent entity in a single
     transaction (one PR carrying both files).
   - Licensing surface: the form requires picking a value from
     `image-licenses` and entering an attribution string before
     upload is allowed.

9. **AI-assisted Suggest buttons**
   - On every form field rendered by the form generator, a
     `✨ Suggest` button calls a server function returning a draft
     value the editor can accept, edit, or reject.
   - The server function reuses the prompts and mapping patterns
     proven during the Phase 3 bulk import — the same heuristics that
     already produced acceptable data, exposed as an inline affordance.
   - **Phase 4 operator model**: Claude Code in a side session. The
     server function returns a structured request; the maintainer
     pastes it into Claude Code, copies the response back. No direct
     Anthropic API integration in this phase — the manual paste-flow
     keeps cost predictable and lets the prompts mature before
     productisation.
   - **Provenance**: accepted suggestions land as values with
     `assisted_by: "claude-<family>-<version>-via-dashboard"` and
     `review_status: "not_reviewed"` until a follow-up commit drops
     both qualifiers.
   - **Deferred to a later phase**: replacing the manual paste-flow
     with a direct API call. Triggered by the criteria in the
     "AI scale-up criteria" section at the bottom of this file.

## Phase 4.3 — Contribution surface expansion

**Goal**: broaden what a contributor can do through the dashboard
beyond "edit a known entity". Three independent slices, each
shippable on its own.

**Exit criteria**:

- A non-admin contributor can create a brand-new entity (character,
  chapter, devil-fruit, …) via the dashboard and land it as a PR.
- A contributor can edit the **cast of a single source** (a chapter,
  episode, film) from one screen — bulk-add/remove apparitions and
  ship a single PR that touches every affected entity file.
- Every entity that is _not_ a source surfaces an **Apparitions tab**
  showing its `appears-in` relations grouped by source-type.
- The contribution surface is mobile-first throughout (no desktop-
  only affordances on the new pages).

### Tasks

1. **Entity creation flow** (ADR-020)
   - `POST /api/entities/:type` server endpoint
   - `SlugInput` component (regex + uniqueness validation)
   - `/types/$type/new` route reusing `EntityForm`
   - "+ New" button on the per-type list page
   - Post-create banner ("PR opened — visible after deploy")

2. **Per-source cast manager** (ADR-021)
   - `GET /api/sources/:type/:slug/cast` (reverse-scan)
   - `POST /api/sources/:type/:slug/cast` (bulk apply)
   - `submitSourceCastEdit` in `packages/github-client`
   - `/sources/$type/$slug` route, grouped by entity type
   - `/sources` index + sidebar nav entry

3. **Per-entity apparitions tab**
   - Tab strip on `/types/$type/$slug` (hidden for source types)
   - `/types/$type/$slug/apparitions` sub-route
   - Source-type-grouped view of the entity's `appears-in` relations
   - Mutations go through the existing `submitEntityEdit` (entity-owned)

4. **Mobile follow-ups** (deferred from the mobile-triage PR)
   - Bottom tab bar on mobile (5 slots, replaces sidebar below `md`)
   - Audit AWS SDK isolation from the SSR bundle (presign-upload
     is the only consumer; bundle leak documented in IDEAS.md)
   - Container query primitives in `tailwind.config` for components
     that render in both full-page and drawer contexts

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

**Goal**: open editing to non-admin contributors. Anyone with a
GitHub account can propose changes (data + images); a small admin
set (currently `7IBO`) reviews and merges.

The Phase 4 dashboard treats every signed-in user as an admin,
gated only by `ADMIN_GITHUB_USERNAMES`. Phase 7 introduces a real
authorization model with three tiers (visitor / contributor / admin),
a two-stage R2 storage so unvetted images never go public, and an
admin moderation queue.

See ADR-015 for the decision detail.

**Exit criteria**:

- Three-tier auth (visitor / contributor / admin) lives in code, not
  just in the admin allow-list.
- Any GitHub-authenticated user can open a PR via the dashboard;
  PRs are attributed to the contributor via Co-authored-by + PR-body
  `@mention`.
- Image uploads from non-admins land in a private R2 staging prefix
  with signed-URL reads only; the public CDN bucket receives the
  bytes only when the admin merges the PR.
- Admin dashboard at `/admin/queue` lists every open PR touching
  `data/**` with: contributor, structured diff (reusing the
  `DiffPopover` renderer server-side), staged image previews,
  merge / request-changes / close actions.
- Rate limits per contributor (max N open PRs, max M uploads/hour,
  max P files per PR), `BLOCKED_GITHUB_USERNAMES` env var to revoke
  abusive accounts without code changes.
- Auto-merge workflow only auto-merges PRs co-authored by an admin;
  contributor PRs always wait for explicit admin merge.

### Sub-phases

Per ADR-015 the work splits into four shippable sub-phases:

#### Phase 7.0 — Lock down admin set (config-only)

- Reduce `ADMIN_GITHUB_USERNAMES` to `7IBO` (current sole admin).
- Add a `BLOCKED_GITHUB_USERNAMES` env-var placeholder (read but
  empty by default) so Phase 7.2 can ship without an env-shape
  change.
- Update `.env.example` to make the default explicit.
- **Exit**: only `7IBO` can sign into the dashboard today; the
  config surface for tier expansion is in place.

#### Phase 7.1 — Two-stage R2 storage

- New `pending/` prefix (or sibling bucket) on R2: private, no public
  domain, accessed only via short-lived signed read URLs.
- `apps/dashboard/api/r2.ts`: `presignUpload()` writes to `pending/`;
  new `presignRead(key, ttlSec)` returns a signed GET URL.
- `apps/dashboard/api/server.ts`: new `/api/preview/:key` route signs
  a read URL and 302s to it (used by `<img src>` in the dashboard
  - admin queue).
- New value-encoding `staging://<key>` on the entity `url` property
  → dashboard renders via `/api/preview/...`; downstream code knows
  this is "draft only".
- **Promotion is dashboard-driven** (see ADR-015 "Promotion path
  — revised"). The bytes never move until an explicit admin
  Approve in the queue UI (Phase 7.3) → server endpoint
  `POST /api/admin/promote` calls `apps/dashboard/api/admin-promote.ts`:
  S3-copies `pending/key` → `images/key`, pushes a rewrite commit
  on the PR head branch, squash-merges via the GitHub API,
  best-effort deletes the `pending/` source.
- A symmetric `POST /api/admin/reject` closes the PR and deletes
  the staged sources it introduced.
- R2 lifecycle rule: anything in `pending/` older than 14 days is
  auto-purged (covers abandoned uploads + races where the explicit
  delete failed).
- Build guard in `packages/schema-engine/src/cli/validate.ts` fails
  CI on any `staging://` URL surviving in `main`, so an admin who
  tried to merge a PR directly on GitHub (bypassing the dashboard)
  doesn't ship broken URLs.
- **Exit**: an admin uploading an image goes through `pending/`;
  approving the PR via dashboard promotes the bytes + merges in
  one operation. PR rejected → `pending/` object deleted
  immediately + lifecycle as belt-and-suspenders.

#### Phase 7.2 — Open writes to anyone (anonymous + authenticated)

Revised per ADR-015 "Anonymous writes" section: writes do NOT
require GitHub login. Login is opt-in for attribution.

- Dashboard OAuth flow drops the
  `ADMIN_GITHUB_USERNAMES` rejection on `/auth/callback`; login
  becomes an optional identity-attach.
- Write endpoints (`POST /api/entities/*`,
  `POST /api/uploads/presign`) accept `session === null`.
- `submitEntityEdit` accepts `contributorLogin: string | null`.
  When non-null, the PR opens with `Co-authored-by:
  <login>@users.noreply.github.com` + `@mention` in the body.
  When null, no trailer at all — PR is bot-authored — and the
  body says "Anonymous contribution" with a hashed IP
  fingerprint for correlation.
- New env vars + in-memory rate limiter:
  - `ANON_WRITE_LIMIT_PER_HOUR=10` per IP for save endpoints.
  - `ANON_UPLOAD_LIMIT_PER_HOUR=20` per IP for presigns.
  - `BLOCKED_IPS=` comma-separated list, 403 on every write.
- `BLOCKED_GITHUB_USERNAMES` still honoured for authenticated
  trolls (admins can also block by IP via env var).
- Auto-merge workflow unchanged: it already requires an admin
  `Co-authored-by` so neither anonymous nor non-admin contributor
  PRs ever auto-merge.
- **Exit**: anyone visiting the dashboard can edit an entity
  and open a PR (anonymously or with login attribution); admin
  sees them in the GitHub PR list AND in `/admin/queue` (7.3).
  Rate-limit prevents drive-by spam at modest scale.

#### Phase 7.3 — Admin moderation queue

- New gated route `/admin/queue` (403 for non-admins).
- Lists every open PR touching `data/**` with: contributor identity,
  age, branch, status checks pass/fail, file count.
- Per-PR detail view: structured diff (reuses the `DiffPopover`
  computation server-side so the rendering matches the editor),
  staged image previews via `/api/preview/...`, raw GitHub PR link.
- Action buttons (call GitHub API server-side):
  - "Approve & merge" → squash-merge (triggers promote-images).
  - "Request changes" → comment + draft state.
  - "Close" → close without merging (lifecycle purges staged
    assets).
- Block-contributor shortcut writes to a server-side allow-list
  store (Phase 7.4 if/when this needs to outgrow env vars).
- **Exit**: admin can triage the whole queue without leaving the
  dashboard. GitHub PRs remain the source of truth.

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

## AI scale-up criteria

Phases 1–4 use Claude Code with the Max subscription as the AI-entry
surface. The subscription is preferred over direct Anthropic API calls
while volume stays manageable: simpler ops, no per-request billing, and
the human-in-the-loop pattern fits the single-maintainer phase.

Migrate to a script that calls the Anthropic API directly (likely in
Batch mode for cost) when **any** of the following signals appear:

- More than **50 import runs per month**. Around this volume,
  subscription stops being the cheaper option.
- Need to run **more than 2 parallel extraction sessions** at once.
  Claude Code is interactive and single-channel; the API parallelises
  trivially.
- Need for **runs that exceed 24 hours unattended**. Subscription
  requires an active Claude Code session; the API does not.

Until any of these triggers, subscription mode is the preferred surface
and the codebase optimises for it (`via-cc` provenance, human-paced
review loop, no batch-job infrastructure).

The migration is mechanical, not architectural: `packages/importers` is
already split between mapper and writer (Phase 2 Task 4), and the
`assisted_by` format already distinguishes `via-cc`, `via-api`, and
`via-dashboard`. Only the writer-shell swaps. See ADR-010 in
`/docs/DECISIONS.md`.
