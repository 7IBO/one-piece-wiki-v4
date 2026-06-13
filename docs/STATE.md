# Project state & handoff

The living "where things stand and what to resume" snapshot, so a fresh
session can pick up mid-stream. Architectural _rationale_ lives in
`/docs/DECISIONS.md` (ADRs); the build order in `/docs/ROADMAP.md`;
this file is the current status + the open threads.

**Last updated**: 2026-06-13
**Current phase**: 4.3 (see ROADMAP). Post-4.3 order (ADR-027):
4.3 → 3.5 (Fandom + TMDB ingest) → 6 (public app) → 5 → 7 → 8 → 9+.

## Open / blocked threads — resume here

### 1. Production dashboard `/api/*` 404 — infra fixed; remaining is operational

- Original symptom: `https://dashboard.one-piece.wiki/api/schemas` →
  Vercel edge `NOT_FOUND`. Root cause was the Vercel **Framework Preset
  = "Vite"** → Vercel served the app statically and never deployed the
  serverless function, so all `/api/*` (and SSR) 404'd.
- **Fixed at the infra level**: preset switched to **TanStack Start** +
  **Root Directory = `apps/dashboard`** (confirmed). The Vercel build
  log now shows the function built (`.vercel/output/functions/__server.func/`),
  `config.json` routing `/(.*) → /__server`, and "Deployment completed".
- **If `/api/*` still 404s**, it's an **operational** matter, not the
  repo: the live production deployment is likely a stale one (the
  "Configuration Settings differ" banner = production built with the
  old Vite settings). Fix: Vercel → Deployments → latest successful
  build → **Promote to Production** (or Redeploy without build cache),
  then hard-refresh.
- Dead ends (do NOT repeat blind): #23 relocated `.vercel/output` via
  the buildCommand → **broke the build** (reverted #25); #27 removed
  `framework`/`outputDirectory` → made a preview 404 (closed). The
  repo-root `vercel.json` is **ignored** anyway when Root Directory =
  `apps/dashboard`. **Never push deploy config blind** (CLAUDE.md
  Definition of done #7).
- Vercel's post-build `tsc` prints node/bun-type errors on `api/` +
  packages — **non-fatal** (deploy completes) and a Vercel-typecheck-
  context artifact (our typecheck passes with bun types). The real,
  local gap — `api/` not being in our typecheck scope — is now closed
  (dashboard tsconfig `include` covers `api/**/*`).

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
  `api/server.ts` (~1776 L). **ADR-first**. Also burns down
  react-doctor's ~254 advisory findings (mostly react-hooks deps here).
- **schema-driven display name** — make the name resolver prefer
  `canonical_name_key` / a property marker instead of the
  `['name','title_key']` constant. Behaviour change → own PR.

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
