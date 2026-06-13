# Claude Code Instructions — One Piece Wiki

This file is read by Claude Code at the start of every session. It defines the
project's hard rules. Do not deviate from them without explicit human approval.

## Project mission

Build a community-driven One Piece wiki where every piece of information is
**versioned by in-universe progression** so users can browse without spoilers
beyond the chapter/episode/film they have reached. The data model must also
support multiple translations, alternative canon scopes (anime, films, SBS),
and complex epistemic phenomena (false deaths, hidden identities, retcons,
reveals).

The architecture must be extensible to other universes later, but the only
universe in scope right now is One Piece.

## Mandatory reading before any action

At the start of any session, read these files in order:

1. `/CLAUDE.md` (this file)
2. `/docs/STATE.md` — current status + open/blocked threads (read this
   first to resume work mid-stream)
3. `/docs/ARCHITECTURE.md` — high-level vision and stack
4. `/docs/DATA_MODEL.md` — the three primitives and all data concepts
5. `/docs/SCHEMA_SPEC.md` — formal spec of schema files
6. `/docs/CONVENTIONS.md` — naming, code style, file organization
7. `/docs/ROADMAP.md` — phases and current state
8. `/docs/DECISIONS.md` — log of architectural decisions

If any task touches a specialized area, also read the relevant deep-dive doc:

- `/docs/EPISTEMIC_MODEL.md` for status changes, reveals, retcons
- `/docs/CANON_MODEL.md` for canon scopes (anime/films/SBS)
- `/docs/BUILD_PIPELINE.md` for JSON → SQLite work
- `/docs/DASHBOARD_ARCHITECTURE.md` for dashboard work
- `/docs/I18N_STRATEGY.md` for any translation-related work
- `/docs/IMAGES.md` for image entities, upload, R2 storage, licensing
- `/docs/PUBLIC_API_DESIGN.md` for anything touching the future public REST API, wire formats, SDK API surface, or API versioning (design-only, not yet implemented — cf. ADR-025)

## Non-negotiable rules

### Data layer

- **The source of truth is JSON files in `/data`.** SQLite is a derived,
  disposable artifact. Never write code that mutates SQLite at runtime.
- **No property name is hardcoded in application code.** All properties,
  relations, and entity types are discovered through schema files.
- **IDs follow the pattern `type:slug`**, e.g. `character:luffy`,
  `devil-fruit:gomu-gomu`, `manga-chapter:1044`. IDs are immutable. Slugs may
  change (with redirect history).
- **Slugs are kebab-case English only.** URLs use these slugs regardless of
  display locale.
- **Every historisable value carries the four axes**: `since`, `epistemic_status`,
  `event` (optional), `source`. Never lose this metadata.

### Code layer

- **TypeScript strict mode** with `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`. No `any` without a
  comment justifying it inline.
- **Zod schemas are the single source of validation truth.** Generated from
  schema JSON. Used identically client and server.
- **Validation happens at every boundary**: form submit, server function entry,
  build pipeline ingestion. Never trust unvalidated data inside the system.
- **No business logic in UI components.** Logic lives in `/packages` and is
  imported. UI composes data and behavior, it does not implement it.
- **All public functions and exported types have explicit return types.**

### Documentation layer

- **Documentation is updated in the same PR as the code it describes.** A PR
  that changes architecture without updating `/docs` is rejected.
- **New concepts are introduced in `/docs/DATA_MODEL.md` first**, then
  implemented. Not the other way around.
- **Decisions are logged in `/docs/DECISIONS.md`** with date, context,
  options considered, choice, rationale.

## Stack (imposed)

- **Runtime / package manager**: Bun
- **Monorepo orchestration**: Turborepo
- **Web framework (dashboard + preview)**: TanStack Start
- **UI primitives**: Base UI (https://base-ui.com)
- **Styling**: Tailwind CSS v4 (CSS-first config with `@theme`)
- **Validation**: Zod
- **Forms**: React Hook Form + `@hookform/resolvers/zod`
- **State (server)**: TanStack Query (bundled with TanStack Start)
- **Database (build artifact)**: SQLite via `bun:sqlite` for the
  write-side (build pipeline); `better-sqlite3` may be used read-side
  under Node if/when a serverless target requires it (see ADR-012)
- **GitHub integration**: Octokit with a GitHub App
- **Linter**: oxlint
- **Formatter**: dprint (oxfmt under consideration when it stabilises)
- **Type checker**: `tsc --noEmit`, cached via Turborepo
- **Tests (unit)**: `bun test` (the repo standardised on Bun's built-in
  test runner; Vitest was removed — see ADR-030)
- **Tests (e2e)**: Playwright
- **Git hooks**: lefthook
- **Commit convention**: Conventional Commits, enforced by commitlint
- **Dead code detection**: knip in CI
- **Image storage**: Cloudflare R2 (S3-compatible)
- **Deployment**: Vercel

## Anti-patterns to refuse

- Storing SQLite as the source of truth
- Hardcoding property names like `bounty` or `name` in component code
- Running migrations against SQLite (it is regenerated; migrations apply to
  JSON files only)
- Mixing content (translations, narratives) with structure (entities)
- Writing prose summaries directly inside entity JSON files (they belong in
  `/data/universes/<id>/narratives/`)
- Creating "smart" components that know about specific entity types
- Reaching for a runtime database to solve a build-time problem
- Adding a new dependency without justification in the PR description
- Using `any`, `unknown` without narrowing, or `// @ts-ignore` without an
  inline justification and a follow-up issue link
- **Implementing anything from `/IDEAS.md` without first moving it into
  `/docs/ROADMAP.md` and logging an ADR in `/docs/DECISIONS.md`.** IDEAS.md
  is a parking lot, not a backlog.

## Definition of done

A task is done when all of the following are true:

1. Implementation matches the spec written before coding
2. Zod schemas updated if data shape changed
3. Tests written and passing (unit + relevant e2e)
4. `bun run typecheck` passes across the affected workspaces
5. `bun run lint` passes with zero warnings on touched files
6. `bun run format` has been applied
7. **Affected apps build.** If a change can touch the build (deps,
   `apps/dashboard`, vite/nitro config, etc.), run the app build —
   `bun run -F @onepiece-wiki/dashboard build` — before committing.
   CI now runs this too. **Deploy config (`vercel.json`, nitro preset,
   `NITRO_PRESET`) cannot be verified locally** — those changes only
   prove out on the platform, so flag them for human review and never
   merge them blind (lesson from #23: a `vercel.json` `buildCommand`
   change passed every local check but broke the Vercel deployment).
8. Documentation updated (relevant `/docs/*.md` files)
9. CHANGELOG or DECISIONS.md updated if architectural
10. PR description explains the change, the trade-offs, and links to the spec

## Workflow expectations

### Before coding

Always start in **plan mode** for any non-trivial task. Output:

1. A summary of what you understood from the task
2. A list of files you intend to create or modify
3. The order of operations
4. Any ambiguity or decision that needs human input
5. Estimated complexity (simple / moderate / complex)

Wait for explicit human approval before executing the plan.

### During coding

- Make small, focused commits with Conventional Commit messages
- Run typecheck and lint locally before claiming a step is done
- If you discover a need for an architectural decision, **stop and ask**.
  Never decide unilaterally.

### After coding

- Run the full test suite of the affected workspaces
- Self-review the diff
- Verify documentation reflects the change
- Open the PR with a description matching the spec

## When in doubt

- **Do not invent.** If a concept is not in `/docs/DATA_MODEL.md`, do not
  introduce it in code. Propose adding it to the doc first.
- **Do not optimize prematurely.** Build the simplest correct version that
  matches the spec.
- **Ask before refactoring.** Even small architectural shifts must be
  proposed and approved.
- **Prefer deletion over comment-out.** Dead code is worse than missing code.
- **If you think of an architectural improvement during a coding task, add
  it to `/IDEAS.md` and continue with the current scope.** Do not detour
  to implement it; do not propose it as part of the current task. New
  ideas leave the current PR untouched.

## Communication style

- Be concise and direct
- Show the diff before applying complex changes
- Surface trade-offs explicitly
- Flag any rule above that this task would require breaking, with the
  justification, **before** breaking it

This file is the contract. If it is unclear, raise it in the PR rather than
working around it.
