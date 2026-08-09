# Public wiki app (`apps/web`) — "One Piece Wiki"

The public, read-only wiki over the SQLite artifact (`dist/onepiece.db`,
ADR-086). This doc is the architecture + presentation spec; the strategic
rationale is ADR-027, the skeleton decision is in STATE (2026-08-08), the
presentation-layer contract is ADR-091, and the spoiler semantics are
`/docs/DATA_MODEL.md` § progression cursor + `/docs/EPISTEMIC_MODEL.md`.

## Identity

- **Name**: One Piece Wiki (header wordmark; `<title>` suffix).
- **Style** (v7 "Vignette", 2026-08-09 — a modern, image-forward
  reference product; the register of a high-end film/streaming
  catalogue, with its own identity). **The connection is the core
  unit**: every reference to another entity renders as an image-led
  link module — thumbnail (shared EntityImage, monogram fallback) +
  name + precise sub-label (role, period, type) — and entity pages
  are HUBS of connections grouped by relation type, **ordered by
  importance** (well-known-id priority list, ADR-091: crew → fruit →
  techniques/weapons → family → … ; unknown ids fall to the end but
  always render). **Designed for scale**: each group shows a
  collapsed budget (8 rows / 12 posters / 28 numbers) and folds the
  tail behind a "Show N more" toggle; chapters/episodes use compact
  number grids, never page-long dumps. **Former members are
  VISIBLE**: poster grids show active AND former members; former
  ones are subdued (dimmed image) with a "Former" tag and their
  period — and the spoiler rule holds: a departure anchored beyond
  the reader's cursor renders as CURRENT (`isDepartureVisible`,
  `server/progress.ts`). Typography: Archivo Variable semi-expanded
  (font-stretch 115%) is the display voice — wordmark, entity names,
  section titles, figures; Inter carries data/UI; tabular numerals.
  Chrome: slim sticky top bar over the **Log scrubber** — the
  manga-axis progression as a modern gold progress track (gold fill
  to the cursor, labeled marker, gold diamonds at the page's
  knowledge anchors, computed from already spoiler-filtered entries
  so it can never leak). Modern polish, restrained: small radii
  (2–6 px), hairline rings, subtle surface steps, deliberate hover
  states (ring inks accent, names ink accent); no pill soup, no
  gradients, no glassmorphism, no empty heroes. Palette: warm
  charcoal canvas (oklch ≈0.18 hue 68), bone foreground, GOLD for
  identity + stats (progress, bounty, monograms), VERMILLION for
  interactive accents.
- **Footer (every page)**: GitHub repository link
  (`https://github.com/7IBO/one-piece-wiki-v4`) and a support link
  (`https://buymeacoffee.com/7ibo`), plus locale switcher.

## Non-negotiables inherited from the repo

- Read-only: the app NEVER mutates data. All contribution flows link out
  to the dashboard.
- Every page must degrade gracefully when data is missing (no image → no
  broken slot; unknown entity type → generic template).
- No business logic in components: view-models are computed in
  `apps/web/server/views.ts` (server), components render them.

## Spoiler gating (the "non-spoil" part)

The user's progression is a multi-dimensional cursor
(`DATA_MODEL.md`): v1 axes are `manga_chapter` (number) and
`anime_episode` (number). Stored in the `web_progress` cookie as JSON;
absent cookie = **no filtering** (wiki default) with a prominent
first-run banner inviting the reader to set their progression.

Semantics (v1):

1. A historisable entry with `since: "<type>:<n>"` on a numeric source
   axis is VISIBLE iff `n <= cursor[axis]`. Entries with no `since` are
   always visible. Entries anchored to a non-numeric / non-axis source
   (film, sbs) are visible by default in v1 (documented limitation).
2. Cross-medium reachability: reaching an anime episode implicitly
   reaches the chapters it adapts (and vice versa) via `adapted-by`
   when present; v1 approximates with the per-axis cursors only —
   the reader sets both.
3. An entity page whose every `appears-in`/`first_source` anchor is
   beyond the cursor renders as a "not yet in your progression" screen
   (name shown, data withheld) rather than a 404 — the reader chose the
   URL; we warn, we don't gaslight.
4. Epistemic reveals: an entry whose `epistemic_status` is a
   believed-state with `actual_value` shows ONLY the believed value
   until the revealing source (the entry carrying the revealed state)
   is within the cursor. Handled naturally by (1) since reveals are
   later entries.
5. Relation edges carry `since` too — same rule as (1).
6. Images: an image whose `spoiler_since` is beyond the cursor is not
   rendered (alt slot hidden entirely).

The cursor UI: header button "📍 Ch. 1044 · Ép. 1071" (or "Définir ma
progression") opening a small panel with the two numeric inputs +
"tout afficher" reset. Server functions read the cookie so SSR output
is already filtered — no client-side flash of spoilers.

## Canon-scope context (live-action, films…)

Navigation carries an optional `scope` search param (e.g.
`?scope=live_action`, values from the `canon-scopes` vocabulary).
Set automatically when the reader navigates FROM an entity whose
`canon_scope` latest value (or type: `live-action-series` /
`live-action-episode`) implies a scope.

Effect on an entity page (v1 = images + flagged values):

- **Images**: prefer `depicted-by` targets whose `source_origin`
  matches the scope (`live_action` scope → `live_action` images;
  default scope → manga/anime origins first). Fallback: any
  spoiler-visible image, else no image.
- **Values**: entries whose `canon_scope` qualifier matches the scope
  are preferred over unqualified entries where both exist for the same
  property; entries scoped to a DIFFERENT scope are dropped from the
  main infobox (they remain in the full data view via the dashboard).
- Without the param, default behaviour: unqualified + `manga`/`anime`
  scoped values, and non-live-action image origins preferred.

## Per-type layouts (ADR-091)

`apps/web` may bind to WELL-KNOWN type/relation/property ids as a
presentation concern (contra the dashboard, which stays 100%
schema-driven). Binding rules: every binding must degrade to the
generic template when the id is absent from the catalogue or the data
— so the app keeps working for other universes later.

Templates (v1):

- **character**: infobox (portrait image, name(s), epithet, bounty,
  status incl. epistemic badge, birthday, age, height, haki) ·
  affiliation section (crew/organization via `member-of` with `role` /
  `held_rank`, showing the OTHER members of the crew with portrait
  thumbnails) · devil fruit (`ate-fruit`) · techniques
  (`uses-technique`) · weapons (`wields-weapon`) · relations
  (family/allies/rivals) · apparitions summary · narrative prose.
- **crew** (and `organization`): infobox (flag image, name, ship,
  leader DERIVED from the active incoming `member-of{role:
  leader|captain}` edges — `led-by` was removed by ADR-099 — plus,
  for crews, a derived "Total bounty" stat summing the active
  members' latest cursor-visible bounties) · **member list with portrait
  thumbnails, roles and ranks** (inverse of `member-of`, grouped
  current/former via `until`) · territory/ship sections when present.
- **manga-chapter / anime-episode** (source types): header with number
  - title · **prev/next buttons** (same-type, by `number`) · arc
    banner (via `part-of-arc` / `occurs-during-arc`) linking to the
    **arc's episode/chapter list** · season list when season data
    exists · **cast** ("personnages présents" — inverse `features`,
    grouped by entity type with thumbnails) · availability
    (`available-on`, region-aware `link_template` resolution, ADR-090) ·
    release/publication data.
- **arc / saga**: ordered chapter+episode lists (inverse `part-of-arc`
  by `number`), cast aggregation, prev/next arc within the saga.
- **devil-fruit**: infobox (type/classification, image) · current +
  former users (inverse `ate-fruit` with `since`/`until`) ·
  awakening/techniques when present.
- **Everything else**: generic template (current skeleton), which is
  also the fallback whenever a specific template's data is missing.

## Contribute strip (bottom of every entity page)

A quiet full-width strip: "Ces données sont libres —" with buttons
**Voir / modifier les données** → `<DASHBOARD_URL>/types/<type>/<slug>`
and **Historique** → `<DASHBOARD_URL>/types/<type>/<slug>/history`.
`DASHBOARD_URL` comes from `VITE_DASHBOARD_URL` (build-time env),
defaulting to the production dashboard.

## URLs (2026-08-09)

Canonical page URLs are **`/{type}/{slug}`** with the ENTITY TYPE ID
as segment — `/character/monkey-d-luffy`, `/crew/straw-hat-pirates`,
`/manga-chapter/chapter-1044` — and type listings at `/{type}`.
The historical `/e/{type}/{slug}` and `/t/{type}` paths 301-redirect
to the canonical form, preserving `?scope=`. `$type` is validated
against the catalogue server-side (unknown → not-found flow). The
production domain (`one-piece.wiki`) is deploy configuration owned by
the maintainer — the app only assumes root-relative paths.

## Image treatment (2026-08-09 — "moins IA")

One shared image component renders EVERY image in the app. Rules:

- A broken or still-loading image is NEVER shown raw: load state is
  tracked and the designed fallback renders until a real image
  confirms; when an entity has no image at all, the infobox has no
  image block (no empty frame pretending to be a photo).
- The fallback is a monogram tile — entity initial in the display
  face, gold on a quiet surface step with a hairline ring. Radius
  follows the caller (2–6 px scale). No AI-ish stock gradients, no
  glassmorphism, no emoji.
- Aspect ratios are reserved (3:4 portraits, 1:1 thumbs), covers use
  `object-fit: cover`, `loading="lazy"`, and a subtle (~200 ms)
  fade-in when a real image lands.

## i18n

UI strings FR/EN mirrored from the reader locale (`web_locale` cookie,
SSR-correct). Data translations come from the artifact's
`translations` table; missing locale falls back to EN then to the key.
URLs stay locale-free (slugs are English, CLAUDE.md).

## Out of scope for v1 (parked, see ROADMAP Phase 6.x)

Search, SEO/SSG pass, OG images, comparison view, relation graphs,
per-arc easter eggs, PWA/offline.
