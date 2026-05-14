# Architectural Decisions

This is the project's Architecture Decision Record (ADR) log. Every
non-trivial architectural decision is recorded here with date, context,
options considered, choice, and rationale.

Format: append new entries at the top.

---

## ADR-014 — Split Phase 4 into sub-phases; ship 4.1 (local dashboard) first

**Date**: 2026-05-14

**Context**: ROADMAP Phase 4 enumerates eight large tasks for one
sub-phase: TanStack Start setup, GitHub App auth, packages/github-client
(Octokit), schema-driven form generator, ten value-input components,
historical-value editor, relation editor, IndexedDB drafts, AI-assisted
Suggest buttons, and an image upload pipeline writing to R2. Some
of those dependencies require **external setup the maintainer must
perform out of band** — registering a GitHub App at
`github.com/settings/apps/new`, generating a private key, installing
it on the data repo — which Claude Code cannot do from inside the
sandbox. Treating Phase 4 as one monolithic deliverable conflates
"the dashboard works locally" (no external blockers) with "the
dashboard opens PRs on GitHub" (blocked on GitHub App registration).

**Options**:

- A — Keep Phase 4 monolithic. Wait until the maintainer registers
  the GitHub App; only then start any Phase 4 implementation. Phase 4
  stays at zero progress in the meantime.
- B — Split Phase 4 into four sub-phases, each with its own exit
  criteria. Ship the parts that have no external dependency first.

**Choice**: B.

**Phase 4 sub-phases**:

- **Phase 4.1 — Local dashboard** (no external blockers)
  - `apps/dashboard` (TanStack Start) runs locally.
  - `packages/ui` exposes the Tailwind v4 theme tokens + Base UI
    re-exports + `cn()` helper.
  - Routes: home, type list, entity list per type, entity edit.
  - Schema-driven form generator. Value inputs: String, Number,
    Enum, Boolean, EntityRef, I18nKey.
  - Save action writes JSON files to `/data/universes/` directly
    via a Bun server function. No auth, no PR flow.
  - Exit: `bun --filter @onepiece-wiki/dashboard dev` opens a
    browser-renderable dashboard; editing an entity and saving
    persists to disk; reloading shows the change.
- **Phase 4.2 — GitHub integration** (blocked on GitHub App)
  - `packages/github-client` (Octokit wrapper).
  - Server-side GitHub OAuth session.
  - Save action replaces local FS write with branch + PR via
    Octokit. SHA-based optimistic locking.
  - Exit: edits go through PRs rather than direct disk writes.
- **Phase 4.3 — Editor depth**
  - Remaining value inputs: SourceRef, MultiEnum, Date, Markdown.
  - Historical value editor (add/remove/reorder entries with
    qualifier sub-forms and inline timeline).
  - Relation editor (per-relation qualifier form).
  - IndexedDB drafts with auto-save and restore.
- **Phase 4.4 — AI-assisted + images**
  - `✨ Suggest` button per field (manual paste-flow via Claude Code).
  - Image upload value input writing to R2 (the upload server
    function from ROADMAP Phase 4 Task 8).

**Rationale**:

- 4.1 ships immediately. The maintainer gains a UI for editing
  entities without touching JSON, which is itself a meaningful
  improvement over Claude-Code-only editing.
- 4.2's blocking dependency is surfaced explicitly. Future sessions
  start it once the GitHub App is registered.
- 4.3 and 4.4 are nice-to-haves whose value compounds as data volume
  grows.
- The ROADMAP Phase 4 exit criteria remain the bar to mark Phase 4
  _complete_. ADR-014 only restructures the path to that bar; it
  does not move it.

**Consequences**:

- ROADMAP's "Current phase" tracker uses "4.1 complete" /
  "4.2 ready / blocked on GitHub App" semantics rather than a single
  in-progress/complete bit.
- Phase 4.1 ships without auth. The local server binds to localhost
  only and is **not** meant to be exposed publicly — it's a
  single-machine maintainer tool.
- Direct FS writes in 4.1 mean the maintainer's git workflow stays
  manual: edits land in the working tree; the maintainer commits.
  This is exactly the same surface they've been using via Claude
  Code so far, so no behaviour regression.
- ROADMAP Phase 4 task list is reorganised under the sub-phase
  headings; original task content unchanged.

**Non-decisions** (deferred):

- Whether Phase 4.4's Suggest button stays manual paste-flow or
  upgrades to a direct API call. Tied to the AI scale-up criteria
  in ROADMAP.

---

## ADR-013 — Phase 3 preview is a minimal Bun HTTP server, not TanStack Start

**Date**: 2026-05-14

**Context**: ARCHITECTURE.md, CLAUDE.md, and ROADMAP Phase 3 Task 1 all
name TanStack Start as the web framework for `apps/preview`. The
preview app's stated purpose (ADR-007 + ARCHITECTURE.md § "Public web
app (deferred)") is:

> raw entity display, basic spoiler filter, to validate the data model
> end-to-end

i.e. a sandbox, not a product surface. The full TanStack Start setup —
file-based routing, server functions, build pipeline, React 19, Vite,
Tailwind v4, Base UI — is significant scaffolding for an app that
exists to prove the SDK queries the right rows.

**Options**:

- A — Full TanStack Start + React + Tailwind v4 + Base UI in Phase 3.
  Matches the documented stack. Significant up-front cost; the
  resulting app's UI is throwaway because Phase 6 builds the real
  public app from scratch with proper SEO/SSG.
- B — Minimal Bun HTTP server in Phase 3. Server-rendered semantic
  HTML with a tiny inline stylesheet. Query-param-driven spoiler
  filter (`?chapter=N`) and locale switch (`?locale=fr`). No React,
  no Vite, no framework boilerplate. The dashboard (Phase 4) is where
  TanStack Start lands; the public web app (Phase 6) is where the
  Base-UI + Tailwind design system lands.
- C — TanStack Start without Tailwind / Base UI in Phase 3, then
  layer those on for Phase 4. Hybrid; gets the framework cost without
  the design-system payoff.

**Choice**: B.

**Rationale**: The preview's role is validation, not design. A
purpose-built HTTP server hits every Phase 3 exit criterion (route
`/preview/[type]/[slug]` renders an entity, chapter input filters
spoilers, locale switcher swaps EN/FR labels) in dramatically less
code. The data-model bugs the preview is supposed to surface are
already visible in pure-data rendering; running them through a React
tree adds no signal. The dashboard's TanStack Start setup in Phase 4
remains exactly as planned — that surface needs the type-safe server
functions and dynamic forms.

**Consequences**:

- `apps/preview` is ~200 lines of Bun + a small render module, not a
  Vite project. No React in the dependency tree until Phase 4.
- The Pagefind static index task moves from Phase 3 to Phase 6 (the
  real public app). The preview has no search bar; entity lookup is
  via URL.
- ROADMAP Phase 3 Task 1 stands; only the framework choice softens.
  Phase 3 exit criteria are unchanged.
- The Phase 4 dashboard task remains "TanStack Start setup". This
  ADR does not affect that decision.

**Non-decisions** (deferred):

- Whether the public web app in Phase 6 reuses the preview server or
  starts fresh from TanStack Start. Phase 6's design pass will pick.

---

## ADR-012 — Switch to `bun:sqlite` (better-sqlite3 unusable under Bun on Windows)

**Date**: 2026-05-14

**Context**: Phase 2 implementation of `packages/db-builder` required
opening a SQLite database. ADR-001 / the doc-consistency pass (fix 5)
committed to `better-sqlite3` as the only SQLite driver. On the project
maintainer's Windows machine with Bun 1.3.6, `new Database(path)` from
`better-sqlite3` 12.10 fails at load time:

```
ERR_DLOPEN_FAILED
at new Database (better-sqlite3/lib/database.js:48:29)
```

The error message itself suggests `bun:sqlite`. The native `.node`
binding is incompatible with Bun's Windows runtime; the only way to
keep `better-sqlite3` would be to run the build pipeline under Node
instead of Bun, which contradicts ARCHITECTURE.md's stated runtime.

**Options**:

- A — Keep `better-sqlite3`; run the build pipeline under Node only.
  Adds a runtime split (Bun for scripts, Node for the builder) and
  bifurcates the developer experience.
- B — Switch to `bun:sqlite`. Native to Bun, no compilation step, API
  compatible with `better-sqlite3` for the subset Phase 2 uses
  (Database, prepare, run, transaction, exec).
- C — Switch to a JS-only SQLite (sql.js, etc.). Loses the
  better-sqlite3 performance characteristics that motivated ADR-001.

**Choice**: B.

**Rationale**: The error message is explicit; the API is compatible;
keeping one runtime simplifies tooling. `bun:sqlite` is mature enough
for Phase 2's needs (build-time write, no online concurrency, no FTS5
yet). When Phase 3+ ships the public web app, it reads the artefact at
runtime; that reader can be `better-sqlite3` under Node (Vercel
serverless) without affecting the build pipeline — i.e. write-side and
read-side drivers may legitimately differ.

**Consequences**:

- `packages/db-builder` uses `import { Database } from 'bun:sqlite'`.
  `better-sqlite3` is removed from the package dependencies.
- ARCHITECTURE.md and CLAUDE.md soften the "better-sqlite3 only"
  language to: build-time uses `bun:sqlite`; read-time may use
  `better-sqlite3` under Node when serverless deployments require it.
- Phase 2 work flagged a real bug in fix 5 of the doc-consistency
  pass: the runtime was tested only on the docs layer, not against an
  actual install. The same risk applies to other native-binding
  dependencies; future ADRs should require a smoke test before
  committing to a specific binding.
- `bun:sqlite` requires **positional parameter binding** (`?` rather
  than `$name`) when an object key collides with a SQL reserved word
  like `type`. The Phase 2 writer uses `?` throughout for
  predictability.

**Non-decisions** (deferred):

- Whether to drop `better-sqlite3` from the project entirely. Phase 6
  may want it for the read-side serverless app; we'll decide then.

---

## ADR-011 — Images as first-class entities; in-universe documents deferred

**Date**: 2026-05-14

**Context**: The data model needs to represent visual content
(portraits, scenes, covers, wanted posters, …). Two design tensions:

1. **Images as illustrations vs. as data.** A simplistic
   "url-on-entity" approach treats images as decoration. The wiki
   needs more: licensing per file, spoiler-gating per image, reuse
   across multiple entities (group photos), and a clean R2 storage
   convention.
2. **Plain images vs. in-universe documents.** Wanted posters, vivre
   cards, newspapers, and similar diegetic objects could be modeled
   as their own entity type (`document`) with subtypes — enabling
   queries like "all wanted posters issued by the Marines" or "all
   vivre cards held by Luffy".

**Options**:

- A — Defer images entirely; revisit after the basic model ships.
- B — Add `image` as a first-class entity and `document` as a
  separate first-class entity in Phase 1.
- C — Add `image` as a first-class entity in Phase 1. Model
  in-universe documents as plain images for now; promote to a
  `document` entity type in a later phase via a non-destructive
  migration.

**Choice**: C.

**Rationale**:

- Images must be first-class — licensing, dedup, reuse, spoiler
  gating, and R2 storage all demand entity status. Option A blocks
  too much downstream work (preview app, dashboard upload form,
  bulk-import provenance).
- Document semantics are valuable but premature. The current
  contributor count is one. Most images don't need document
  semantics (a portrait is just a portrait). Validating the basic
  image flow first reduces the risk of designing `document` against
  unknown contributor patterns.
- The migration path is clean. Existing `image` entities representing
  diegetic objects stay as-is; new `document` entities are created
  later and carry their own `depicted-by` relations to those images.
  No data loss, no schema rewrites. Detailed in `/docs/IMAGES.md`
  § "Migration plan: images → documents" and `/IDEAS.md`
  § "In-universe documents as first-class entities".

**Consequences**:

- Phase 1 adds: `image` entity type; `depicted-by` and `sourced-from`
  relation types; `image-licenses`, `depiction-roles`, and
  `image-formats` vocabularies. Phase 4 adds the upload value-input
  component and R2 upload server function. See `/docs/ROADMAP.md`.
- Known limitation: bounty-change images cannot be queried as "all
  wanted posters issued by the Marines" until `document` lands. The
  workaround for Phase 1 is the `depicted-by` relation's `period` and
  `context` qualifiers, which carry free-form string metadata. Logged
  in `/IDEAS.md` as a forward-pointer.
- Storage is **flat** on R2: `images/<image-slug>.<format>`. The
  per-entity-directory layout was rejected because reused images
  (group photos) have no single "owner" to nest under. Detailed in
  `/docs/ARCHITECTURE.md` § "R2 storage key convention".
- Two filters apply to image display: `image.spoiler_since` (is the
  image itself safe?) and the `depicted-by` qualifier `since` (is
  this depiction contextually accurate?). The dual filter is
  intentional — it handles Gear-5 reveals and historisable wanted
  posters with the same mechanism. Detailed in `/docs/IMAGES.md`
  § "Spoiler handling".

**Non-decisions** (deferred):

- The exact `document` schema shape — its properties, subtypes, and
  qualifiers — stays unwritten until promotion. Speculating now would
  bias the design before contributor demand surfaces.
- Whether to also defer SVG support pending the `image-formats`
  vocabulary's first real-world use. Phase 1 ships all six formats;
  if any prove unused or problematic, the vocabulary entry can be
  removed in a vocabulary PR without entity-level migration.

---

## ADR-010 — AI-assisted data entry as a first-class concept

**Date**: 2026-05-14

**Context**: A growing share of structured data on the wiki will be
generated by AI agents — Claude Code instances editing JSON locally,
scripts that batch-call the Anthropic API to seed property values,
"Suggest" buttons in the dashboard that draft fields for editors.
Without a model-level distinction, AI output and human input become
indistinguishable, and human reviewers have no systematic way to find
unverified entries.

**Options**:

- A — Treat AI provenance as a git-history concern only (no model
  fields). Detect AI commits by author identity.
- B — Add structured per-value qualifiers: `assisted_by` for provenance,
  `review_status` for human attention. Make them first-class base
  qualifiers available on every historisable value and relation.
- C — Add a separate "review queue" data store outside the entity files.

**Choice**: B.

**Rationale**:

- Provenance lives next to the value it qualifies, so a single
  `getEntity(id)` call surfaces what's AI-generated and what isn't. A
  git-only signal (option A) would require correlating commits with
  entity diffs at read time, which doesn't fit the JSON-as-truth model.
- A separate review queue (option C) duplicates state and risks drift
  between the queue and the data. Per-value qualifiers stay in lockstep
  by construction.
- Two separate qualifiers (not one combined "trust" field) preserve
  orthogonality: `assisted_by` answers _who generated this_,
  `review_status` answers _has a human checked it_. They evolve
  independently — an AI-generated value can be reviewed; an
  auto-imported value can be flagged later by a different reviewer.

**Phase 1 entry surface**: Claude Code with the Max subscription, run
locally by the project maintainer. Writes JSON directly. `assisted_by`
is set to `claude-<family>-<version>-via-cc` on every value Claude
generates; `review_status` is `not_reviewed` until a follow-up commit
either confirms the value (drops both qualifiers) or flags it.

**Migration path at scale**: when entry volume exceeds what
human-supervised Claude Code can sustain, the same qualifiers cover a
script that calls the Anthropic API directly — likely in Batch mode
for cost — and writes JSON via PRs. The `assisted_by` format already
distinguishes surfaces (`via-cc`, `via-api`, `via-dashboard`); no
model change is required. The triggers for migration are documented
in `/docs/ROADMAP.md` § "AI scale-up criteria".

**Consequences**:

- New vocabulary `/data/schemas/vocabulary/review-statuses.json` lists
  the four review states (`reviewed`, `not_reviewed`, `flagged`,
  `auto_imported`).
- `assisted_by` and `review_status` are documented as base qualifiers
  in `/docs/SCHEMA_SPEC.md`, the provenance/review concept is
  documented in `/docs/DATA_MODEL.md`, and the epistemic-vs-review
  distinction is in `/docs/EPISTEMIC_MODEL.md`.
- CI gates will be able to refuse `main` merges that introduce entries
  with `review_status: "not_reviewed"` once the dashboard supports
  marking review.
- The dashboard's "needs attention" queue is a query over
  `review_status IN ("not_reviewed", "flagged", "auto_imported")`.

**Non-decisions** (deferred):

- Whether AI-assisted edits should open an automatic draft PR rather
  than be committed directly — punted until volume justifies the
  infrastructure.
- Whether AI-suggested narratives (Markdown) carry a parallel signal
  — out of scope for this ADR; covered when the narrative editor is
  built.

---

## ADR-009 — Doc-consistency pass before Phase 1 code

**Date**: 2026-05-14

**Context**: Before any code work began for Phase 1, an audit of the
full doc set (CLAUDE.md plus the twelve files under `/docs/`) surfaced
three genuine contradictions and several smaller ambiguities. The risk
of starting code on top of contradictory specs is that decisions get
silently locked in by whichever spec the implementer happened to read.

**Choice**: Apply eight targeted doc-only commits resolving each issue
discretely, with no code touched. Specifically:

1. **ADR-007** retitled and rewritten so it no longer claims the preview
   app belongs to Phase 1; ROADMAP (Phase 3) is the authority.
2. **DATA_MODEL.md** Gomu Gomu example: `revealed` → `revealed_to_reader`,
   matching the canonical enum in EPISTEMIC_MODEL.md.
3. **SCHEMA_SPEC.md** — introduce a _base qualifiers_ concept
   (`epistemic_status`, `actual_value`, `event`, `believed_by`,
   `known_truth_by` implicit on every historisable property) and clarify
   that `default_qualifiers` vs `allowed_qualifiers` is a UI distinction
   (shown by default vs behind "more options"). Drop `epistemic_status`
   from the bounty example's `allowed_qualifiers`.
4. **Localization terminology** section added to SCHEMA_SPEC.md and
   mirrored in I18N_STRATEGY.md, defining `i18n_key` (value type),
   `value_key` (entry field), `canonical_name_key` (entity field), and
   formally retiring the orphan term `name_key`.
5. **CLAUDE.md** — drop the `bun:sqlite` alternative; `better-sqlite3`
   is the only listed driver, matching ARCHITECTURE and BUILD_PIPELINE.
6. **CLAUDE.md + ARCHITECTURE.md** — replace the "oxfmt if stable, else
   dprint" conditional with "dprint (oxfmt under consideration when it
   stabilises)", since CONVENTIONS.md already names `dprint.json` as the
   config file.
7. **SCHEMA_SPEC.md** — document when relation `since` may be omitted
   (pre-canon events) and the alternative qualifier `during_period`
   anchored by a controlled vocabulary; add `eaten-by` as a worked
   example covering the Joy Boy / Void Century case.
8. **CONVENTIONS.md** — introduce the rule "omit fields equal to their
   schema default in entity JSON", enforced by `bun run format:data`.
   Apply across all worked examples in DATA_MODEL.md.

**Rationale**: Resolving these now means Phase 1 code is built against a
single, internally consistent specification. The eight changes are
small, additive, and reviewable; doing them as one bulk PR would have
hidden the _kind_ of issue each one addresses.

**Consequences**:

- The doc set is now self-consistent on phase placement, the epistemic
  enum, the qualifier model, localisation terminology, the SQLite
  driver, the formatter default, when `since` is required on relations,
  and the default-omission rule.
- A small number of in-scope follow-ups remain for later passes:
  - CONVENTIONS.md still phrases the formatter as "oxfmt (or dprint as
    fallback)" in the Formatting section — the wording was left
    untouched because it was out of scope for fix 6, but it should
    converge with CLAUDE.md and ARCHITECTURE.md in a future commit.
  - The Luffy bounty history disagrees between two DATA_MODEL.md
    examples (chapter 1053 vs 1058 for ₿3B). A simple fact-check, not
    architectural — flagged here so it isn't lost.
  - The `during-periods.json` vocabulary and the
    `MISSING_TEMPORAL_ANCHOR` build error were referenced by the
    eaten-by example but not yet authored under `/data/schemas/`. Both
    are Phase 1 deliverables.

**What we learned** (recorded so the next phase boundary repeats it):

- **Worked examples drift fastest.** DATA_MODEL.md held more
  contradictions than the formal spec layer. Whenever the data model
  changes, the examples must be revalidated, not just the spec.
- **Establish vocabulary before using it.** The four near-synonyms for
  the localisation key space (`i18n_key`, `value_key`,
  `canonical_name_key`, `name_key`) accreted across separate docs
  written at different times. Naming a concept is part of introducing
  it.
- **ADR titles outrun their bodies.** ADR-007's title contradicted its
  own body, and the title won every time the ADR was referenced
  elsewhere. Title and body must agree.
- **"Implicit on every X" rules need a formal home.** The five base
  qualifiers were used uniformly in examples but had no canonical
  declaration; editors who didn't read EPISTEMIC_MODEL would have
  redeclared them per property type.

**Process for future passes**: run a doc-consistency audit at the end of
every completed phase, before any code is written for the next phase.
Fix in small commits per concern, log the result as a new ADR.

---

## ADR-008 — Storage strategy for dashboard drafts and sessions

**Date**: 2026-05 (TBD on commit)

**Context**: The dashboard needs to persist in-progress edits (drafts) and
optionally session/lock state. Two options were considered.

**Options**:

- A — Filesystem/GitHub direct, drafts in IndexedDB/LocalStorage on the
  client. No server-side persistent state in phase 1.
- B — Dedicated database (Postgres or SQLite) for drafts, locks, sessions.

**Choice**: A.

**Rationale**: Phase 1 is admin-only with very low contention, deploying on
Vercel (serverless). A client-side IndexedDB draft store is sufficient,
keeps infrastructure minimal, and avoids a database to operate. When
community contribution opens (phase 7), we can move to B without affecting
the data model.

**Consequences**:

- Drafts are device-local; switching devices loses in-progress work
- Concurrent edits handled by SHA-based optimistic locking against GitHub
- Migration path to a server-side store is straightforward (server function
  signatures unchanged)

---

## ADR-007 — Preview app exists before the dashboard, not after

**Date**: 2026-05

**Context**: The initial intent was to build the dashboard first and defer
all read-side concerns until much later. The risk is that a write-only
system produces data unsuitable for actual reading, and that the build
pipeline is never exercised end-to-end. An early draft of this ADR
mistakenly placed the preview app in Phase 1; the ROADMAP correctly puts it
in Phase 3, before the dashboard work in Phase 4.

**Choice**: Build a minimal preview app in **Phase 3** (see `/docs/ROADMAP.md`),
before the dashboard. The preview is not part of Phase 1; Phase 1 stops at a
typed, validated data model.

**Rationale**: The preview app is the cheapest possible end-to-end test of
the data model. It can be unstyled and minimal, but it must exist **before
the Phase 4 dashboard work begins**, so the dashboard is built against a
data model that has been exercised by a real reader.

**Consequences**: ~1 week of additional work in Phase 3, repaid many times
over by avoiding model rework once the dashboard is in flight.

---

## ADR-006 — Single-language slugs (English)

**Date**: 2026-05

**Context**: URLs could be localized (`/personnages/monkey-d-luffy` in FR,
`/characters/monkey-d-luffy` in EN) or unified.

**Choice**: English slugs only. URLs are not localized; only content is.

**Rationale**: Canonical URLs simplify SEO, link sharing, and the
implementation. The English-speaking community uses well-established names
that are stable across years. URL segments for type are also English
(`/characters/...`).

**Consequences**: hreflang is still emitted for content; only the URL
structure is shared.

---

## ADR-005 — Sources are entities, not a separate concept

**Date**: 2026-05

**Context**: An earlier draft separated entities (characters, fruits, etc.)
from sources (chapters, episodes, films). This created a dichotomy in the
data layer and the code.

**Choice**: Everything is an entity. Chapters, episodes, films, SBS, and
databooks are entity types like any other.

**Rationale**: Uniform model. The SDK has one function `getEntity`. Forms
are generated identically. Relations work the same way. The build pipeline
treats them uniformly.

**Consequences**: Larger entity surface area, but each type is small. The
data model is simpler overall.

---

## ADR-004 — IDs are `type:slug`, distinct from slugs

**Date**: 2026-05

**Context**: Choice between slug-as-id, prefixed-id, and uuid.

**Choice**: Prefixed IDs of the form `type:slug` (e.g.
`character:luffy`). IDs are immutable. Slugs are public, mutable, with
redirect history.

**Rationale**:

- Prefixing avoids cross-type collisions (`character:arlong` vs
  `crew:arlong-pirates`)
- Self-documenting relations: `target: "devil-fruit:gomu-gomu"`
- Slug rename does not invalidate thousands of references
- Easier validation: type is parseable from the id

**Consequences**: Slightly more verbose JSON, mitigated by short slugs.
Dashboard forms hide the prefix from users.

---

## ADR-003 — JSON in Git as source of truth, SQLite as derived artifact

**Date**: 2026-05

**Context**: The data could live in a database, in JSON in Git, or hybrid.

**Choice**: JSON files in Git are the source of truth. SQLite is
regenerated from scratch on every build and is never written to at runtime.

**Rationale**:

- Auditability: every change is a Git commit with author and message
- Reviewability: diffs are reviewable in PRs
- Forkability: third parties can consume the data
- Performance: SQLite gives fast read-side queries
- Simplicity: no migrations on the read DB (it's regenerated)

**Consequences**: A build step is required between data change and visible
update. Editing must happen via a UI that opens PRs (the dashboard).

---

## ADR-002 — Schema-driven dashboard (no hardcoded property names)

**Date**: 2026-05

**Context**: The dashboard could be coded type-by-type (a form per
character, a form per fruit) or driven by schema.

**Choice**: Schema-driven. The dashboard reads schema files and generates
forms dynamically. Application code knows nothing about specific properties
or types.

**Rationale**: Adding a new property must not require code changes.
Maintainability of the dashboard depends on this discipline.

**Consequences**: Higher upfront cost for the schema engine and form
generator. Massive reduction in long-term maintenance.

---

## ADR-001 — Stack: Bun + Turborepo + TanStack Start + Base UI + Tailwind v4

**Date**: 2026-05

**Context**: Numerous combinations are viable for a TypeScript monorepo
producing a dashboard and a future public app.

**Choice**: Bun (package manager, scripts, tests), Turborepo (orchestration),
TanStack Start (web framework for dashboard and preview), Base UI (headless
UI primitives), Tailwind CSS v4 (styling).

**Rationale**:

- Bun gives fast install and script execution; Node fallback where needed
- Turborepo's caching is best-in-class and integrates with Vercel
- TanStack Start gives end-to-end typed server functions, file-based
  routing, and TanStack Query out of the box
- Base UI is unstyled, accessible, and composes well with any styling
  layer
- Tailwind v4's CSS-first config (`@theme`) supports proper design tokens

**Consequences**: Some packages may need Node fallback (`better-sqlite3`,
heavy Octokit ecosystem). The team must be comfortable with TanStack
Start's relative novelty.

---

## Template for new entries

```
## ADR-XXX — Title

**Date**: YYYY-MM-DD

**Context**: What's the situation that requires a decision?

**Options**:
- A — Description
- B — Description

**Choice**: A.

**Rationale**: Why A?

**Consequences**: What follows from this choice?
```
