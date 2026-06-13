# Project state & handoff

The living "where things stand and what to resume" snapshot, so a fresh
session can pick up mid-stream. Architectural _rationale_ lives in
`/docs/DECISIONS.md` (ADRs); the build order in `/docs/ROADMAP.md`;
this file is the current status + the open threads.

**Last updated**: 2026-06-13
**Current phase**: 4.3 (see ROADMAP). **Post-4.3 order re-sequenced by
ADR-032** (tooling-before-ingest): W-F → W-A → W-B → W-C → W-E → W-D,
then resume 3.5 → 6 → 7 → 8 → 9+. Workstream breakdown below
(§ "Active plan").

## Open / blocked threads — resume here

### 1. Production dashboard `/api/*` 404 — ROOT CAUSE FOUND + FIXED (code)

- Symptom: `https://dashboard.one-piece.wiki/api/schemas` → Vercel edge
  `NOT_FOUND`, while SSR routes (`/`, `/types/character`, `/login`) work
  fine via the function. So the function deploys and runs — only
  `/api/*` is intercepted **before** reaching it.
- **Real root cause (proven 2026-06-13 by probing prod):** Vercel's
  legacy **zero-config Serverless Functions** convention treats a
  root-level `api/` directory as individual functions. With Root
  Directory = `apps/dashboard`, Vercel saw **`apps/dashboard/api/`** and
  reserved the **entire `/api/*` path prefix**, shadowing the nitro
  Build-Output catch-all (`/(.*) → /__server`). Proof: `/api/server`,
  `/api/session`, `/api/r2`, `/api/admin-promote` (= the `.ts`
  filenames) returned **500 FUNCTION_INVOCATION_FAILED** (Vercel built
  them as broken functions), while `/api/schemas` + any non-file path
  returned **404 NOT_FOUND**. The earlier "Vite preset / stale deploy /
  operational" theory was **wrong** — the deploy was current and the
  function was live; `/api/*` never reached it.
- **Fix (this PR):** renamed `apps/dashboard/api/` →
  `apps/dashboard/server/` so there is no root-level `api/` dir for
  Vercel to claim. The public URL `/api/*` is unchanged — it is the
  TanStack route path `src/routes/api/$.ts` (splat → `handleApiRequest`),
  independent of the server-lib dir name. Updated the 4 references:
  route import, dashboard `tsconfig.json` include, `package.json`
  `dev:api-legacy` script, `knip.json` entry. Typecheck + lint + vercel-
  preset build all green; only `__server.func` is emitted; catch-all
  config intact.
- **Verify after deploy** (routing effect can't be checked locally —
  DoD #7): `curl -s -o /dev/null -w "%{http_code}\n"
  https://dashboard.one-piece.wiki/api/schemas` → expect **200** (was
  404). Also confirm `/api/server` no longer 500s (should be handled by
  the splat now).
- Dead ends (do NOT repeat blind): #23 relocated `.vercel/output` via
  the buildCommand → **broke the build** (reverted #25); #27 removed
  `framework`/`outputDirectory` → made a preview 404 (closed). The
  repo-root `vercel.json` is **ignored** when Root Directory =
  `apps/dashboard`. **Never push deploy config blind** (CLAUDE.md
  Definition of done #7).
- The big post-build `tsc` **error flood** in the Vercel log (`Cannot
  find name 'process'`, `node:crypto`, `Buffer`, `NodeJS`, `Bun`,
  `S3Client.send`, plus a couple of "genuine-looking" ones like
  `string | { error: string }` in server.ts and the `id?` mismatch in
  generator.ts) is the **same root cause** as the 404: it is Vercel
  **compiling `apps/dashboard/api/*.ts` as zero-config serverless
  functions** in its own context without our `@types/bun`/`@types/node`.
  Proof: every erroring file is in the `api/*.ts` import graph (api/ +
  the packages it imports) — **zero errors come from `src/**`** (the
  2302-module tree nitro actually bundles). It is **non-fatal** (deploy
  exits 0) AND it disappears entirely once `api/` is renamed (PR #32):
  no `api/` dir → Vercel compiles nothing there → no tsc pass → no
  flood. The "genuine-looking" errors pass our CI typecheck and are
  artifacts of the degraded (types-missing) context, not real bugs.

### 2. Admin schema editor (Phase 5) — proposed, not started

- Goal: control fields / values / enums from the dashboard.
- Plan: **same dashboard app**, an admin-gated `/schema` section (not a
  separate app); reuse the schema-driven form generator + github-client
  PR flow + admin auth. Order, safest first: **vocabulary (enum)
  editor** (additive → PR label `vocabulary`) → property-type editor
  (+ impact analysis, reuse `bun run migrate`) → entity-type editor
  (admin-only, ≥2 reviews).
- ADR-027 deferred Phase 5; the maintainer wants it pulled forward →
  needs an ADR + reorder, then start with the vocab editor.

### 3. Codebase-audit backlog (pending)

From the 2026-06-13 audit. **Done this run**: db-builder derived fields
(is_first, primary_canon_scope), display-name dedup, github-client
save-flow tests, the migration helper. **Pending**:

- **qualifiers schema-driven** — `apps/dashboard/src/form/qualifiers.ts`
  hardcodes qualifier UI metadata (value-type, enum_ref,
  entityTypeFilter); make it schema-derived. 4 layers, new schema
  concept → **ADR-first**.
- **db-builder inference engine** — public events reveal facts to
  participants; death events update status transitively. Needs Phase
  3.5 data to be useful.
- **multi-medium spoiler progression** — `packages/sdk/src/progression.ts`
  only models `manga_chapter`; add anime/film axes + cross-medium
  reachability (reaching an episode implies its adapted chapter).
- **Playwright e2e** for the entity-create → PR flow (none exists yet).
- **decompose god-modules** — `EntityForm.tsx` (~1876 L) and
  `server/server.ts` (~1776 L). **ADR-first**. Also burns down
  react-doctor's ~254 advisory findings (mostly react-hooks deps here).
- ~~**schema-driven display name**~~ — **DONE (ADR-031):** entity types
  declare an ordered `display_name_properties`; resolver defaults to
  `['name','title_key']` only when a type omits it. No data migration.
  **Follow-up the feature now unlocks:** `image` (→ `caption_key`) and
  `sbs` currently fall back to slug (no `name`/`title_key`) — give them
  real display names by declaring `display_name_properties` (own PR;
  it's a display behaviour change, left out of ADR-031 to keep it
  behaviour-preserving).
- ~~**relation epistemic axis**~~ — **DONE (ADR-037):** `epistemic_status`
  / `believed_by` / `known_truth_by` / `revealed_since` are now base
  qualifiers on every relation (engine-provided, guarded by
  `RELATION_DECLARES_BASE_QUALIFIER`), typed in both validators
  (`entity-loader` + generated printer), exposed as columns on the
  db-builder `relations` table (mirrored onto the inverse) and on the SDK
  `RelationRecord`. Unblocks disguise-of / same-identity-as (G-series) and
  secret-alliance / double-agent modelling. No data migration.

### 4. Data-model expansion (clusters) — in progress

Driven by `/docs/DATA_EXPANSION_PLAN.md` (Fandom-survey synthesis → clusters
C1–C9, each = one ADR + PR). **Shipped:** ADR-037 (relation epistemic axis),
ADR-039 (C4 devil-fruit identity/succession), ADR-040 (C6 weapon Meitō), ADR-041
(C2 character occupations/blood-types), ADR-042 (`check:compat` schema-evolution
lockfile + CI gate), ADR-043 (C3 organizations: sub-units/power-systems/member
nations), ADR-044 (C7-core: `person` entity + `voiced-by`/`portrayed-by` +
`marine-ranks` via `held_rank`). **Remaining (recommended order):** C9
(world/region/status + events/timeline/era — biggest), C8 (sources / volumes /
SBS-QA / databook-cards + adaptation many-to-many; absorbs C7's deferred
source/media enrichment + theme-song), C5 (fighting-styles/Haki/techniques),
C4b (fruit weaknesses/interactions/awakening outcomes), C1 (naming/i18n
editions — foundational but invasive). All clusters touch DECISIONS.md +
INVENTORY.md, so **merge sequentially**: pull main, branch, `compat:snapshot`
per cluster. **INVENTORY refresh** (per-item sub-sections lag the true catalogue
counts) is tracked in `DATA_EXPANSION_PLAN.md` §5 — a catalogue-generated
rewrite, its own PR.

## Active plan (ADR-032) — tooling before ingest

Six workstreams, built in this order; each ships as independent PR(s).
No runtime DB: live PR/contributor data is read from the GitHub API on
demand (module-level cache like `api.ts`); derived aggregates are
computed server-side or emitted as generated TS manifests under
`packages/` (cf. `packages/schemas/generated`); image bytes stay on R2.

- **W-F — UI-coherence foundation** (do first, low risk). Shared
  resource-fetch hook (or adopt the already-bundled TanStack Query) to
  kill the duplicated `useEffect`+`useState`+skeleton+`Failed:` pattern
  in ~7 routes; a shared `<PRBanner>`/`<InfoBanner>` for the repeated
  amber/primary callouts; replace raw `<a>`/`<button>` (in `__root.tsx`,
  `types.$type.index.tsx`) with `<Button>`. God-module decomposition
  (`EntityForm.tsx` 1876 L, `inputs.tsx` 1103 L, `server/server.ts`
  1776 L) is a later **ADR-first** slice, done opportunistically as
  W-B/C/D touch those files.
- **W-A — coherence linter.** New `bun run check:coherence` in
  `packages/schema-engine` (CI gate): asymmetric/missing inverse
  relations, orphan refs, source-coverage gaps, untranslated `i18n_key`
  (EN/FR), `canon_scope` inconsistencies, images with no `depicted-by`.
  Plus make `form/qualifiers.ts` schema-driven (task #3) — **ADR-first**.
- **W-B — admin queue + contributors** (pulls Phase 7.3 fwd; backend
  already shipped). `GET /api/admin/pulls` (all open `via-dashboard`
  PRs); gated `/admin/queue` (list + per-PR detail, server-side
  structured diff reusing `DiffPopover`, staged image previews,
  Approve-merge/Request-changes/Close → existing promote/reject).
  `GET /api/contributors` + `/contributors` route aggregating by
  **parsing the PR-body Contributors bullet** (bot owns commits, so
  GitHub's author APIs don't reflect humans). `packages/contribution-
  stats` util; optional build-time `contributors.generated.ts`.
- **W-C — schema/enum/value editor** (pulls Phase 5 fwd). Vocabulary
  (enum) editor first (additive, PR label `vocabulary`) → property-type
  editor (+ impact analysis, reuse `bun run migrate`) → entity-type
  editor (admin-only, ≥2 reviews, incl. `display_name_properties`), PR
  label `schema-breaking`. Reuse the form generator + github-client.
- **W-E — availability links** (ADR-028, already designed). `availability`
  object property (`{platform,url,kind,region?,subtitle_langs?,
  dub_langs?,requires_subscription?,verified_at?}`, `allow_multiple`) on
  anime-episode/manga-chapter/film; `streaming-platforms` vocabulary.
  Prereq: `SCHEMA_SPEC` `object` value-type section (ADR-026) + a
  repeating-object-row form input. **Affiliate links = separate net-new
  ADR** (FTC disclosure, `rel="sponsored nofollow"`, program/tag model).
- **W-D — media library + image UX.** `/media` gallery (filter by
  license/format/spoiler/usage, search, "where used"); image **reuse
  picker** in the form (widen `depicted-by.valid_from_types` first);
  **display images** on entity detail/list/cards, spoiler-gated by
  `spoiler_since`; uploader polish (paste, bulk, optional crop/focal,
  inline license+attribution+alt-text gating, content-hash dedup).
  `packages/media` helper (URL resolution, srcset, blur). Responsive
  variants via Cloudflare = deploy-config, flag for platform.

## Gotchas (so they don't bite again)

- **Build before committing**, and **deploy config can't be verified
  locally** — CLAUDE.md Definition of done #7. CI now builds the
  dashboard, but `vercel.json` / nitro preset changes only prove out on
  Vercel.
- commitlint allowed types: `feat fix refactor docs test chore data
  schema perf style` — **no `ci`** (use `chore` for tooling/CI).
- `react-doctor install` overwrites `.git/hooks/pre-commit` (hijacks
  lefthook) — restore with `bunx lefthook install`.
- dprint markdown turns a line starting with `+` into a list marker —
  don't start prose lines with `+`.
- Unit tests run on `bun test` (not Vitest — ADR-030).
- On Windows the working tree can drift to CRLF; `.gitattributes`
  enforces LF. Stage intentionally (the tree may show phantom CRLF
  diffs).

## Tooling in place

- Skills (`.claude/skills/`): `data-model`, `dashboard`, `toolchain`,
  plus vendor `react-doctor`.
- Gates: dprint (format), oxlint (correctness + suspicious = error,
  `no-unused-vars` = error), knip (dead files + deps; export-level off),
  react-doctor (advisory ratchet, non-blocking), CI dashboard build,
  commitlint, lefthook.
- `bun run migrate <file>` rewrites `/data` for schema renames in the
  pre-freeze regime (ADR-029/030).
- Full verify gauntlet: see the `toolchain` skill.
