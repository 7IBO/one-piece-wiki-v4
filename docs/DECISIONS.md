# Architectural Decisions

This is the project's Architecture Decision Record (ADR) log. Every
non-trivial architectural decision is recorded here with date, context,
options considered, choice, and rationale.

Format: append new entries at the top.

---

## ADR-023 — Audit + close every reasonable `string` qualifier as an enum

**Date**: 2026-05-17

**Context**: ADR-022 spotted that the `participant` relation's
qualifiers were declared as `value_type: "string"`, defaulting them
to a useless free-text input. A sweep of every other schema file
turned up the same anti-pattern on six more sites — all with
closed-set semantics (blood type, family relation kind, depiction
period, arc role, adaptation coverage, image source origin) that
should never have been free strings.

**Audit result** (each row = one schema upgrade):

| Schema                               | Field                     | Old `value_type` | New  | Vocabulary                                                      |
| ------------------------------------ | ------------------------- | ---------------- | ---- | --------------------------------------------------------------- |
| `property-types/blood_type`          | value                     | string + regex   | enum | `blood-types`                                                   |
| `property-types/source_origin`       | value                     | string           | enum | `source-origins`                                                |
| `relation-types/family-of`           | `relation_kind`           | string           | enum | `family-relations`                                              |
| `relation-types/features-characters` | `role`                    | string           | enum | `arc-roles`                                                     |
| `relation-types/adapts`              | `coverage`                | string           | enum | `adaptation-coverage`                                           |
| `relation-types/depicted-by`         | `period`                  | string           | enum | `depiction-periods`                                             |
| `relation-types/participated-in`     | `side`, `role`, `outcome` | string           | enum | reuse `event-sides`/`event-roles`/`event-outcomes` from ADR-022 |

`participated-in` is the inverse direction of `participant` (same
event-participation semantics) — reusing the ADR-022 vocabularies
keeps the value space consistent across both directions.

**Choice**: promote all seven sites; create six new vocabularies
(the seventh row is a vocab reuse). All values have FR + EN labels.

**Rationale**: same as ADR-022, scaled across the whole catalogue.
Closed enums give the dashboard a dropdown, gate-keep typos at
validation, and make the value space discoverable to contributors
who don't know what other PRs have already chosen as the canonical
spelling.

**Deliberately left as string** (after audit):

- `attribution`, `director`, `url`, `volume` — legitimately freeform
  (proper nouns, URLs, free text).
- `birthday` — keeps its regex constraint (`MM-DD`); an enum of 366
  values would be wrong.
- `depicted-by.context`, `name.context`, `epithet.context` —
  freeform narrative ("during the Marineford speech"); not enum-able.
- `clarifies-fact.property_name` — points at a property id in the
  schema registry, not a vocabulary value. An enum here would force
  manual sync every time a property is added/removed; better solved
  by a future autocomplete UI than by a vocabulary.
- `canonical_elements` — ambiguous semantics (no existing data, no
  doc), deferred until the field's contract is settled.

**Consequences**:

- Six new vocabulary files under `data/schemas/vocabulary/`
  (blood-types, source-origins, family-relations, arc-roles,
  adaptation-coverage, depiction-periods).
- Seven schema files modified (two properties, five relations).
- `blood_type`'s `schema_version` bumped 2 → 3, `source_origin`'s
  bumped 1 → 2 (semantic change to `value_type`).
- One existing data value already matched its new enum
  (`relation_kind: "sworn_brother"`); no other migration needed.
- `bun run validate` passes (30 entities still green).
- `bun run schema:check`: 30 → 36 vocabularies.

---

## ADR-022 — Close `participant` qualifiers as enums

**Date**: 2026-05-17

**Context**: The `participant` relation type (event → character/crew)
declared its three qualifiers — `role`, `side`, `outcome` — as
`value_type: "string"`, so the dashboard rendered them as plain text
inputs. Contributors had no autocomplete, no validation, and no
guidance on what values were already in use across the corpus. In
practice the existing data already used a closed-ish vocabulary:
`rescuer`, `survived`, `subject`, `awakened`, `captive`, `killed`
plus one inconsistency (`whitebeard-allies` with a hyphen vs.
snake_case everywhere else).

**Choice**: Promote the three qualifiers to `value_type: "enum"`
backed by three new vocabularies under
`data/schemas/vocabulary/`:

- `event-roles` (subject, combatant, rescuer, captive, …)
- `event-sides` (marines, whitebeard_allies, shichibukai, …)
- `event-outcomes` (survived, killed, awakened, captured, …)

Existing data migrated: `whitebeard-allies` → `whitebeard_allies`
to match the snake_case enum convention used by every other
vocabulary in the catalogue.

**Rationale**: free-string qualifiers don't scale — every
contributor invents their own term and the data becomes
ungroupable. Closed enums give the dashboard a dropdown (with
French + English labels), let the schema flag typos at validation,
and keep the value space discoverable. The 15–18 values per
vocabulary cover every existing usage with room for the next few
arcs without further schema changes.

**Consequences**:

- Three new files under `data/schemas/vocabulary/`.
- `data/schemas/relation-types/participant.json` switches qualifier
  `value_type` from `string` to `enum` + adds `enum_ref`.
- `data/.../entities/event/battle-of-marineford.json` gets a one-character
  data migration (hyphen → underscore).
- `bun run validate` passes (30 entities still green).
- **Open question for later**: `side: "captive"` is semantically more
  of a role than a side. The current data shape is preserved, but a
  follow-up could re-classify Ace as
  `side: whitebeard_pirates, role: captive`. Out of scope here.

---

## ADR-021 — Bulk per-source cast saves (one PR, many entity files)

**Date**: 2026-05-17

**Context**: The apparitions hub (per-source cast manager at
`/sources/$type/$slug`) lets a contributor add/remove N characters
from a single chapter, episode, film, etc. The natural unit of edit
is the **source**, but the actual mutations land on N separate
character (/devil-fruit/crew/…) entity files — each gains, loses, or
re-qualifies an `appears-in` relation. Every existing save flow in
`packages/github-client` keys the PR off a single entity (`Edit
character:luffy` → one entity's files in one PR). Reusing that flow
N times would open N parallel PRs for what the contributor sees as
one action.

**Options**:

- A — **Loop `submitEntityEdit` once per touched entity.** N PRs per
  cast change. Trivial to ship, terrible to review (mass of PRs all
  titled differently, no grouping).
- B — **Single PR, single commit, source-titled** — extend
  `commitMultipleFiles` (already used for entity + translations) to
  carry N _independent_ entity files in one commit, then open one PR
  titled `[DATA] Update cast of <sourceId>`.
- C — **Server-side queue that batches per source per N seconds** and
  opens one PR per batch. Solves the problem but adds a stateful
  worker — incompatible with our stateless-functions deployment model.

**Choice**: B.

**Rationale**:

- The Git Data API path (`commitMultipleFiles`) already handles
  N-file commits cleanly — same blob/tree/commit dance, just N
  blob entries instead of two. No new primitive.
- PR title reflects the contributor's mental model ("I changed
  Chapter 1's cast"), not the storage model ("I touched 5 character
  files"). Reviewer sees the cast change as a unit.
- Optimistic-lock check generalises naturally: per-file SHA check
  before commit, surface all conflicting paths in a 409 so the UI
  can prompt "reload the cast page".

**Consequences**:

- New flow `submitSourceCastEdit` in `packages/github-client/src/
  save-flow.ts` — branch `cast/<source-id>/<ts>`, message `Update
  cast of <sourceId>`, PR title `[DATA] Update cast of <sourceId>`,
  body lists each touched entity + diff blocks (reusing
  `renderDiffBlock`). Adds new label `apparitions` alongside `edit`
  / `via-dashboard` / `area:data`.
- New server endpoints in `apps/dashboard/api/server.ts`:
  - `GET /api/sources/:type/:slug/cast` — reverse-scan the in-memory
    catalogue for `appears-in` relations targeting this source,
    return grouped by entity type.
  - `POST /api/sources/:type/:slug/cast` — bulk apply
    `{add: [...], remove: [...]}` against the catalogue snapshot,
    validate every resulting entity, hand the file list to
    `submitSourceCastEdit`.
- **Deferred for v1**: resume-PR for cast saves (each save opens a
  fresh PR). The existing `findOpenPRForEntity` is keyed by
  `entityId` and won't match a source-titled PR. Acceptable —
  apparitions edits are typically one-shot ("I just watched the
  episode; here's everyone in it") rather than incremental.
- **Conflict UX**: if 2 contributors edit the same cast and their
  diffs touch the same character file, the 2nd save returns a 409
  citing the conflicting paths. The UI surfaces a toast + a
  "Refresh cast" affordance. Same SHA-based primitive as
  `OptimisticLockError`, just plural.

---

## ADR-020 — Entity creation from the dashboard

**Date**: 2026-05-17

**Context**: Phase 4's roadmap line item #3 listed a `/types/:type/
new` route from the start, but it was never wired — the dashboard
today only edits entities that already exist on disk. Adding a new
character means hand-writing the JSON file and committing as a
maintainer, which blocks every contribution scenario that isn't an
edit of something extant.

The flow is mechanically close to entity edit (same form, same
schema validation, same PR-via-`submitEntityEdit` pipeline) except
for two new wrinkles: the file doesn't exist yet (no `expectedSha`),
and the slug must be validated for both format and uniqueness
**before** the PR is opened.

**Options**:

- A — **Treat creation as a special form of edit** with
  `expectedSha: null` and rely on the existing `submitEntityEdit`
  to do the right thing on a missing file. Slug uniqueness checked
  server-side against the in-memory catalogue snapshot before the
  Git Data API write.
- B — **Dedicated `createEntity` server flow** (separate PR title,
  separate label) so review tooling can filter "new" vs "edit"
  contributions distinctly.

**Choice**: A with a label refinement.

**Rationale**:

- `submitEntityEdit` already handles the "file doesn't exist"
  branch correctly — `getFile` returns null on 404, the
  `expectedSha !== null` guard short-circuits, `commitMultipleFiles`
  uses the Git Data API which creates blobs/trees unconditionally.
  No `packages/github-client` changes required.
- A second label `new-entity` (alongside `edit`, `via-dashboard`,
  `area:data`) gives review tooling the discrimination capability
  without forking the save path. Reviewers can also distinguish via
  the PR title (`[DATA] Create character:foo` vs `[DATA] Edit
  character:foo`).

**Consequences**:

- New endpoint `POST /api/entities/:type` in `apps/dashboard/api/
  server.ts`. Body shape mirrors `PUT /api/entities/:id`'s `payload`
  - `translations`, plus an explicit `slug` field. Validation:
  * kebab-case via `SlugSchema`
  * uniqueness via in-memory snapshot scan
  * data shape via `buildEntitySchema(type, …).safeParse`
- `submitEntityEdit` called with `expectedSha: null` and a new
  optional `commitVerb: 'Create' | 'Edit'` so the PR title reads
  `[DATA] Create character:foo` rather than `[DATA] Edit
  character:foo`. Label `new-entity` added when verb is `Create`.
- New route `apps/dashboard/src/routes/types.$type.new.tsx` —
  wraps `EntityForm` with blank initial state + new `SlugInput`
  component (live regex + uniqueness check via TanStack Query).
- "+ New" button on `types.$type.index.tsx` next to the table-view
  link. Mobile-friendly per the same primitives as the rest of the
  contribution surface (`MobileSheet`-aware, ≥44px touch target).
- **Catalogue snapshot lag** (per ADR-019): the new entity won't
  appear in the dashboard's bundled data source until Vercel
  rebuilds. After PR opens, the UI surfaces a banner — "Your entity
  is in PR #N; it'll appear in the catalogue after merge + deploy"
  — instead of redirecting blindly to `/types/$type/$slug` (which
  would 404 until the next deploy).
- **Slug-conflict-with-open-PR** (rare): the snapshot is built from
  `main`, so a slug claimed by an in-flight PR but not merged yet
  won't fail the uniqueness check. The Git Data API write will
  succeed (different branch), but the second contributor's PR will
  conflict on merge with a clear file-already-exists error.
  Acceptable for v1 — no silent corruption, just a merge prompt.

---

## ADR-019 — Bundle `/data` into the dashboard SSR output for serverless deploys

**Date**: 2026-05-17

**Context**: ADR-018 migrated the dashboard to TanStack Start +
Nitro, producing a `.output/server/index.mjs` Node bundle that
runs on Vercel. First deploy attempt crashed: the API handler
calls `loadSchemas()` / `loadEntities()` from `@onepiece-wiki/
schema-engine`, which `node:fs.readdir` and `node:fs.readFile`
the `data/universes/**/*.json` tree at runtime. Vercel serverless
functions don't have access to repo source files — the bundler
only ships what's imported.

Side effect at module init: the dashboard's `apps/dashboard/api/
server.ts` was also calling `loadConfig()` eagerly which tried to
read a `.pem` file from disk. Same root cause — fs-based config
on a no-fs platform.

**Options**:

- A — **Bundle `data/` as static assets and read via HTTP at
  runtime** through Nitro's `publicAssets`. Adds a network hop
  per read and exposes the raw JSONs publicly. Wrong shape for
  a private editing tool.
- B — **Fetch from GitHub at runtime** via Octokit's
  `repos.getContent`. Adds latency + rate-limit risk for every
  page load. Defeats the "snapshot of main" model.
- C — **Bundle `data/` into the SSR JS** via Vite's
  `import.meta.glob('../../../data/**/*.json', {eager:true,
  query:'?raw'})`, then feed the resulting in-memory map to a
  custom `DataSource` adapter. The schema-engine's loaders read
  from that source instead of `node:fs`. Each Vercel function
  carries its own copy of the data tree, refreshed on every
  deploy.

**Choice**: C.

**Rationale**:

- **Read-only data on the dashboard side.** Every dashboard read
  (schemas, entity lists, single entities, translations) is a
  snapshot of `main`. Writes always go through GitHub PRs, never
  touch the local filesystem. So a snapshot-on-deploy model is
  semantically correct — no live writes to miss.
- **Vite already compiles + bundles JS for the SSR output.**
  Adding ~few hundred KB of JSON to that bundle (gzipped) is
  cheap compared to the ~700KB of `@aws-sdk/client-s3` already
  shipping in the same bundle.
- **One-line conditional in the dashboard** (`PROD ? bundle :
  fs`). Schema-engine consumers outside the dashboard (CLI,
  build pipeline) keep using the fs default unchanged.
- **No new dependency.** `import.meta.glob` is built into Vite,
  `inMemoryDataSource` is ~40 lines in `schema-engine`.

**Consequences**:

- New file `packages/schema-engine/src/data-source.ts` exports:
  - `DataSource` interface (`listJsonFiles`, `readTextFile`,
    `listSubdirectories` — the subset of `node:fs/promises` the
    loaders actually call).
  - `fsDataSource` — default implementation reading from the
    real filesystem. Preserves the original behaviour for every
    CLI and the build pipeline.
  - `inMemoryDataSource(files: Record<absPath, string>)` —
    builds a source from a pre-loaded path-to-content map.
    Used by the dashboard's Vite-glob path.
- `loadSchemas` and `loadEntities` gain an optional `source:
  DataSource = fsDataSource` parameter. Backward compatible —
  every existing call still works.
- New file `apps/dashboard/api/data-source.ts` exports
  `dashboardDataSource`, picked at module load:
  - `import.meta.env.PROD === true` → calls `import.meta.glob`,
    normalises the relative keys back to absolute REPO_ROOT
    paths, wraps in `inMemoryDataSource`.
  - Otherwise → `fsDataSource` (dev + legacy `bun api/server.ts`
    standalone).
- `apps/dashboard/api/server.ts` passes `dashboardDataSource` to
  both `loadSchemas` and `loadEntities`, and uses
  `dashboardDataSource.readTextFile` for translation lookups
  (the only direct `node:fs.readFile` call left in the file).
  `node:fs/promises` import dropped entirely.
- `vite.config.ts` picks the Nitro preset via env: `vercel`
  when `VERCEL` is set (Vercel always sets it on build), else
  `node-server` for local + VPS. `NITRO_PRESET` env overrides
  both.
- `vercel.json` at the repo root: `buildCommand=bun install &&
  bun run -F @onepiece-wiki/dashboard build`,
  `outputDirectory=apps/dashboard/.output`, `framework=null`
  (we use Vercel's Build Output API v3 via Nitro, no
  framework auto-detect).
- `.env.example` documents the
  `GITHUB_APP_PRIVATE_KEY_PATH` (local) vs
  `GITHUB_APP_PRIVATE_KEY` (inline, Vercel) split. The loader
  already supported the inline form; the comment makes the
  Vercel path discoverable.

**Refresh model**: any edit merged to `main` on the data repo
re-triggers Vercel's build → new SSR bundle → new in-memory
data snapshot. Latency from "PR merged" to "dashboard updated"
is whatever the Vercel build takes (~30s for the first build,
faster on subsequent if Turbo cache hits).

**What this ADR doesn't unblock yet**: the GitHub App webhook
(if/when we wire one) needs a stable HTTPS endpoint — which
Vercel provides — but the webhook handler isn't built yet.
Tracked in ROADMAP Phase 7+.

---

## ADR-018 — Migrate dashboard from Vite + standalone Bun API to TanStack Start

**Date**: 2026-05-17

**Context**: The dashboard had drifted from the stack declared in
CLAUDE.md ("Web framework: TanStack Start") to a Vite-SPA + sidecar
Bun process. Two consequences:

- **Vercel deploys broken.** Vite emits static files; the Bun API
  process has no host in a Vercel project. Hitting `/api/*` on a
  deployed build returned 404 because the SPA fallback shipped
  HTML for routes the SPA didn't know about.
- **Two dev processes.** `concurrently` ran `vite` + `bun --hot
  api/server.ts` in parallel, with a Vite proxy mapping `/api/*`
  to `127.0.0.1:4101`. If either crashed the other limped along,
  and on Windows the IPv4/IPv6 resolution of `localhost`
  occasionally broke the proxy silently.

The user explicitly asked to "migrate to option B" (TanStack Start)
to unblock Vercel deployment and re-align with the stated stack.

**Options**:

- A — **Server functions (`createServerFn`).** Convert every
  `/api/*` handler into a TanStack Start server function called
  from React via RPC. Removes the HTTP boundary; `api.ts`'s
  `fetch('/api/foo')` calls become `myServerFn({data})`. Refactor
  touches every endpoint + every caller.
- B — **Server routes (`createFileRoute('/api/foo')({server:
  {handlers: {GET, POST}}})`).** File-based HTTP handlers
  alongside UI routes. The frontend keeps using `fetch('/api/foo')`
  unchanged. Refactor is one catch-all file + auto-generation
  wiring; everything else moves.
- C — Drop Start entirely, keep two hosts (Vite on Vercel + Bun
  somewhere else). Cheap deploy, eternal dual-stack maintenance.

**Choice**: B (server routes), with a minimal-diff approach: a
single catch-all `src/routes/api/$.ts` that forwards every
`/api/*` request to the existing `handleApiRequest` export of
`apps/dashboard/api/server.ts`. ~15 endpoints stay in one file
with shared rate-limit map, session guards and admin checks; only
the entrypoint changed.

**Rationale**:

- Matches the docs at
  https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
  verbatim. The official `examples/react/start-basic` template uses
  the same `tanstackStart() + nitro()` pair and the same
  `createFileRoute(...)({server:{handlers}})` pattern we now have.
- Preserves the HTTP frontier (curlable endpoints, clean separation
  between API contract and UI code) that Option A would have
  dissolved.
- Auto-generated `routeTree.gen.ts` carries the type augmentation
  that makes `server: {handlers}` a valid option on
  `createFileRoute` — the hand-maintained tree we had pre-migration
  was the reason an initial attempt at this migration typechecked
  as "server does not exist". Letting the plugin own the file
  unblocks the API.
- Nitro produces a Vercel-compatible `.output/` bundle out of the
  box; `bun run build` then `node .output/server/index.mjs` runs
  the SSR + API server with zero per-platform configuration.

**Consequences**:

- New deps: `@tanstack/react-start@^1.168`, `nitro@^3` (devDep).
  Bumped `@tanstack/react-router` to ^1.170.
- New plugins in `vite.config.ts`: `tanstackStart({ srcDirectory:
  'src' })` and `nitro()`. Order matters: `tailwindcss` →
  `tanstackStart` → `react` → `nitro` (mirrors the official
  template).
- Scripts collapsed: `dev` is now `vite dev` (no more
  `concurrently`); `build` is `vite build` (emits SPA + Nitro
  server bundle); `start` is `node .output/server/index.mjs`.
- Files removed: `apps/dashboard/index.html`, `src/main.tsx`,
  the hand-maintained `src/routeTree.gen.ts`. The plugin
  regenerates `routeTree.gen.ts` on every save under `src/routes/`.
- Files added:
  - `src/router.tsx` exporting `getRouter()` (Start hook).
  - `src/routes/api/$.ts` — splat catch-all whose `server.handlers`
    forward every method to `handleApiRequest`.
  - `__root.tsx` now uses `shellComponent: RootDocument` returning
    a full `<html>`/`<body>`; the original app chrome moves into
    an `AppChrome` child that takes `children` (the matched route's
    output).
- `api/server.ts` refactored: the inner `Bun.serve({ fetch })`
  body is now the exported `handleApiRequest(req)`. The standalone
  `Bun.serve` is gated on `import.meta.main` so `bun api/server.ts`
  still works for debug scripts.
- Cross-runtime fix: `import.meta.dir` (Bun-only) → a `HERE`
  helper that prefers `import.meta.dirname` then falls back to
  `fileURLToPath(import.meta.url)`. Without this fix, the Nitro
  SSR bundle blew up at import time with "paths[0] must be a
  string" because Node doesn't populate `import.meta.dir`.
- Backwards-compat tax: `dev:api-legacy` script kept around for
  anyone who still wants `bun --hot api/server.ts` standalone.

**Vercel deploy — caveat that didn't ship in this ADR**: the
SSR-bundled server reads `data/universes/**/entities/*.json` at
runtime via `node:fs/promises`. Vercel serverless functions don't
share a filesystem with the build artefact, so the entity JSONs
need to either be (a) bundled into the function output, (b)
fetched from GitHub at runtime, or (c) replaced by the pre-built
SQLite from the data pipeline. Out of scope for this ADR; tracked
in `/IDEAS.md` for now.

**SPA-only routes**: setting `defaultSsr: false` on the router is
NOT supported in the installed Start version (option doesn't exist
on `RouterConstructorOptions`). The dashboard renders SSR by
default; pages that depend on browser-only globals (`window`,
`localStorage`, `BroadcastChannel`) already guard with
`typeof window !== 'undefined'` checks and `useEffect`-deferred
access, so SSR works without further changes.

---

## ADR-017 — Revert better-auth, keep stateless signed-cookie sessions

**Date**: 2026-05-16

**Context**: ADR-016 adopted `better-auth` (with its `anonymous`
plugin + `github` social provider) and a SQLite session store at
`apps/dashboard/.auth.db`. Within hours of shipping that, we
realised the cost / benefit didn't actually work out for our shape:

- **What better-auth gives us that we use**: stable identity in the
  cookie + `anonymous` plugin convenience. That's it.
- **What better-auth gives us that we don't use**: server-side
  session revocation (we have BLOCKED_GITHUB_USERNAMES instead),
  multi-device session sync (no UI), refresh token management (we
  don't call the user's GitHub token — writes go through the App
  installation), `linkAccount` anonymous→GitHub upgrade
  (not asked for), `/api/auth/get-session` exposed user shape
  (we override with our own projection anyway).
- **What better-auth costs us**: a new dependency (~70 transitive
  packages), a SQLite runtime DB the dashboard now needs to
  provision + migrate (`bun run auth:migrate`), and — critically —
  **incompatibility with Vercel-serverless deployment** without
  swapping the adapter to Turso / Neon / Vercel Postgres.

The user explicitly questioned the DB requirement. After confirming
that better-auth has no stateless mode — every adapter persists
user/session/account rows, and the `jwt()` plugin is additive rather
than a replacement — we decided the trade-off no longer made sense
for a hobby wiki.

**Options**:

- A — Keep better-auth and accept the SQLite/Turso requirement at
  deploy time. Pay the dependency cost now to keep flexibility for
  features we might want later (account linking, multi-device,
  refresh-token-using OAuth).
- B — Revert to hand-rolled signed-cookie sessions, extended with a
  discriminated union (`kind: 'github' | 'anonymous'`) so the
  anonymous flow doesn't need a separate code path.

**Choice**: B. Revert.

**Rationale**:

- Every user-facing feature shipped under ADR-016 (login page,
  contributions panel, Contributors PR body, server-side identity,
  drop Co-authored-by) keeps working unchanged — they were
  features of OUR code, not of better-auth.
- The stateless cookie carries `{kind, login|nickname, expiresAt}`,
  HMAC-signed with `SESSION_SECRET`. That's the entire session
  layer. ~150 lines in `session.ts`, ~80 lines of OAuth glue in
  `server.ts`.
- No runtime DB to provision. Deploys to Vercel serverless with no
  changes; deploys to a single Bun process on a VPS with no
  changes; no schema migrations to manage.
- The features better-auth enables that we sacrifice (revocation,
  multi-device, account linking) we don't ship anyway. When/if we
  ever need them, we can re-adopt better-auth — the codebase
  already knows that shape.

**Consequences**:

- Dependency `better-auth` removed; `@octokit/auth-oauth-user`
  restored on `packages/github-client` (powers `exchangeCode`).
- `apps/dashboard/api/session.ts` is back, rewritten with:
  - Discriminated union `Session = github | anonymous`
  - `base64url` encoding (RFC-clean, no `+` / `/` to URL-encode in cookies)
  - `timingSafeEqual` for signature comparison
  - Production assert: `SESSION_SECRET` is mandatory in
    `NODE_ENV=production`
  - 30-day TTL (was 8h) so a sporadic contributor finds their open
    contributions on return
- `apps/dashboard/api/auth.ts` is now ~20 lines: a re-export of
  `Session` as `DashboardSession` + the `readDashboardSession(req)`
  cookie reader. The route handlers never see the cookie format.
- New endpoints in `server.ts` (under `/api/auth/*`):
  - `GET  /api/auth/login/github` (302 to GitHub)
  - `GET  /api/auth/callback/github` (exchange + cookie + 302 home)
  - `POST /api/auth/anonymous` (validate pseudo + cookie)
  - `POST /api/auth/sign-out` (clear cookie)
  - `GET  /api/auth/me` (projection)
- Env var rename: `BETTER_AUTH_SECRET` → `SESSION_SECRET`.
  Anyone who set the better-auth one needs to rename it (a one-line
  update in `.env.local`).
- `apps/dashboard/.auth.db*` removed from `.gitignore` (no DB to
  ignore anymore).
- ADR-016 stays in the log for historical reference; this entry
  supersedes it.

---

## ADR-016 — Adopt better-auth; drop hand-rolled session + Co-authored-by trailer

**Date**: 2026-05-16

**Context**: ADR-015 opened writes to unauthenticated visitors via a
self-chosen pseudo passed in the save body. That worked but had two
gaps:

1. **No persistent identity across visits.** The pseudo was only a
   field on each request, so a returning contributor couldn't see
   "their" in-progress PRs without re-typing the exact same pseudo and
   the dashboard couldn't pre-fill anything from a prior session.
2. **Two auth code paths**, neither fully baked: a hand-rolled
   signed-cookie session (`apps/dashboard/api/session.ts`) for GitHub
   logins, and the bare-pseudo-in-body path for everyone else.

The user-facing ask was: "I want a login page with anonymous-with-pseudo
OR GitHub, and I want to come back the next day and find my
unmerged contributions."

**Options**:

- A — Extend the hand-rolled session: add `kind: 'github' | 'anonymous'`
  to the cookie, write the pseudo flow ourselves, layer CSRF /
  session-rotation / token-refresh on top as we discover we need them.
- B — Adopt `better-auth` (with its `anonymous` plugin + `github`
  social provider) and delete the hand-rolled session layer.

**Choice**: B (better-auth).

**Rationale**:

- The hand-rolled session covered ~30% of what a real auth lib does
  (sign + verify cookie). Refresh, rotation, CSRF, multi-device, and
  account linking would all need to ship as we needed them — death
  by a thousand cuts.
- `better-auth`'s `anonymous` plugin gives us a server-issued session
  for pseudo users with zero PII (no email, no link to an external
  identity), and its `socialProviders.github` covers OAuth without
  us needing to wrap `@octokit/auth-oauth-user` ourselves.
- The "find my open contributions" feature is trivial once identity
  lives on a stable session cookie — we just search the data repo
  for PRs whose body mentions the contributor.
- Cost we accept: one new dependency (~70 transitive packages) and a
  SQLite session store at `apps/dashboard/.auth.db` (gitignored).

**PR body attribution change** (rolled in here because it ships
alongside): drop the `Co-authored-by:` trailer entirely. Previously,
authenticated users got a trailer on every commit so their GitHub
contribution graph would show the edits. In practice this surfaced as
"a wall of commits authored by the bot, co-authored by me" which
nobody found useful, and the asymmetry vs anonymous users (no trailer)
created an unwanted "first-class vs second-class" reading. The bot is
now the sole listed author on every commit; the contributor is named
once, in the PR body's `Contributors` section:

- GitHub: `- @login` (renders as a clickable mention)
- Anonymous: `- **Pseudo** _(anonymous contributor)_` (bold plain
  text, NO `@`, so a reviewer can never confuse it for a real handle)

**Consequences**:

- A new SQLite DB at `apps/dashboard/.auth.db` is the dashboard's only
  stateful storage. Lost = everyone signed out, no data loss otherwise.
  Schema bootstrapped by `bun run auth:migrate` (programmatic, no CLI
  toolchain needed — see `api/auth-migrate.ts`).
- `BETTER_AUTH_SECRET` becomes a required production env var. A dev
  fallback gets generated at boot so `bun run dev` keeps working out
  of the box, at the cost of "every restart logs everyone out".
- Save endpoint now REQUIRES a session (anonymous or GitHub). Visitors
  who skip the login page see the save button disabled with a
  "Sign in to save" link. Read endpoints stay 100% public.
- The hand-rolled OAuth wrappers `authorizeUrl` / `exchangeCode` in
  `packages/github-client/src/oauth.ts` are deleted along with the
  `@octokit/auth-oauth-user` dependency. The `isAdmin` allow-list
  check stays in that file (used in two packages).
- New endpoint `GET /api/me/contributions` (and the home-page panel
  consuming it) lists the session's open dashboard-labelled PRs.
  Anonymous match is `**Pseudo**` substring, GitHub match is
  `- @login` substring; both filter to PRs labelled `via-dashboard`
  so coincidental body matches don't leak.

**Resume editing — shipped** (this section was previously marked
"deferred to a follow-up"; that follow-up landed). When a contributor
revisits an entity they already have an open PR on, the dashboard:

- detects the open PR via `findOpenPRForEntity(octokit, cfg, identity,
  entityId)` — title-exact `Edit <type>:<slug>` + the `via-dashboard`
  / `anonymous` label + the contributor's bullet (`- @login` or
  `**Pseudo**`);
- serves `data` + `translations` off the PR's head branch on
  `GET /api/entities/:type/:slug` so the form opens on the in-flight
  state, not on `main`;
- routes `POST /api/entities/:type/:slug` saves through the new
  `existingPR` mode of `submitEntityEdit`, which skips `createBranch`
  - `openPullRequest` and just appends a commit to the existing head
    branch;
- returns `{pr.reused: true}` so the dashboard's toast says
  "Commit ajouté à PR #N" instead of "PR #N ouverte" and a banner
  at the top of the entity page links the user to the open PR.

The "1 PR per entity per contributor" invariant is preserved: a
contributor cannot accidentally fan out parallel PRs by editing the
same entity twice. The lookup is best-effort — if GitHub's search
index lags or the call fails, the server falls back to opening a new
PR rather than blocking the save.

---

## ADR-015 — Open contributions with two-stage R2 + admin moderation queue

**Date**: 2026-05-16

**Context**: Phase 4 ships a dashboard that's effectively
admin-only — the OAuth callback rejects any login not in
`ADMIN_GITHUB_USERNAMES`. The maintainer wants to accept
contributions from anyone with a GitHub account: data edits AND
image uploads, with validation gated by a small admin set
(currently the maintainer alone, login `7IBO`).

Three concerns immediately surface:

1. **Identity / authorization.** Today's binary "in the list or
   out" check needs to become a tier system: visitors (read-only),
   contributors (open PRs that must be reviewed), admins (review +
   merge + block other contributors). Anonymous contributions
   would be a spam vector; GitHub OAuth as the identity layer keeps
   the cost of trolling non-zero.

2. **Image storage.** The current pipeline puts every PUT
   immediately on the public R2 CDN. With non-admins uploading,
   that means unvetted content is publicly accessible the instant
   the upload finishes, even if the maintainer never approves it.
   Worse, R2 has no lifecycle rule on the bucket, so closed PRs
   leave orphan bytes forever.

3. **Review surface.** GitHub's PR UI shows JSON diffs and image
   links but not a rendered preview of the entity post-merge nor a
   visual preview of staged images. The dashboard already computes
   a structured `DiffPopover` for unsaved changes; that same
   renderer can drive an admin-only `/admin/queue` route for
   triaging the backlog.

**Options considered**:

- **A — Stay admin-only.** Forever. Reject the request; rely on
  trusted maintainers only. Solves the moderation problem by
  refusing to have one. Caps the project's contributor pool at
  whoever the maintainer trusts directly. Not what the maintainer
  asked for.

- **B — Open + naive (no two-stage, no queue).** Drop the admin
  check on auth, let contributors hit the existing
  `/api/uploads/presign` and `/api/entities/:type/:slug` endpoints,
  rely entirely on PR review on GitHub. Cheap to implement but
  publishes raw uploads to the public CDN immediately and gives
  the maintainer no batch-review tooling.

- **C — Open + two-stage R2 + custom admin queue** (the
  recommendation). Three auth tiers in code, two R2 prefixes
  (`pending/` private + `images/` public), promotion driven by PR
  merge webhook, custom moderation UI for the admin. Split into
  four shippable sub-phases (see ROADMAP Phase 7).

- **D — C + active content moderation** (NSFW / copyright /
  fingerprinting). Adds an automated check service to every
  upload, blocking submission past a threshold. Extra cost
  (monetary + latency + false-positive handling). Overkill for an
  invite-only community-of-readers scale; revisit when contributor
  growth makes it warranted.

**Choice**: C, with the staging-prefix variant rather than
two-bucket. Phase 0 (lock admin set to `7IBO`) is config-only and
ships immediately; the remaining sub-phases (7.1 R2 two-stage, 7.2
auth opening, 7.3 admin queue) ship in order.

**Promotion path — revised**: the initial 7.1 implementation
shipped with a GitHub Actions workflow (`promote-images.yml`)
triggered on push to main. That was replaced before any production
use with a **dashboard-driven** promotion: the
`/api/admin/promote` endpoint encapsulates the full
"copy bytes + rewrite URLs on the PR branch + squash-merge"
sequence, called from the admin queue UI (Phase 7.3) or, until
that ships, directly by the maintainer. Rationale: a single admin
(7IBO) means GitHub's review UI isn't where merges happen — the
queue UI is. Driving promotion from the queue removes a class of
race (merge-but-promote-hasn't-run-yet), keeps the bytes off the
public CDN until an explicit human OK, and centralises the
"validation/transformation" surface (resize, optimize, NSFW
later) in one server module. The build guard in
`packages/schema-engine/src/cli/validate.ts` remains, so any
out-of-band merge still fails CI before bad data lands.

**Anonymous writes — revised**: the maintainer revised the auth
model again before 7.2 shipped: **unauthenticated users CAN
write** (modify data + upload images). Drops the GitHub-login
prerequisite that Option B explicitly rejected. The rationale is
Wikipedia-style: the barrier to "I want to fix one typo" should
be near-zero, and PR review remains the gate that prevents bad
data from landing.

**Anonymous attribution — revised**: the first 7.2 implementation
embedded a salted-SHA hash of the source IP in the PR body for
spam correlation. Reviewed and pulled back over privacy concerns
(hashed IPs are still personal data under EU law if the salt is
reachable). Replaced with a **self-chosen optional nickname**
prompted in the save bar when no GitHub session is attached. The
nickname is:

- a plain string the contributor types in (or doesn't);
- persisted to localStorage so a returning anonymous contributor
  doesn't have to re-type;
- surfaced in the PR body verbatim with NO `@` prefix so it can't
  be mistaken for a GitHub handle;
- length-capped (32 chars) and character-set restricted (letters /
  digits / dash / underscore / dot / space) server-side.

The dashboard server still uses the client IP for in-memory
rate-limiting + the `BLOCKED_IPS` kill-switch, but no IP-derived
value ever leaves the process. Spam correlation degrades from
"two PRs from same IP hash" to "two PRs from same self-chosen
nickname" — weaker, but a determined spammer rotates IPs anyway,
and the simpler model has zero personal-data surface.

Tiers become four, not three:

| Tier              | Identity                                  | Writes         | Co-authored-by  | Auto-merge eligible |
| ----------------- | ----------------------------------------- | -------------- | --------------- | ------------------- |
| **Anonymous**     | none                                      | yes            | none (bot only) | never               |
| **Contributor**   | GitHub-authenticated, any login           | yes            | contributor     | never               |
| **Admin (write)** | login in `ADMIN_GITHUB_USERNAMES`         | yes            | admin           | yes                 |
| **Admin (mod)**   | same login, calling admin queue endpoints | merge / reject | n/a             | n/a                 |

Consequences of opening to anonymous writes:

- **Rate-limit per IP** for anonymous saves + presign-upload (the
  dashboard's only handle on identity). Defaults: 10 anonymous
  PRs / hour / IP, 20 anonymous uploads / hour / IP. Tunable as
  env vars; abusive IPs get blocklisted.
- **`Co-authored-by` skipped** when the writer is anonymous. The
  PR is fully attributed to the GitHub App's bot identity. PR
  body shows the contributor's self-chosen nickname (if any) as a
  plain string — never as `@nickname`. See "Anonymous
  attribution — revised" below for why we don't use IP hashes.
- **`BLOCKED_GITHUB_USERNAMES`** no longer covers the abuse
  surface alone; it still works for authenticated trolls but
  anonymous abuse needs the IP rate-limit + a `BLOCKED_IPS` env
  var (also added). Defer captcha (Cloudflare Turnstile or
  similar) until volume forces it.
- **Auto-merge workflow** already requires an admin
  `Co-authored-by` to fire — anonymous PRs naturally don't
  qualify. No workflow change needed.
- **Image uploads stay staging-only** until the admin promotes
  via the queue UI. The anonymity tier doesn't change the
  storage model; it just lowers the bar to _upload to the
  staging area_.

The build guard + dashboard-driven promotion remain the canonical
"nothing reaches main without admin OK" path, anonymity or not.

**Rationale**:

- **Three tiers, not two**: a contributor IS materially different
  from an admin (can propose, can't approve) and pretending
  otherwise pushes the moderation problem onto manual GitHub PR
  triage, which the maintainer has correctly identified as
  insufficient.
- **Two-stage storage**: separating "uploaded" from "approved
  bytes" mirrors how every CMS handles user-generated content
  (WordPress media library has pending status, Notion has draft
  blocks, etc.). It's the cheapest mechanism that gives the
  maintainer the option to NOT publish without manual cleanup.
- **PR as the source of truth**: even with a custom admin UI, the
  merge action goes through the GitHub API. PRs stay
  reviewable / commentable / revertable through the normal GitHub
  surface, and a power user (the maintainer) can bypass the
  queue UI and review on GitHub directly when convenient.
- **Phased rollout**: each sub-phase is shippable independently
  and reverses the risk cleanly:
  - 7.0 (lock admin set) is reversible by changing an env var.
  - 7.1 (two-stage R2) is invisible to admin users (they still
    upload normally; staged + promoted in their merge flow).
  - 7.2 (open auth) is the moment the surface gets exposed; can be
    rolled back to admin-only by re-adding the
    `ADMIN_GITHUB_USERNAMES` check on `/auth/me`.
  - 7.3 (admin queue UI) is purely additive — GitHub PR review
    remains the fallback.
- **Defer active moderation (Option D) explicitly**: trust the
  admin + PR review for the foreseeable contributor scale.
  Revisit when (a) contributor count > 20 OR (b) the first
  inappropriate-upload incident makes the case.

**Consequences**:

- A new R2 prefix `pending/` requires a lifecycle rule (auto-purge
  > 14 days) and a webhook-driven promotion workflow. Both add
  > ops surface area, but the alternative is orphan bytes paid for
  > forever.
- The dashboard auth check shifts from "is this user in
  `ADMIN_GITHUB_USERNAMES`" to "what tier is this user", changing
  the session shape. `Phase 7.2` is the breaking change moment —
  every write endpoint needs to know which tier the caller has.
- The admin queue route at `/admin/queue` introduces a new
  authorization gate that doesn't exist today (any authenticated
  user is currently treated as admin by virtue of being in the
  list). Going forward the dashboard MUST consult the
  `tier === 'admin'` check on every admin-only route.
- The data model gains a transient URL scheme `staging://<key>`
  on the image entity's `url` property. This is a frontend-level
  encoding only — by the time the entity hits `main`, the URL is
  rewritten to the public CDN form via the promotion workflow's
  follow-up commit. Documented in DATA_MODEL.md when 7.1 ships.
- `auto-merge-dashboard.yml` is tightened: contributor PRs never
  auto-merge regardless of CI status. Admins still benefit from
  auto-merge for their own work.
- IDEAS.md "AI-assisted editing + external-source ingest" entry
  (Fandom / api-onepiece.com) interacts with this work: external
  ingest would naturally use the contributor flow (`assisted_by`
  attribution + admin review), but is NOT a prerequisite. Each
  ships independently.
- The work is sized at ~10 working days total (0.5 + 2 + 3 + 5)
  spread over a calendar quarter. The maintainer can pause
  between sub-phases without leaving the codebase in a broken
  state — each sub-phase ends at a green build.

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
