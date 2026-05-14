# Architectural Decisions

This is the project's Architecture Decision Record (ADR) log. Every
non-trivial architectural decision is recorded here with date, context,
options considered, choice, and rationale.

Format: append new entries at the top.

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
3. **SCHEMA_SPEC.md** — introduce a *base qualifiers* concept
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
hidden the *kind* of issue each one addresses.

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
