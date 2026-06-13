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
  && bun run typecheck && bun run validate \
  && bun run check:references && bun test
```

## Dependencies & data

- CI installs with `bun install --frozen-lockfile` — keep `bun.lock` in
  sync whenever you change a dependency.
- `/data` rewrites for schema renames: `bun run migrate <file>`
  (`--dry-run` first). See the `data-model` skill.
