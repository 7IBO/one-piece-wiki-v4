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

The `ui_hint.group` taxonomy (group order + localized labels + the
unknown-group fallthrough) lives in one shared module,
`apps/dashboard/src/lib/type-groups.ts`, used by both the sidebar and
the home page grid so the two surfaces always cluster types
identically. The home page renders groups in that fixed order (never
reordered by entity count) and folds types with zero entities into a
single collapsed "Empty types (N)" section at the end.

## Entity list: per-row completeness (ADR-083)

`GET /api/entities/:type` attaches a `completeness: { filled, expected }`
pair to every row. `expected` counts the entity-type declaration's
properties flagged `required` or `recommended` plus its
`recommended_relations`; `filled` counts those the entity actually
carries (≥1 entry for a property, ≥1 relation of the recommended type).
Computed in `apps/dashboard/server/completeness.ts` from the
already-loaded snapshot — schema-driven (no property name in code), no
extra I/O, O(entities) per request. Advisory only: validation never
blocks on it. The type list route renders it as a subtle
`filled/expected` meter per row (amber while incomplete, muted
checkmark when full); the home page shows counts only.

## Cross-type data explorer (`/explore`, `GET /api/audit`)

One flat, filterable list of EVERY entity across all types — the
maintainer's audit surface for "what's missing where".

**Endpoint**: `GET /api/audit` (public read, like the other catalogue
endpoints) returns `{ rows }`, one row per entity in the snapshot:

- `id`, `type`, `slug`, `displayName {en,fr}` — same resolution as the
  list endpoints (`buildDisplayNames`).
- `completeness {filled, expected}` — reuses
  `server/completeness.ts` (ADR-083), not duplicated.
- `missingRecommended: string[]` — the LIST of expected fields the
  entity lacks: required-or-recommended property ids with no content
  (same `propertyHasContent` semantics as the meter, exported
  additively from `completeness.ts`) plus `recommended_relations`
  types with no edge.
- `missingTranslations: string[]` — i18n keys the entity references
  (`canonical_name_key` + every property entry's `value_key`) that
  lack EN or FR text in the loaded translation files, reported per
  missing locale as `key (en)` / `key (fr)`.
- `values` — every present property with ALL its entries (not just
  the latest), each pre-rendered server-side to a display string the
  way lists render values: translated `value_key`, vocabulary labels
  for enum/multi_enum (resolved through the catalogue, never
  hardcoded), `number` + unit, boolean ✓/×, display names for
  entity/source refs; plus the entry's `since` provenance. One string
  per entry, EN-first with FR fallback.

All per-entity computation is pure in `apps/dashboard/server/audit.ts`
(unit-tested in `server/__tests__/audit.test.ts`); the handler in
`server.ts` only gathers the snapshot + per-entity translations +
display names. Payload is a few hundred KB at catalogue scale —
accepted, same O(entities) budget as `/api/sources`.

**Route**: `/explore` (`apps/dashboard/src/routes/explore.tsx`, sidebar
entry under Overview). Sticky toolbar with an entity-type multi-select
(stay-open checkbox popover fed by the schema catalogue), a
name/slug/id search box, and three toggle filters: missing
translations, missing values (`missingRecommended` non-empty), and
hide-complete (nothing missing on either axis). Rows show the display
name, a type chip, amber "N missing translations" / "N missing values"
badges and the ADR-083 completeness meter; each row expands
(Collapsible) to the full values list (property labels localized from
the catalogue, every entry with its `since`) and the missing lists in
full. Rows virtualize via `@tanstack/react-virtual` past 100 entries.
The per-row edit button opens the existing `EntityEditDrawer` (normal
schema-driven form + PR flow); closing the drawer refetches the audit
(stale-while-refetch, list stays on screen).

## Entity links panel + inverse-coherence detection

`GET /api/entities/:type/:slug/links` returns every link of an entity
in BOTH directions plus detected inconsistencies between a relation
and its stored inverse:

- `outgoing` — the entity's own relations: `{ relationType, target,
  qualifiers, targetRoute, targetDisplayName }`. `targetRoute` is the
  `{ type, slug }` pair for deep-linking (entity ids are
  `type:fileBase`, and the file base may differ from the slug), null
  for dangling targets.
- `incoming` — a reverse scan over ALL entities for relations whose
  target is this entity: `{ relationType, sourceEntityId, qualifiers,
  sourceRoute, sourceDisplayName }`. The client renders these under
  the relation type's **inverse** label from the schema catalogue.
- `conflicts` — each `{ kind, relationType, otherEntityId, detail }`:
  - `duplicate-symmetric` — the same relation type is stored on BOTH
    sides between the same two entities (A stores rel→B and B stores
    rel→A) with matching `since`. The build pipeline generates
    inverses, so storing both sides double-stores the edge. Detection
    is schema-driven, never a hardcoded type list: the trigger is the
    same relation-type id in opposite directions; symmetric labels
    (`active == inverse`) only enrich the message.
  - `duplicate-edge` — the same `(type, target)` appears twice in one
    entity's relations with no distinguishing `since`/`until`.
  - `qualifier-mismatch` — both sides store the same symmetric edge
    with DIFFERENT `since` values.

Pure logic lives in `apps/dashboard/server/links.ts` (unit-tested);
the reverse index is built in one pass — O(entities × relations) per
request, the same accepted scan budget as the cast endpoint
(ADR-019/ADR-021 risk note). Display names + routes are resolved in
`server.ts` from the already-loaded snapshot.

The client surface is `EntityLinksPanel`
(`apps/dashboard/src/components/EntityLinksPanel.tsx`), rendered
below the form on the entity page. It fetches lazily on mount
(`api.entityLinks`), is collapsed by default on mobile and open from
`sm:` up, and renders: an amber conflicts banner at the top (localized
kind labels), then "Incoming links" / "Outgoing links" sections
grouped by relation type (inverse resp. active labels from the
catalogue), each row a deep link to the other entity plus its compact
qualifiers. Localized EN/FR via the `UI_STRINGS` pattern.

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

**Shipped (v1, W-B slice 1):** `GET /api/admin/pulls` (admin-gated;
`listAdminQueue` in github-client searches open `via-dashboard` PRs and
parses the contributor from the body's Contributors bullet) + the
`/admin/queue` route: list (title, labels, contributor, updated),
Review-on-GitHub link, **Approve & merge** (→ `/api/admin/promote`) and
**Reject** (→ `/api/admin/reject`). `/api/auth/me` now carries
`admin: true` for configured admins so the client can gate the surface.
**Slice 2 (same PR):** in-app structured diff — admin-gated
`GET /api/admin/pulls/:n/detail` computes the per-entity property
diffs + relation add/remove deltas + changed translation keys
server-side (`server/diff.ts`, pure + unit-tested) from the PR's
base/head file contents; the queue row expands into the rendered diff
(no GitHub round-trip for the reviewer). Still pending: CI status,
request-changes action, staged-image thumbnails:

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
