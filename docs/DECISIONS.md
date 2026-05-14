# Architectural Decisions

This is the project's Architecture Decision Record (ADR) log. Every
non-trivial architectural decision is recorded here with date, context,
options considered, choice, and rationale.

Format: append new entries at the top.

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

## ADR-007 — Phase 1 includes a minimal preview app, not dashboard-only

**Date**: 2026-05

**Context**: The initial intent was to build only the dashboard in phase 1
and defer all read-side concerns. The risk is that a write-only system
produces data unsuitable for actual reading, and that the build pipeline is
never exercised end-to-end.

**Choice**: Include a minimal preview app alongside the dashboard in
phase 1.

**Rationale**: The preview app is the cheapest possible end-to-end test of
the data model. It can be unstyled and minimal but must exist before phase
4 dashboard work begins.

**Consequences**: ~1 week of additional work in phase 3, repaid many times
over by avoiding model rework later.

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
