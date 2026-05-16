# Dashboard Architecture

The dashboard is the editing UI. Its central principle is that **no
application code knows about specific entity types or property names**;
everything is driven by schemas read at runtime.

## High-level flow

```
┌─────────────────────────────────────┐
│           Contributor               │
│        (admin in phase 1)           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Dashboard (TanStack Start)         │
│                                     │
│  Reads:                             │
│    - Schemas (from /data/schemas/)  │
│    - Entities (from SQLite)         │
│                                     │
│  Renders:                           │
│    - Dynamic forms from schema      │
│    - Lists, edits, history          │
│                                     │
│  Writes:                            │
│    - To IndexedDB (drafts)          │
│    - To GitHub API (on submit)      │
└──────────────┬──────────────────────┘
               │
               │ PR
               ▼
┌─────────────────────────────────────┐
│  GitHub Repository                  │
│  /data/**/*.json                    │
└──────────────┬──────────────────────┘
               │
               │ Merge to main
               ▼
┌─────────────────────────────────────┐
│  CI: build:data                     │
│  → /dist/onepiece.db                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Vercel deploys dashboard + preview │
└─────────────────────────────────────┘
```

## Components of the dashboard

### Pages (TanStack Router file-based routes)

```
apps/dashboard/app/routes/
├── __root.tsx
├── index.tsx                       # /
├── _auth/
│   ├── login.tsx                   # /login
│   └── callback.tsx                # /auth/callback
├── _app/                           # auth-gated
│   ├── index.tsx                   # /dashboard
│   ├── $type/
│   │   ├── index.tsx               # /dashboard/$type
│   │   ├── new.tsx                 # /dashboard/$type/new
│   │   └── $id/
│   │       ├── index.tsx           # /dashboard/$type/$id
│   │       └── edit.tsx            # /dashboard/$type/$id/edit
│   ├── schema/
│   │   ├── index.tsx               # /dashboard/schema
│   │   └── $type.tsx               # /dashboard/schema/$type (phase 5)
│   └── vocabulary/
│       └── $id.tsx                 # /dashboard/vocabulary/$id (phase 5)
```

### Server functions

All write paths are server functions (TanStack Start), validated with Zod
at entry:

- `loadSchemasFn()` — returns the loaded, validated schemas
- `getEntityFn(id)` — reads an entity from SQLite
- `listEntitiesFn(type, query)` — list with pagination and search
- `submitEditFn({ entityId, changes, baseSha, message })` — opens a PR
- `submitNewEntityFn({ type, data })` — opens a PR creating a new entity
- `getDraftsFn()` — lists user's drafts from server-side store
  (phase 1: no server store; drafts are client-only)

### Core data flow for editing

1. User opens `/dashboard/character/luffy/edit`
2. Server loader fetches the entity + its type schema
3. Form generator renders a form tree from the schema
4. User edits → React Hook Form holds state, Zod validates on blur
5. Auto-save to IndexedDB on every change
6. User clicks "Submit"
7. Client calls `submitEditFn` with the new entity and the base SHA
8. Server function validates again with Zod, opens a PR via Octokit
9. UI shows "Submitted! PR opened, waiting for review"

## Form generator

The key abstraction. It takes a schema and a value, and produces a form.

### Architecture

```
EntityEditor
├── Reads entity-type schema
└── For each property declaration:
    ├── HistoricalValueListEditor (if historical)
    │   └── For each entry:
    │       ├── ValueInput (chosen by value_type)
    │       └── QualifiersEditor
    │           └── For each qualifier:
    │               └── ValueInput (chosen by qualifier value_type)
    └── ValueInput (if not historical)
        └── Chosen by property's value_type
```

### Value-input registry

A registry maps `value_type` → component:

```ts
const VALUE_INPUT_REGISTRY = {
  string: StringInput,
  number: NumberInput,
  boolean: BooleanInput,
  enum: EnumInput,
  multi_enum: MultiEnumInput,
  date: DateInput,
  entity_ref: EntityRefInput,
  source_ref: SourceRefInput,
  i18n_key: I18nKeyInput,
  markdown: MarkdownInput,
} as const;
```

Adding a new `value_type` is two files: the schema declaration and the
component. No changes to the form generator itself.

### Reading vs writing

All value inputs receive:

- `value`: current value (or undefined)
- `constraints`: from the schema (`value_constraints`)
- `onChange(newValue)`: update callback
- `error`: optional Zod error to display

They never touch global state directly. The form library (React Hook Form)
manages submission.

## Historical value editor

This is the most non-trivial UI component. It manages a property that is
an array of timestamped entries.

### Behavior

- Lists existing entries sorted by `since` ascending
- "Add entry" button creates a new entry with default qualifiers
- Each entry can be edited or removed
- Reorder by setting `since`; the UI shows entries in chronological
  order automatically
- Visual timeline preview alongside the form

### Qualifiers

Each historical entry has its own qualifier set, determined by:

- The property type's `default_qualifiers`
- The property type's `allowed_qualifiers`
- The property type's `value_type` (some qualifiers like `since` are
  mandatory)

The qualifier editor is itself schema-driven.

## Entity reference input

Autocomplete on existing entities, filtered by allowed target types.

- Type-ahead search via SQLite FTS
- Display name in the active locale, with type badge
- Falls back to "Create new entity" if no match (opens new entity dialog)

## Source reference input

A specialized entity-ref input filtered to source types
(`manga-chapter`, `anime-episode`, `film`, `sbs`, `databook`).

Adds:

- Quick-select for "current chapter being edited"
- Visual cue for what arc/saga the source belongs to

## Relations editor

A list of typed relations on the entity, each editable inline.

- Add relation: pick a relation type from `allowed_relations` of the
  entity's type, then pick a target, then fill qualifiers
- Remove: deletes the relation (will be removed from JSON)
- Edit: opens qualifier form

The relation editor reads relation-type schemas to know what qualifiers
each relation accepts.

## Drafts

Phase 1: client-side only.

- IndexedDB key: `draft:<entityId>`
- Stored value: serialized form state + base SHA + last-modified timestamp
- On entity reopen: if a draft exists, prompt the user to restore or
  discard
- On submit success: draft is deleted

Phase 4+: drafts move to a server-side store (Postgres or KV) to support
multi-device editing.

## Optimistic locking

When the user opens an entity, the server returns:

- The entity content
- The Git SHA of the file at load time

When the user submits, the SHA is sent. The server checks:

- If the SHA still matches `main`, proceed
- Otherwise, return a conflict response with the new content; the UI
  shows a diff and asks the user to merge manually

This avoids overwriting another contributor's work.

## Bulk table view

Single-entity editing doesn't scale to "fill in 100 missing French names".
Route `/types/$type/table` (`apps/dashboard/src/routes/types.$type.table.tsx`)
renders every entity of a type as a row and a maintainer-chosen set of
properties as columns.

- Backed by `GET /api/entities/:type/table` which returns all entities of
  the type with their full `data` + per-locale translations bundled. SHAs
  are intentionally omitted (one GitHub blob lookup per entity scales
  poorly); table saves go through `POST /api/entities/:type/:slug` with
  `sha: null`, trading optimistic locking for bulk speed.
- Column picker (popover with checkboxes) lets the maintainer choose
  which properties to show. Default set: name + a couple of localized
  fields. Choice lives in component state, not persisted yet.
- Each cell is either inline-editable (string / number / boolean / enum /
  date / `i18n_key` for localizable properties) or a read-only preview
  with an "open in drawer" arrow for complex types (entity_ref,
  source_ref, multi_enum, markdown). Inline edits commit on blur or
  Enter and tint the cell amber until saved.
- For localizable properties the cell edits the active-locale
  translation. Missing `value_key`s are auto-generated as
  `${entity.id}.${propertyId}` and back-filled into `data.properties`,
  matching the single-entity form's convention.
- Save flow: "Save all" iterates dirty rows and calls the existing
  per-entity save endpoint one at a time, opening one PR per modified
  entity. Per-row failures are toasted; successful saves invalidate the
  client cache so a subsequent table refresh sees the latest disk state.

## Schema-driven menus

The main navigation is generated from the entity types:

```ts
const navItems = entityTypes.map((et) => ({
  label: et.labels[locale],
  href: `/dashboard/${et.id}`,
  icon: et.ui_hint?.icon,
  group: et.ui_hint?.group,
}));
```

Adding a new entity type adds it to the menu automatically.

## Authentication (phase 1 — admin-only)

- A GitHub App is installed on the data repo
- Admin users authenticate via GitHub OAuth (App permissions)
- An env var `ADMIN_GITHUB_USERNAMES` lists allowed users
- Sessions are server-side (JWT in HTTP-only cookie)
- All write paths verify the session

This is intentionally a binary tier: every signed-in user has the
same powers as the maintainer. It works because the allow-list is
short and trusted.

## Authentication (phase 7 — four-tier model with anonymous writes)

Per ADR-015 (revised), Phase 7 opens dashboard writes to
**anyone**, with or without a GitHub account. The login is
optional — when present it gives the contributor a `Co-authored-by`
trailer + `@mention`; when absent the PR is bot-authored only.
Admin powers (review / merge / reject / promote images) remain
gated to the listed GitHub admin set.

The four tiers:

| Tier            | Identity                                 | Writes         | PR attribution                                   | Rate-limit handle | Auto-merge |
| --------------- | ---------------------------------------- | -------------- | ------------------------------------------------ | ----------------- | ---------- |
| **Anonymous**   | none                                     | yes            | optional self-chosen nickname (plain text, no @) | client IP         | never      |
| **Contributor** | GitHub login, not admin                  | yes            | login + `@mention` + `Co-authored-by`            | login             | never      |
| **Admin**       | GitHub login in `ADMIN_GITHUB_USERNAMES` | yes            | login + `@mention` + `Co-authored-by`            | login (high cap)  | yes        |
| **Moderator**   | same login, calling `/api/admin/*`       | merge / reject | n/a                                              | login             | n/a        |

The four-tier framing is conceptual; in code only **session
present + admin?** is checked per endpoint:

- **No write surface requires a session.** `POST /api/entities/*`
  and `POST /api/uploads/presign` work for everyone.
- **Admin endpoints (`/api/admin/promote`, `/api/admin/reject`)**
  require `session !== null && isAdmin(cfg, session.login)`.
- **Anonymous PRs** open via the GitHub App with NO
  `Co-authored-by` trailer. The dashboard prompts for an optional
  self-chosen nickname in the save bar (persisted to
  `localStorage` so a returning contributor types it once); the
  nickname is surfaced verbatim in the PR body as plain text
  (never with `@` — it isn't a GitHub handle). When the nickname
  is empty the PR body just says "Anonymous contribution". The
  client IP is used only in-memory for rate-limiting +
  `BLOCKED_IPS` matching — no IP-derived value is ever written to
  the PR or to disk.

Anti-abuse surface:

- **Per-IP rate-limit** for anonymous traffic (in-memory token
  bucket; resets on server restart, which is fine for the
  current single-instance dev/early-prod target). Tunable env
  vars:
  - `ANON_WRITE_LIMIT_PER_HOUR=10` (PR opens per IP per hour)
  - `ANON_UPLOAD_LIMIT_PER_HOUR=20` (R2 presigns per IP per hour)
- **Per-login rate-limit** for contributors (separate, higher
  caps); admin tier exempt.
- **`BLOCKED_GITHUB_USERNAMES`** still blocks authenticated trolls.
- **`BLOCKED_IPS`** new env var, comma-separated, blocks anonymous
  abuse without a code change. Matched against the
  `X-Forwarded-For` first-hop or the connecting socket address.
- **Captcha** (Cloudflare Turnstile or similar) is deferred until
  the IP rate-limit demonstrably stops being enough.

The auto-merge workflow's existing rule (must find an admin login
in `Co-authored-by`) covers the auto-merge gate naturally:
anonymous PRs have NO trailer, contributor PRs trail a non-admin
login, neither qualifies.

## Admin moderation queue (phase 7.3)

Route `/admin/queue` (admin-only). Lists every open PR touching
`data/**` with: contributor identity, age, branch, CI status, file
count. Per-PR detail uses the same `DiffPopover` rendering as the
editor (structured property / translation / relation diff) plus
preview thumbnails for any staged image referenced via the
`staging://` URL scheme (signed by `/api/preview/:key`).

Actions delegate to the GitHub API server-side:

- **Approve & merge** → squash-merge. Triggers `promote-images.yml`
  which copies referenced `pending/` keys to `images/` and opens a
  follow-up commit rewriting `staging://` URLs.
- **Request changes** → comment + mark PR as draft.
- **Close** → close without merge; R2 lifecycle purges the staged
  bytes after 14 days.
- **Block contributor** → adds the login to a server-side store
  consulted by `BLOCKED_GITHUB_USERNAMES` resolution.

The custom UI is sugar on top of the GitHub API; the admin can
always review on GitHub directly.

## GitHub integration

Via `@onepiece-wiki/github-client` (Octokit wrapper):

- `getFile(path)` → `{ content, sha }`
- `writeFile(branch, path, content)` → commits to a branch
- `createBranch(name, fromSha)`
- `openPR({ title, body, head, base })`

PRs from the dashboard carry:

- A descriptive title (`Edit character:luffy — add bounty entry`)
- A body with the diff summary, contributor info, draft message
- Labels: `edit`, `via-dashboard`
- Optionally, schema-changing PRs carry `schema-breaking`

CI runs validate + build on every PR; if it fails, the PR shows red.

## Error handling

- Validation errors are shown inline in the form
- Network errors are toasted with retry options
- PR creation errors (rate limit, auth) surface a help message
- The build step in CI is the final gate; if a PR breaks the build, it
  cannot be merged

## Accessibility and i18n

- All forms are keyboard-navigable (Base UI defaults)
- Labels and helper text are i18n keys, resolved by `@onepiece-wiki/i18n`
- Error messages are localized via Zod error map

## Performance

- Schemas are loaded once, cached in memory on the server
- Entity listings paginate (default 50)
- Form generation is memoized per entity type
- IndexedDB writes are debounced (300ms)

## Anti-patterns to refuse

- Coding "if entity type is character then …" anywhere
- Importing specific property names into components
- Bypassing the form generator for "tricky" types — extend the generator
  instead
- Persisting state on the server without auth
- Skipping Zod validation on the server because "the client already
  validated"
