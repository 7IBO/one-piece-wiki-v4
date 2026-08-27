---
name: toolchain
description: Use when running tests, committing, opening a PR, wiring CI, managing dependencies, or verifying a change in this repo. Covers the bun test runner, Conventional Commits, the git hooks, dead-code/lint gates, and the full verification gauntlet.
version: "1.0.0"
---

# Toolchain & verification

Runtime + package manager: **Bun**. Orchestration: Turborepo. The
contract is `/CLAUDE.md`; conventions in `/docs/CONVENTIONS.md`.

## Tests

- **`bun test`** is the unit runner (NOT Vitest — removed in ADR-030;
  all suites import `bun:test`). Build-side DB: `bun:sqlite`.
- e2e: Playwright (planned).

## Commits & hooks

- **Conventional Commits**, enforced by commitlint. Allowed types:
  `feat, fix, refactor, docs, test, chore, data, schema, perf, style`.
  **`ci` is NOT allowed** — use `chore` for CI/tooling work.
- **Never** add Claude / agent attribution to commits or PRs.
- Pre-commit = **lefthook** (format-check + lint + frontend-extensions);
  commit-msg = commitlint. If a tool overwrites `.git/hooks/pre-commit`
  (e.g. a vendor `install` command), restore lefthook with
  `bunx lefthook install`.

## Gates

- **dprint** formats (TS/JSON/MD). Run `bun run format` (no explicit
  paths, so config `excludes` apply).
- **oxlint** — `correctness` + `suspicious` are errors; `no-unused-vars`
  is an error. `bun run lint`.
- **knip** gates dead **files** + **dependencies** (export-level off on
  purpose). `bun run knip`.
- **react-doctor** is **advisory** (a ratchet on NEW React issues vs the
  PR merge base) — it never fails CI today. `bun run doctor` for a local
  scan.

## Verification gauntlet (matches CI) before claiming "done"

```
bun run format && bun run lint && bun run knip \
  && bun run typecheck && bun run schema:check && bun run validate \
  && bun run check:references && bun run check:coherence \
  && bun run check:compat \
  && bun run build:db && bun test \
  && bun run -F @onepiece-wiki/dashboard build \
  && bun run -F @onepiece-wiki/web build
```

**`build:db` MUST come before `bun test`, and this is the step people
skip.** Several suites read `dist/onepiece.db` and carry
`describe.skipIf(!hasArtifact)`: without the artifact they do not fail,
they **vanish**, and the run reports a confident green over tests that
never executed. That gap let the chapter import #94 merge with two red
data-count tests while CI said success, and it caught this skill's own
author out again on #130 — a local "680 pass" that omitted the artifact,
against a CI that found two real failures in the same commit.

The rest of the line matters too: `schema:check`, `check:compat` and the
**web** build are all in CI. A gauntlet that claims to match CI while
running a subset is worse than no gauntlet, because it buys confidence
it has not earned.

`check:coherence` (ADR-032 W-A) is the cross-entity gate: relation
schema-compliance (allowed_relations, valid_from/to types, required
relation qualifiers) plus an `UNREFERENCED_ENTITY` warning. It catches
incoherence that `validate` (single-file shape) and `check:references`
(bare ref existence) miss. Errors fail; warnings are informational.

`typecheck` is NOT enough — it misses build-time breaks (a removed dep,
a bad import). Always run the dashboard **build** when a change could
touch it. CI runs it too.

## Deploy config — cannot be verified locally

`vercel.json`, the nitro preset, `NITRO_PRESET`, etc. only prove out on
the platform — a local `VERCEL=1` build does NOT match Vercel's real
build env. Never commit/merge a deploy-config change blind: prefer the
standard setup, flag it for human review, and confirm on a real deploy.
(Lesson from #23: a `vercel.json` `buildCommand` change passed every
local check but broke the Vercel deployment; reverted in #25.)

## Dependencies & data

- CI installs with `bun install --frozen-lockfile` — keep `bun.lock` in
  sync whenever you change a dependency.
- `/data` rewrites for schema renames: `bun run migrate <file>`
  (`--dry-run` first). See the `data-model` skill.
