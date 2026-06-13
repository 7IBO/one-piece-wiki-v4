# Project state & handoff

The living "where things stand and what to resume" snapshot, so a fresh
session can pick up mid-stream. Architectural _rationale_ lives in
`/docs/DECISIONS.md` (ADRs); the build order in `/docs/ROADMAP.md`;
this file is the current status + the open threads.

**Last updated**: 2026-06-13
**Current phase**: 4.3 (see ROADMAP). Post-4.3 order (ADR-027):
4.3 → 3.5 (Fandom + TMDB ingest) → 6 (public app) → 5 → 7 → 8 → 9+.

## Open / blocked threads — resume here

### 1. ⚠️ Production dashboard `/api/*` 404 — UNRESOLVED, blocked on a Vercel setting

- Symptom: `https://dashboard.one-piece.wiki/api/schemas` → Vercel **edge**
  `NOT_FOUND` (`cdg1::…`). The serverless function isn't being routed —
  Vercel isn't using nitro's Build Output API.
- **The code is fine**: `/api/schemas` returns 200 in dev AND in the
  built node-server locally; the dashboard build succeeds.
- Root cause is a **Vercel project setting**, not the repo. Likely fix:
  **Settings → General → Root Directory = `apps/dashboard`** (Framework
  Preset = TanStack Start is already set). With the app in a subfolder,
  that's what lets Vercel find `apps/dashboard/.vercel/output`.
- Tried + reverted — **do NOT repeat blind**: #23 relocated
  `.vercel/output` via the buildCommand → **broke the build** (reverted
  in #25); #27 removed `framework`/`outputDirectory` → didn't help
  (closed). A repo-root `vercel.json` can't reliably fix a
  monorepo-subfolder deploy; the lever is the Root Directory setting.
- To finish: confirm the Root Directory value, or paste
  `npx vercel inspect <dpl> --logs`. **Never push deploy config blind**
  (CLAUDE.md Definition of done #7).

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
