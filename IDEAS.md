# Ideas

This file is a parking lot. Entries here are **NOT planned** for the
current roadmap. They are recorded so we don't lose the thinking, and
so we can promote them when scope and capacity allow.

**Do not implement anything from this file without first:**

1. Moving the entry into `/docs/ROADMAP.md` (a real phase, real tasks,
   real exit criteria), AND
2. Logging the decision in `/docs/DECISIONS.md` as a new ADR.

A reference from another doc to an entry here is a forward-pointer
("we'll do this someday"), not a green light.

---

## In-universe documents as first-class entities

Wanted posters, vivre cards, newspapers, letters, maps, photographs,
flags, manuscripts. Would become a new entity type `document` with
subtypes (`wanted-poster`, `vivre-card`, `newspaper`, …).

Enables queries like:

- "all wanted posters issued by the Marines"
- "all vivre cards currently held by Luffy"
- "the front page of the World Economic News Paper at chapter N"

**Migration path** (non-destructive): existing images depicting such
objects stay as `image` entities. A `document` entity is created per
object (e.g. `document:luffy-wanted-poster-30m`) and carries a
`depicted-by` relation to its image. Existing `depicted-by` relations
from people to the poster-image are rewired to the document entity
when they're "depicting the document" rather than "depicting the
person".

See ADR-011 for the deferral rationale. Detailed image-to-document
walkthrough at the bottom of `/docs/IMAGES.md`.

## Knowledge graph (per-character knowledge)

Already documented in `/docs/DATA_MODEL.md` § "Knowledge graph" as a
deferred concept. Each character carries a list of facts they have
learned, with when, from whom, and how. Enables a "perspective of
character X at chapter Y" reader mode — for example, what does Zoro
know about Sabo's survival at chapter 730?

Out of Phase 1 scope. Promote when the basic spoiler filter is
shipped and contributors are asking for finer-grained POV filtering.

## External attestation references

Wikipedia-style references to external evidence (Oda interview
transcripts, vivre card scans, fan databases) for facts that wouldn't
fit cleanly into the canonical-source model (chapters / episodes /
SBS / databooks).

Would add:

- a `reference` entity type (with url, accessed_at, type, …)
- an `attested_by` qualifier on historisable values pointing at a
  `reference`

Distinct from in-universe `source` (which always points at a
canonical entity). Useful for trivia like "Oda confirmed on Twitter
that character X is Y years old."

## Fan theories

A `theory` entity type with strict separation from confirmed facts.
Includes:

- `status` (active, debunked, partially_confirmed, abandoned)
- `proponent_attribution` (the original poster, the YouTuber, the
  reddit thread)
- `posits_relation` (the relation the theory asserts, in the same
  vocabulary as confirmed relations, but never folded into the main
  graph)

The risk is contamination — theories drifting into the canonical
graph. The separation must be enforced at the schema level, not just
in UI.

## Cross-media voice / live-action cast

`voice-cast` and `live-action-cast` entity types linking in-universe
characters to real-world performers and the productions they appear
in. Distinct from in-universe entities — they're meta-canon.

Phase considerations: when the live-action Netflix run becomes a
significant content stream and users want to read about
casting/production, this stops being trivia.

## Real-time collaborative editing

Yjs (or similar CRDT) for concurrent dashboard editing. The current
optimistic-locking-via-SHA approach (Phase 4) suffices while the
contributor count is small. Relevant when active editors exceed ~10
or when conflicts on the same entity become frequent.

Not architectural — the data model doesn't need to change. It's a UX
investment in `apps/dashboard`.

## In-app schema admin panel

A dashboard page where maintainers can edit entity-type, property-type
and relation-type schemas without hand-editing JSON in
`/data/schemas`. Today changing `valid_to_types` on a relation (or
adding a new property to an entity type) means: open the JSON, edit
by hand, save, re-run validation. Risky and gate-kept by JSON
familiarity.

Surface would include:

- Entity type editor: rename, edit labels, add/remove properties,
  reorder, mark required, edit `valid_to_types` on relations the
  type can have.
- Property type editor: value_type, value_constraints, declared
  qualifiers, default qualifiers, label translations.
- Relation type editor: directionality, valid_from/to types,
  qualifiers, label active/inverse forms.
- Vocabulary editor: enum values + per-locale labels.

Save flow: schema files are still the source of truth, so the panel
opens a PR per change (same flow as entity edits). Schema mutations
are far higher-stakes than entity edits (downstream code, types,
build pipeline) so the PR needs CI to pass before merge — schema
admin edits should NEVER auto-merge.

**Prerequisites before promoting to roadmap:**

1. Schema migration story (`schema_version` bumps + per-entity
   migrations) — currently informal.
2. A clear list of which schema fields are safe vs. dangerous to
   change at runtime (rename property id ⇒ rewrite every entity).
3. RBAC: schema editing is admin-only, distinct from data editing.

Related forward-pointer: when the table view (`/types/:type/table`)
gets popular, the schema admin panel is the natural next layer up —
let maintainers fix the schema as easily as they fix data.

## AI-assisted editing + external-source ingest

Two related capabilities the dashboard could grow:

### 1. AI assistant inside the dashboard

A side panel that talks to an LLM (Claude / GPT) and can:

- Suggest values for empty fields ("you have no `epithet` for this
  character — Fandom lists 'Pirate King's right hand'; apply?").
- Translate name/description fields between locales when one side is
  filled and the other isn't.
- Summarize prose narratives into structured `personality_traits` /
  `abilities` lists.
- Sanity-check edits ("you set status=alive but the latest
  `died_at_chapter` is set — was that intentional?").
- Bulk-propose edits across an entity type ("fill missing `gender`
  on 47 characters") with a per-suggestion accept/reject UI.

Each AI suggestion becomes a normal form edit — same draft +
PR flow, same Co-authored-by attribution, same review path. The
LLM never bypasses the schema or the PR gate. `assisted_by`
qualifier on touched entries records which agent generated the
value, so contributors can later filter / sweep AI-touched data.

**Wiring:** server-side proxy (API key never reaches the browser),
streaming responses to the panel, token + cost telemetry per
session, hard cap per maintainer per day.

### 2. External-source ingest

Pull data from the existing One Piece corpus on the web. Two
priority sources:

- **Fandom (One Piece Wiki)** — `https://onepiece.fandom.com`
  - Structured fields via MediaWiki API + DBpedia-style
    infoboxes (bounty, devil fruit, crew, status…).
  - Unstructured prose (history, abilities, trivia) for narrative
    drafting, with the LLM extracting structured candidates.
  - Image licensing is fair-use Wikia content — image ingest stays
    OUT of scope; only metadata + text.
- **api-onepiece.com** — `https://api.api-onepiece.com/v2/<resource>/<locale>`
  - Examples:
    `https://api.api-onepiece.com/v2/luffy-techniques/fr`,
    `https://api.api-onepiece.com/v2/locates/fr`
  - Coverage skews to characters / fruits / techniques.
  - Quality varies: useful as a candidate-pool, not a source of
    truth. Every imported field needs maintainer confirmation
    before it lands.

**Ingest UI:** an "Import from external" affordance on every
entity edit page that opens a side-by-side diff (external value vs
current value) per matching field. Maintainer picks per-field
import. Each imported value's `source` qualifier records the
external URL so provenance is auditable; PR description lists
which fields came from which source.

**Translation duty:** never overwrite an existing translated value;
external sources fill _only_ missing locale slots.

### Prerequisites before promoting to roadmap

1. `assisted_by` qualifier vocabulary needs entries for the
   anticipated AI agents (claude, gpt-4o, gemini, …) — currently
   the qualifier is free-form text.
2. Image / fair-use story for Fandom (we explicitly punt on this
   here — text + structured only).
3. Rate-limit + caching layer for external HTTP calls; failures
   degrade silently rather than blocking edit flows.
4. Per-source confidence weights so the LLM doesn't treat
   api-onepiece.com data as canonical when Fandom disagrees.
5. Hard rule: external ingest NEVER auto-merges. PR review is the
   only path to landing imported data, period.

## Generic field dependencies / derived fields

Today the form has one hand-coded derivation: uploading an image
through `ImageUpload` auto-fills `format` (from MIME type) and
`image_width` / `image_height` (decoded in-browser). The hook lives
on `EntryValue` and uses a dedicated `setEmptyProperty` plumbed from
`EntityForm` — clean for one case, doesn't scale to N.

What "generic" would look like:

- A schema-level `derives` block on property declarations:
  ```json
  {
    "id": "format",
    "derives": { "from": "url", "via": "image-meta:format" }
  }
  ```
- A small registry of named derivers (`image-meta:format`,
  `image-meta:width`, `slug:prettify`, `iso-date:year`, …) the form
  resolves at update time.
- Apply rule: derived fields only set when currently empty (same
  guard as today's image flow), so manual overrides win.
- Derived state is opt-out per field via a tiny eye-toggle on the
  cell — useful for the rare case where a maintainer really wants
  `format: gif` on a PNG (e.g. mis-named asset).

**Prerequisites before promoting to roadmap:**

1. Settle the deriver naming + namespacing (probably `<source>:<op>`
   like the example) and decide if maintainers can define new ones
   per-project or if it's a built-in closed set.
2. Resolve cyclic dependency handling — A derives from B, B from A
   should error at schema-load, not at runtime.
3. Decide on derivation timing: on every change, or only when the
   source field transitions from empty to set (the latter avoids
   live re-derivation flicker while typing).
4. The table view (`/types/<type>/table`) needs to honour derivers
   too — bulk-saving 50 rows after uploading 50 images should fill
   the format column without 50 manual clicks.

---

## Apparitions hub (per-source cast manager + per-entity timeline)

Goal: make "who appears where" data quick to enter and easy to
audit. Today an entity's `appears-in` relations live deep in the
entity's relations editor, one at a time. The cast of a given
chapter has no UI surface at all — you'd have to scan every
character entity's relations array to find them.

**Data model: no schema change needed.** The
`appears-in` relation (character → manga-chapter, et al.) and its
inverse-inferred `features` (manga-chapter → character) already
encode this. The qualifier `appearance_type` (main / secondary /
flashback / cameo …) is already part of the schema. We just need
two UI surfaces over the existing data.

### Architectural constraint — sources ARE entities

Sources (`manga-chapter`, `anime-episode`, `film`, `sbs`,
`databook`) are themselves entities in `data/.../entities/`. We
do NOT want to break the existing entity edit flow for them:

- The cast-manager surface lives at a DIFFERENT route from the
  entity editor (`/sources/$type/$slug` vs `/types/$type/$slug`)
  so source-entities still get the full schema-driven form
  unchanged.
- The "Apparitions" surface on the entity edit page must NOT
  render for entities whose type is in `SOURCE_TYPE_IDS` (already
  defined in `apps/dashboard/api/server.ts`). Sources are the
  destinations of apparitions, never the origin — `appears-in`
  isn't even a valid relation from a source type per the schema's
  `valid_from_types`. Showing an "Apparitions: 0" empty state on
  a chapter's edit page would be visually wrong and confusing.
- For non-source entities, the Apparitions block lives in its own
  TAB or sub-page (`/types/character/luffy/apparitions`) — NOT
  inline on the main edit page. The main page stays focused on
  property + relation editing. A small badge on the tab header
  (`Apparitions · 47`) gives the count without polluting the
  default view.

### Surface 1 — per-source cast (the killer feature)

Route: `/sources/$type/$slug` (e.g. `/sources/manga-chapter/1`).

Layout:

```
┌────────────────────────────────────────────────────────────┐
│  Chapter 1 — Romance Dawn                                  │
│  〔manga-chapter:1〕                          [Edit chapter]│
├────────────────────────────────────────────────────────────┤
│  Cast                                                       │
│  ─ Characters (3) ──────────────────────  [+ Add character]│
│    ✓ Monkey D. Luffy        appearance: main        [×]    │
│    ✓ Coby                   appearance: main        [×]    │
│    ✓ Alvida                 appearance: main        [×]    │
│  ─ Devil fruits (1) ──────────────────────  [+ Add fruit] │
│    ✓ Gomu Gomu no Mi        appearance: introduced  [×]    │
│  ─ Crews (0)                              [+ Add crew]    │
│  ─ Concepts (0)                           [+ Add concept] │
└────────────────────────────────────────────────────────────┘
```

Server side:

- New endpoint `GET /api/sources/:type/:slug/cast` — reverse-
  scans every entity in the catalogue for `relations[]` whose
  `type === 'appears-in'` AND `target === '<type>:<slug>'`,
  groups by entity-type. The catalogue snapshot is in-memory
  already (data-source bundle), so this is fast even at 10k
  entities.
- New endpoint `POST /api/sources/:type/:slug/cast` —
  bulk mutation: `{ add: [{entityId, qualifiers}], remove:
  [entityId] }`. Server applies each delta to the appropriate
  entity JSON, then commits **all touched entity files in ONE
  commit via `commitMultipleFiles`** (already built for the
  per-save flow). Single PR titled "Add 5 / remove 1 cast entry
  on manga-chapter:1", body listing each entity touched.

Frontend:

- `src/routes/sources.$type.$slug.tsx` — list cast, group by
  entity-type, inline qualifier edits, bulk add via
  `MultiEntityRefInput` already in `inputs.tsx` (works exactly
  like `believed_by`).
- Same Save UX as the entity editor (dirty indicator, save bar,
  toast).

### Surface 2 — per-entity apparitions timeline

Route: `/types/$type/$slug/apparitions` — a separate sub-page,
NOT inlined on the main entity edit page (see "Architectural
constraint" above). The main edit page gets a tab strip near the
top:

```
[ Edit ] [ Apparitions · 47 ] [ Relations · 12 ]
```

The Apparitions tab is hidden entirely when the entity type is a
source. Today the Relations section shows `appears-in` mixed
with every other relation type — tedious to scan. The sub-page
shows ONLY `appears-in` relations, grouped by source-type tabs:

```
Apparitions  (12 total — 8 manga · 3 anime · 1 film)
┌─ Manga ─────────────────────────────────────────────┐
│ ▢ ch. 1   Romance Dawn      main                    │
│ ▢ ch. 4   Pirate Captain Buggy Arc   main           │
│ ▢ ch. 96  Loguetown          flashback              │
│ …                                                    │
└─────────────────────────────────────────────────────┘
┌─ Anime ─────────────────────────────────────────────┐
│ ▢ ep. 1   I'm Luffy!         main                   │
│ …                                                    │
└─────────────────────────────────────────────────────┘
```

Same data, different lens — still mutates the entity's own
`relations[]`, no new endpoint.

### Edge cases worth solving early

1. **Dedup**: adding the same target twice → server-side coalesces
   silently (last-write-wins on qualifiers).
2. **Removing the last apparition**: optionally prune the relation
   array entry instead of leaving an empty placeholder.
3. **Auto-bound`since`**: when adding a cast entry from source page
   X, default the `since` qualifier of the new `appears-in` to X.
4. **Cross-tab race**: two contributors editing the same chapter's
   cast at once would both open a PR. Each PR touches different
   entity files most of the time → both merge cleanly. Same files
   → optimistic-lock conflict (already wired).

### Effort

- ~1 day server (cast endpoints + bulk save)
- ~1.5 days frontend (sources page + apparitions sub-page on
  entity), assuming mobile-first primitives are in place
- ~0.5 day routing + sidebar nav entry

**Mobile-first is mandatory for this feature**, not an
after-the-fact pass. The cast manager is the contribution
surface most likely to be used on a phone (the contributor is
literally watching the episode they're cataloguing). Bulk-pick
of N characters has to work with a thumb. See "Mobile-first
dashboard UX hardening" below for the primitives needed first.

Prerequisite ADR (when promoted): document the bulk-save shape
since "1 PR touching N entity files" is a new flow distinct from
"1 PR touching 1 entity's files".

---

## Creating new entities from the dashboard

Today: the dashboard only edits entities that already exist on
disk. Adding a new character / chapter / devil-fruit means
hand-writing a JSON file in `data/...` and committing — a
maintainer-only operation.

**Goal**: a "+ New entity" affordance that makes entity creation
the same kind of PR-via-dashboard contribution as edits.

### UX

- "+ New" button on each type's list page (`/types/character` →
  next to "Table view"). Goes to `/types/$type/new`.
- **Mobile-friendly from day one** — see the "Mobile-first
  dashboard UX hardening" entry below. Slug input + form must
  work one-handed on a phone (touch targets, no hover-only
  affordances, sheet-based pickers). The expected primary
  contributor for new entities is the same audience as for
  edits: someone watching the source media and adding the
  missing character/episode/etc on the spot.
- New route renders the EntityForm pre-filled with:
  - `id: ''` (computed from slug)
  - `type: '<type>'` (from URL param)
  - `slug: ''` (user input)
  - `schema_version: <current>`
  - `properties: {}` (empty; required ones flagged red in the
    sidebar — already wired)
  - `relations: []`
- Slug input above the form, with live validation:
  - kebab-case regex
  - uniqueness check via `api.listEntities(type)` (cached)
  - red border + inline error if invalid / taken
- Save button disabled until slug is valid + at least required
  properties filled (same dirty/error logic as edit, just initial
  state is "everything missing")

### Server

- New endpoint `POST /api/entities/:type` (no slug in URL — slug
  comes from body).
- Validates:
  - slug format (Slug schema brand from `@onepiece-wiki/schemas`)
  - slug uniqueness (entity doesn't already exist in catalogue)
  - data shape via the same `buildEntitySchema(type, ...).safeParse`
    we already run on edit
- Constructs the file path
  `data/universes/<u>/entities/<type>/<slug>.json` and any
  translation files, then `commitMultipleFiles` + `openPullRequest`.
  Same flow as edit, just `path` is brand-new.
- Returns the same `SaveResult` shape so the frontend handler is
  shared.

### Frontend wiring

- `src/routes/types.$type.new.tsx` — wraps EntityForm with the
  blank initial state + slug input.
- After PR opens, redirect to `/types/$type/$slug` so the
  contributor can continue editing (resume-PR flow kicks in on
  next save).

### Edge cases

1. **What if Vercel build hasn't picked up the new entity yet?**
   The dashboard's bundled data source won't know about it until
   the next deploy. The contributor will see a "no entity found"
   if they refresh the entity page. Mitigation: after the PR
   opens, surface a "Your entity is in PR #N — it'll appear on the
   dashboard after merge + deploy" banner instead of redirecting.
2. **Slug already exists in a closed/merged PR but not on main yet**
   — the catalogue snapshot is from main, so we won't see it. The
   server's slug-uniqueness check passes, the new PR conflicts on
   `data/.../$slug.json` with the open PR. Real-world impact:
   second contributor's PR fails to merge with a clear conflict;
   no data corruption. Acceptable.
3. **i18n keys**: localizable properties auto-generate
   `<type>.<slug>.<prop>.<idx>` keys (already done by `makeI18nKey`
   in EntityForm). Works unchanged on a brand-new entity.

### Effort

- ~0.5 day server (one endpoint, mostly mirrors handleSaveEntity)
- ~0.5 day frontend (route + slug input component + post-create
  redirect)

### Prerequisites before promoting to roadmap

1. Settle whether anonymous contributors can create entities or
   only edit existing ones. Lower-cost moderation if creation is
   GitHub-only; broader contribution surface if open. Currently
   leaning "open by default since anon edits already work".
2. Decide on the post-create flow: redirect-to-edit (assumes the
   PR merges quickly) vs banner-and-stay (handles the real case
   where review takes hours).

---

## Mobile-first dashboard UX hardening

Current dashboard is laid out for a desktop maintainer at a
keyboard: 16rem fixed sidebar, multi-column popovers, hover-
based affordances, dense forms designed for ~1280px+ viewports.
The expected primary contributor workflow is the opposite —
someone watching an episode on their phone, pausing every few
minutes to log "Luffy used X technique against Y character in
this scene." This needs a top-to-bottom UX pass before opening
contributions to non-power-users.

### Inventory of what breaks below ~768px today

1. **AppSidebar** is hidden via `lg:block` — no replacement on
   mobile, so the entity-type list is unreachable from any page
   that isn't `/`. Effectively the user is stuck on whichever
   page they landed on.
2. **EntityForm save bar** is `fixed bottom-0` with `lg:left-64`
   to offset the sidebar. On mobile it covers the bottom of the
   page content but doesn't account for safe-area insets
   (notched phones eat the Save button).
3. **PropertyNav** (left rail with section progress + jump links)
   is also `lg:block`-hidden. A 60-property entity becomes one
   long scroll with no overview.
4. **Popovers** (Base UI `Popover`) render anchored to triggers
   with arrow positioning. On a 360px-wide screen, the
   MultiEntityRefInput popover (24rem fixed) overflows the
   viewport and triggers horizontal scroll. SourceRefInput's
   nested type-picker has the same issue.
5. **QualifierSheet** is already a side-drawer but at
   `max-w-[28rem]` it takes almost the full mobile viewport
   without leaving an obvious "close" affordance reachable with
   thumb.
6. **EntityEditDrawer** (right-side panel for linked entities)
   slides in at `max-w-[64rem]` — on mobile that's the whole
   screen, but there's no swipe-to-close gesture and the
   close button sits in the top-right corner (unreachable
   one-handed on a 6.7" phone).
7. **Login page** is `sm:grid-cols-2`. Below that breakpoint it
   stacks correctly but the long explainer text + dual sections
   means a contributor has to scroll past the GitHub section to
   reach "Continue without signing in" at the bottom.
8. **DraftsIndicator + LocaleSwitcher + Sign-in** in the header
   compete for horizontal space — they all collapse to icons-
   only at < 640px but the dropdowns they trigger then overflow.
9. **Sonner toasts** at `position='top-right'` are fine on
   desktop, awkward on mobile (cover the Save button after a
   `noOp` save). Should be `top-center` on small viewports.
10. **DiffPopover** is `w-[min(40rem,calc(100vw-2rem))]` — the
    viewport clamp works, but the per-row 50/50 split becomes
    cramped under ~400px. Unified-instead-of-split mode would
    read better on phone.

### Architectural moves

1. **Adopt a "container query" mindset, not viewport-only.** Most
   components shouldn't care about the window — they should react
   to their container width via `@container` queries (Tailwind v4
   supports `@xs:`, `@md:` etc. via the `@tailwindcss/container-
   queries` plugin). E.g. EntityForm rendered inside
   EntityEditDrawer should narrow gracefully without consulting
   `window.matchMedia`.
2. **Sheet primitive on mobile, Popover on desktop.** Add a
   `<MobileSheet>` component (slide-up bottom drawer) wrapped in
   a `usePopoverOrSheet` hook that picks based on viewport. Apply
   to: MultiEntityRefInput, SourceRefInput, QualifierSheet,
   DraftsIndicator, MyContributions. Native iOS/Android pattern;
   thumb-friendly.
3. **Bottom nav on mobile, sidebar on desktop.** AppSidebar →
   render its links as a fixed bottom tab bar below ~768px. 5
   slots max (Entities · Drafts · Apparitions · My PRs · Account).
4. **PropertyNav → collapsible sticky header on mobile.** A "Jump
   to section…" select at the top of the form instead of the
   side rail. Same data, different layout.
5. **Save bar respects `env(safe-area-inset-bottom)`.** Add
   `pb-[env(safe-area-inset-bottom)]` to the fixed bar.
6. **Touch targets ≥ 44px.** Audit `size-icon` buttons (currently
   24-28px). Easy win in `Button` variants.
7. **Service Worker / offline drafts**. Drafts already live in
   IndexedDB; add a service worker that caches the SPA shell +
   API responses for the last viewed entity so a flaky train ride
   doesn't cost the contributor their session.

### Performance budget (mobile-first)

Current bundle sizes (from the last Vite build):

- `_libs/@aws-sdk/client-s3+[...].mjs` — **733 KB** (165 KB gzip)
  ⚠️ shipped server-only but bundled in the SSR chunk
- `_libs/@tanstack/react-router+[...].mjs` — 649 KB (135 KB gzip)
- `_libs/@base-ui/react+[...].mjs` — 408 KB (88 KB gzip)
- Client routes are decently small (10–25 KB each)

**Action items:**

- Make the AWS SDK truly server-only (it's used only in
  presign-upload). Today it leaks into the SSR bundle because
  `r2.ts` is imported from `server.ts` and Vite's tree-shake
  doesn't isolate it from any browser-bundled neighbour. Audit.
- Lazy-load the table view (`types.$type.table.tsx`) — biggest
  client route at 24 KB. Split via dynamic import.
- Pre-bundled data (ADR-019) inflates the SSR by ~80 KB today.
  At 1000+ entities this becomes significant. The same
  router-A.mjs chunk would balloon. Threshold to revisit:
  ~500 KB raw data → switch to fetch-on-demand from GitHub.

### Concrete first PR (when promoted)

A "mobile triage" PR that ships the highest-impact fixes only:

1. AppSidebar → bottom nav on mobile (route changes still work).
2. Save bar safe-area inset.
3. MobileSheet for ONE popover (MultiEntityRefInput) as a
   reference implementation.
4. Sonner toaster position-by-viewport.
5. Button min-touch-size audit.

Everything else (container queries, service worker, perf budget)
gets its own follow-up. Ship one visible mobile improvement
before deep-refactoring.

### Effort

- ~1 day for the triage PR above (high impact, low risk).
- ~3 days for the full sheet/popover swap + bottom nav + tabs.
- ~1 day per "deeper" item (service worker, container queries
  migration, performance budget enforcement in CI).

### Prerequisites before promoting to roadmap

1. Pick the bottom-nav library (Base UI doesn't ship a Tab Bar
   primitive — could be a custom 80-line component, or pull in
   `vaul` / `@radix-ui/react-tabs` etc.).
2. Decide what "mobile" means concretely — Tailwind's `md`
   breakpoint (768px), or detect by pointer-coarse + max-width
   together (catches small-screen-mouse vs large-screen-touch).
3. Budget for usability testing on real phones — at least
   one round with the maintainer on an iPhone + an Android
   mid-range before opening to contributors.
