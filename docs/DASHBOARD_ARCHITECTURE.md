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

Per ADR-015 + ADR-016 + ADR-017, Phase 7 opens dashboard writes to
**anyone with a session**, anonymous or GitHub. Auth is a hand-rolled
stateless signed-cookie layer (HMAC-SHA256, no DB, no external lib —
ADR-017 reverted the brief better-auth adoption). The cookie carries a
discriminated union `{kind: 'github' | 'anonymous', ...}`; the route
handlers project it onto a `DashboardSession` shape via
`readDashboardSession(req)`. Admin powers (review / merge / reject /
promote images) remain gated to the listed GitHub admin set.

The four tiers:

| Tier            | Identity                                 | Writes         | PR attribution                           | Rate-limit handle | Auto-merge |
| --------------- | ---------------------------------------- | -------------- | ---------------------------------------- | ----------------- | ---------- |
| **Visitor**     | no session                               | none (browse)  | n/a                                      | n/a               | n/a        |
| **Anonymous**   | better-auth anonymous session            | yes            | bold `**Pseudo**` plain text in PR body  | session userId    | never      |
| **Contributor** | GitHub login, not admin                  | yes            | `@login` mention in PR body Contributors | session userId    | never      |
| **Admin**       | GitHub login in `ADMIN_GITHUB_USERNAMES` | yes            | `@login` mention in PR body Contributors | exempt            | yes        |
| **Moderator**   | same login, calling `/api/admin/*`       | merge / reject | n/a                                      | exempt            | n/a        |

In code:

- **Write endpoints require a session.** `POST /api/entities/*` and
  `POST /api/uploads/presign` return 401 for visitors, with the
  dashboard pointing them at `/login`. Read endpoints stay 100%
  public.
- **Admin endpoints (`/api/admin/promote`, `/api/admin/reject`)**
  require `session.kind === 'github' && isAdmin(cfg, session.githubLogin)`.
- **No `Co-authored-by` trailer** is emitted, regardless of tier.
  The bot is the sole listed commit author; the human is named once
  in the PR body's `Contributors` section (ADR-016). This means
  authenticated users no longer see PR commits on their GitHub
  contribution graph — accepted trade-off.
- **Anonymous flow**: the contributor signs in at `/login` with a
  self-chosen pseudo. `POST /api/auth/anonymous` validates the value
  (1-32 chars, restricted alphabet via `normalizeNickname`) and sets
  the cookie. No row is allocated server-side — the cookie itself
  carries `{kind: 'anonymous', nickname, expiresAt}`. The pseudo
  lands in the PR body as bold plain text — never with `@` — so a
  reviewer can never confuse the self-chosen label for a real
  GitHub handle.

Anti-abuse surface:

- **Per-session rate-limit** (in-memory token bucket keyed on the
  session identity — login for GitHub, pseudo for anonymous;
  falls back to IP for visitors who somehow hit the rate-limit
  code path). Tunable env vars:
  - `ANON_WRITE_LIMIT_PER_HOUR=10` (PR opens per session per hour)
  - `ANON_UPLOAD_LIMIT_PER_HOUR=20` (R2 presigns per session per hour)
  - Admins are exempt.
- **`BLOCKED_GITHUB_USERNAMES`** blocks authenticated trolls — the
  session cookie still issues but every write returns 403.
- **`BLOCKED_IPS`** blocks anonymous abuse without a code change.
  Matched against the `X-Forwarded-For` first-hop or the connecting
  socket address.
- **Captcha** (Cloudflare Turnstile or similar) is deferred until
  the per-session rate-limit demonstrably stops being enough.

## "Your open contributions" panel (home page)

Section rendered on the home page when a session is present.
Backed by `GET /api/me/contributions` which calls
`listOpenContributions(octokit, cfg, identity)`:

- Identity comes from the session — never from a query string, so
  one user can't peek at another's list.
- The GitHub search query targets the data repo with
  `label:via-dashboard` (and `label:anonymous` for anonymous
  contributors) PLUS a body substring (`- @login` or `**Pseudo**`).
- Each row deep-links to the entity page. The server detects the
  open PR for the current session on the entity load and serves the
  PR-branch content (not main's), so the contributor resumes from
  their in-flight state. Subsequent saves on that entity append a
  commit to the existing PR rather than opening a new one — the
  "1 PR per entity per contributor" invariant holds without the
  contributor having to think about it.
- A blue banner on the entity page surfaces the open PR number +
  links out to GitHub: "Resuming your in-progress PR #N. Every save
  will add a commit to it instead of opening a new PR."
- The save toast switches from "PR #N opened" to "Commit added to
  PR #N" in the resume case so the contributor knows the save did
  something even though the PR number is unchanged.

Refresh is manual. The GitHub search index has a few-second lag, so
a freshly-opened PR may not appear on the next reload; a "Refresh"
button on the panel covers that case.

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

## Deployment (Vercel)

See ADR-018 for the migration from the legacy Vite-SPA + Bun.serve
split runtime. Current shape:

- `vite build` produces `dist/client/` (browser assets) and
  `dist/server/index.mjs` (Node SSR + API handler).
- `bun run vercel-build` runs that, then
  `scripts/build-vercel.mjs` assembles the Vercel Build Output API
  layout under `apps/dashboard/.vercel/output/`:

  ```
  .vercel/output/
    config.json
    static/                ← dist/client/
    functions/
      _render.func/
        .vc-config.json    runtime: nodejs22.x
        package.json       { "type": "module" }
        index.mjs          wrapper: sets DATA_ROOT, imports server
        server/            dist/server/
        data/              repo data/ (catalogue reads)
  ```

- The wrapper sets `process.env.DATA_ROOT` to its own bundled
  `./data/` directory before importing the server bundle, so
  `packages/schema-engine/src/paths.ts` and
  `apps/dashboard/src/server/catalogue.ts` resolve `data/**` without
  relying on `import.meta.url` (which inside a Vercel function
  resolves to a path with no meaningful relation to the repo).

Vercel project settings:

- **Root Directory**: `apps/dashboard`
- **Install Command**: default (`bun install` walks up to the
  workspace root via `bun.lockb`)
- **Build Command**: `bun run vercel-build` (already in `package.json`)
- **Output Directory**: leave blank — Vercel auto-detects
  `.vercel/output/`

Required env vars at deploy:

- `SESSION_SECRET` — refuses to start in prod without it.
- `DASHBOARD_PUBLIC_URL` — Vercel-assigned origin, no trailing
  slash. Used for the OAuth callback URL (`<base>/api/auth/callback/github`).
- `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`.
- `GITHUB_APP_PRIVATE_KEY` — **inline** PEM contents. The
  `_PATH` variant doesn't work on Vercel (no filesystem to read
  from). Multi-line and `\n`-escaped single-line both accepted.
- `DATA_REPO` — `owner/repo` of the target data repo.
- `ADMIN_GITHUB_USERNAMES` — comma-separated logins with admin tier.

Optional:

- `R2_*` (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_BUCKET, R2_PUBLIC_BASE_URL, R2_MAX_UPLOAD_BYTES) — image
  uploads return 503 without these.
- `BLOCKED_GITHUB_USERNAMES`, `BLOCKED_IPS` — comma-separated
  kill-switches.
- `ANON_WRITE_LIMIT_PER_HOUR` (10), `ANON_UPLOAD_LIMIT_PER_HOUR` (20).

Stateful-but-not-shared caveats on serverless:

- OAuth `state` parameter is signed HMAC (stateless), so `/login`
  and `/callback` may land on different function instances. The
  5-minute TTL is enforced via the signed payload, not memory.
- Rate-limit counters live in process memory per function instance.
  Vercel keeps functions warm-ish so this provides partial
  protection; a determined abuser could cycle cold starts. Upgrade
  path: Vercel KV / Upstash Redis when needed.
