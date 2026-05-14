# Conventions

Strict conventions reduce decision fatigue, make the codebase predictable
for Claude Code, and let new contributors onboard in minutes. The rules
here are non-negotiable.

## Naming

### IDs

- Format: `<entity-type>:<slug>`
- Always kebab-case
- Always English
- Immutable for the lifetime of the entity

Examples: `character:luffy`, `devil-fruit:gomu-gomu`,
`manga-chapter:1044`, `event:battle-of-marineford`, `arc:wano`,
`crew:straw-hat-pirates`.

For sources with intrinsic numeric ordering (chapters, episodes), the slug
contains the number: `manga-chapter:1044`, not `manga-chapter:nika-reveal`.

### Slugs

- Kebab-case
- English only
- Maximum 60 characters
- No special characters other than `-`
- Should match the most widely-used name in the English-speaking community

Examples: `monkey-d-luffy`, `gomu-gomu-no-mi` (not `gum-gum-fruit`,
`straw-hat-pirates`, `battle-of-marineford`).

When a slug changes (rename, disambiguation), the old slug is appended to
`slug_history` to generate redirects.

### File names

- Entity files: `<id-without-prefix>.json`
  - The file `entities/character/luffy.json` has internal id
    `character:luffy`
- Schema files: `<id>.json`
- Translation files: mirror the entity tree, by locale:
  `translations/<locale>/<type>/<id>.json`
- Narrative files: `narratives/<locale>/<type>/<id>.md` or
  `narratives/<locale>/<key>.md`

### TypeScript identifiers

- **Types and interfaces**: PascalCase
- **Variables and functions**: camelCase
- **Constants** (literal values used as constants): SCREAMING_SNAKE_CASE
- **Component files**: PascalCase (`EntityEditor.tsx`)
- **Other files**: kebab-case (`entity-editor.ts`, `use-form-state.ts`)
- **Hooks**: `use-` prefix in file name, `use` prefix in export
- **Server functions**: suffix `Fn` in name (`getEntityFn`, `saveEntityFn`)

### Folders

- All lowercase, kebab-case
- Singular when the folder represents one concept
  (`packages/schema-engine`)
- Plural when the folder represents a collection
  (`packages/schemas`, `apps`)

## TypeScript

### Compiler options

The base `tsconfig.json` extends `@onepiece-wiki/tsconfig/base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": false,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  }
}
```

### Forbidden patterns

- `any` without an inline justification comment: `// @any-justified: <reason>`
- `as` casts to widen a type (`x as Foo` when `x` is narrower)
- `@ts-ignore` (use `@ts-expect-error` with a comment if absolutely needed)
- Non-null assertion `!` on values that could legitimately be null/undefined
- `Object.keys(x)` without considering that the result is `string[]`, not
  `(keyof typeof x)[]`

### Required patterns

- **Explicit return types** on exported functions
- **Discriminated unions** for variant types, not optional properties
- **Branded types** for IDs to prevent mixing
  (`type EntityId = string & { readonly __brand: 'EntityId' }`)
- **Zod schemas** for any data crossing a boundary (network, file system,
  user input)
- **`satisfies`** operator preferred over annotation when checking literals

### Error handling

- Server functions return discriminated results, not thrown errors, for
  expected failures
- Truly exceptional cases (bugs, infrastructure failure) may throw
- Errors carry a `code` (string enum) and a human-readable `message`
- Never `catch` and discard

```ts
type Result<T, E extends string = string> =
  | { ok: true; data: T }
  | { ok: false; error: { code: E; message: string } };
```

## Imports

- Absolute imports within a package, configured per workspace
- Relative imports only for files in the same directory or one level down
- Type-only imports use `import type { ... }`
- Import order, enforced by lint:
  1. Node built-ins
  2. External packages
  3. Internal monorepo packages (`@onepiece-wiki/*`)
  4. Local imports (relative)

## Components (Base UI + Tailwind)

### Structure

```tsx
// EntityEditor.tsx
import type { EntityType, Entity } from '@onepiece-wiki/schemas';
import { PropertyEditor } from './property-editor';
import { RelationEditor } from './relation-editor';

type EntityEditorProps = {
  entityType: EntityType;
  entity: Entity;
  onChange: (entity: Entity) => void;
};

export function EntityEditor(props: EntityEditorProps): JSX.Element {
  // ...
}
```

### Rules

- One component per file
- Default export forbidden in components and packages (use named exports)
- Props typed as a named type, not inlined
- `JSX.Element` return type for all components
- No business logic in components; logic lives in hooks or in
  `/packages/sdk`
- Tailwind classes are written in the JSX, not extracted into separate CSS
  files
- Use `cn()` utility (clsx-based) to combine classes conditionally
- Use Tailwind's `data-[state=*]` selectors for Base UI states

### Tailwind v4

- Theme tokens live in `packages/tailwind-config/tokens.css` using `@theme`
- Components use semantic tokens (`bg-surface-primary`, not `bg-slate-900`)
- Arbitrary values discouraged; if needed, add a token
- Dark mode via `prefers-color-scheme`, fallback toggle in app shell

### Base UI

- Always wrap in the project's themed component layer
  (`@onepiece-wiki/ui`) rather than importing `base-ui` directly in apps
- Composition over configuration: prefer rendering Base UI sub-parts than
  passing dozens of props
- Accessibility-first; never break Base UI's a11y defaults

## Forms (React Hook Form + Zod)

- Always use `zodResolver` from `@hookform/resolvers/zod` with the
  appropriate generated schema
- Validation is **on blur** by default, with **on submit** double-check
- Field errors are localized via the i18n layer (Zod error map)
- The form state is the source of truth; do not duplicate into `useState`

## File header convention

No file headers required by tooling, but **complex modules** should start
with a short docstring explaining their purpose, especially in `/packages`:

```ts
/**
 * Schema engine: loads JSON schema files from /data/schemas/ at build time,
 * validates them against their meta-schemas, and emits typed Zod schemas
 * into /packages/schemas/generated/.
 *
 * Entry point: `generate({ schemasDir, outDir })`.
 */
```

## Commits

Conventional Commits, enforced by commitlint.

Format: `<type>(<scope>): <subject>`

### Types

- `feat`: new feature
- `fix`: bug fix
- `refactor`: code change with no behavior change
- `docs`: documentation only
- `test`: test only
- `chore`: tooling, dependencies, build
- `data`: changes to `/data/**`
- `schema`: changes to `/data/schemas/**`
- `perf`: performance improvement
- `style`: formatting only

### Scopes

Roughly match workspace names: `dashboard`, `preview`, `db-builder`,
`schema-engine`, `sdk`, `ui`, `github-client`, `data-onepiece`.

### Examples

```
feat(dashboard): add EntityRefInput component
fix(db-builder): correctly compute first_appearance across canon scopes
schema(entity-types): add `title` entity type for inherited identities
data(onepiece): add chapter 1100 with appearances
docs(data-model): clarify epistemic_status semantics
```

### Subject

- Imperative mood ("add", not "added")
- Lowercase initial
- No trailing period
- ≤72 characters

### Body

Required for non-trivial commits. Explain **why**, not what.

## Branches

- `main` is always green
- Feature branches: `feat/<scope>/<slug>` (e.g.
  `feat/dashboard/entity-ref-input`)
- Fix branches: `fix/<scope>/<slug>`
- Data branches (from dashboard PRs): `edit/<entity-id>/<short-hash>`
- Schema branches: `schema/<change-summary>`

## Pull requests

### Title

Same format as the commit subject.

### Description template

```markdown
## What

Brief summary of the change.

## Why

Context, motivation, link to issue or doc.

## How

Key implementation choices and trade-offs.

## Spec / Doc updates

- [ ] /docs/<file> updated if relevant
- [ ] /docs/DECISIONS.md entry added if architectural

## Checks

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] `bun run validate` passes (if /data changed)

## Notes for reviewers

Anything specific to highlight.
```

### Size

PRs target <400 lines changed. Larger PRs require justification in the
description.

### Review

- ≥1 approver for regular PRs
- ≥2 approvers for `schema-breaking` PRs
- Self-merge allowed for `docs` PRs after CI passes (phase 1, admin-only
  team)

## Linting

`oxlint` runs on every commit (via lefthook) and in CI. Configuration in
`packages/oxlint-config/`. Rules enabled at the strict tier; project-specific
overrides are documented.

Notable rules:

- Forbid `console.log` in production code (use the `logger` package)
- Forbid `Date.now()` in components (use a `clock` utility for testability)
- Enforce import order
- Forbid relative imports that traverse more than one directory up

## Formatting

`oxfmt` (or `dprint` as fallback) runs on every commit via lefthook and is
checked in CI. Configuration in `dprint.json` at the root.

Width: 100 columns. Semicolons: yes. Quotes: single. Trailing commas: all
where valid.

## Entity JSON

Conventions for files under `/data/universes/<u>/entities/**/*.json`.
The structural rules (field order, `$schema` first, 2-space indent) are in
`/docs/SCHEMA_SPEC.md`; the rules below are content-style rules that the
spec does not enforce.

- **Omit fields equal to their schema default.** A field whose value
  matches the Zod default for that property MUST NOT appear in the entity
  JSON. The most common cases:
  - `"slug_history": []` — omit; the default is `[]`.
  - `"epistemic_status": "true"` — omit on any property entry or relation
    qualifier; the default is `"true"`.
  - Any property-type-declared qualifier with a `default` value matching
    the entry (e.g. `"loyalty_status": "member"` on a `member-of`
    relation).
- **Format scripts enforce this.** `bun run format:data` normalises every
  entity JSON file: strips default-equal fields, reorders fields to match
  the schema declaration order, and is part of the pre-commit hook. A PR
  with default-equal fields fails CI.
- **Rationale.** Diffs stay minimal and readable. When a default changes
  in a schema migration, only the entities that *actively* override it
  show up in the diff — making review of behaviour changes possible.

## Testing

### Unit tests

- Filename: `<source>.test.ts(x)`, colocated with the source
- Use Vitest
- One assertion per `it` when possible, otherwise grouped logically
- Use `describe` blocks per public function
- No global state across tests
- No network calls; mock with `vi.mock`

### Integration tests

- Filename: `<feature>.integration.test.ts`
- Live in `__tests__/` at the workspace root if cross-module

### E2E tests

- Live in `apps/<app>/e2e/`
- Use Playwright
- Run against a built preview, not the dev server

### Fixtures

- Live in `__fixtures__/` next to tests
- Are minimal; do not copy the entire data tree
- Are validated by Zod themselves (a broken fixture fails the test suite at
  setup, not in the middle of a test)

## Performance budgets

The public app (when built in a later phase) targets:

- LCP < 1.5s on 4G
- TBT < 100ms
- CLS < 0.05
- Initial JS payload < 100 KB gzipped

The dashboard targets:

- Time-to-interactive on entity edit page < 800ms after first load
- No N+1 queries on the SQLite

## Accessibility

- All interactive elements reachable by keyboard
- Focus rings visible (Tailwind default `outline-2 outline-offset-2`)
- ARIA labels where Base UI primitives require them
- Color contrast WCAG AA minimum on text; AAA on body
- Forms always have `<label>` (Base UI Form Field handles this)
- No "click here" links; use descriptive text

## i18n

- Application chrome strings: `t('key.path')` from `@onepiece-wiki/i18n`
- Property labels, relation labels, vocabulary labels: from schema definitions
- Entity-specific content: from `/data/universes/<u>/translations/`
- Narrative content: from `/data/universes/<u>/narratives/`
- Never hardcode user-facing strings in any locale

## Logging

- `logger.debug` for development noise
- `logger.info` for normal operational events
- `logger.warn` for unusual but recoverable conditions
- `logger.error` for actionable failures
- No `console.*` outside the logger implementation

## Secrets

- Never committed
- Use `.env.local` for local development (gitignored)
- Use Vercel environment variables for production
- A `.env.example` is committed showing required keys
