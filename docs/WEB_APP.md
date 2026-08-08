# Public wiki app (`apps/web`) — "One Piece Wiki"

The public, read-only wiki over the SQLite artifact (`dist/onepiece.db`,
ADR-086). This doc is the architecture + presentation spec; the strategic
rationale is ADR-027, the skeleton decision is in STATE (2026-08-08), the
presentation-layer contract is ADR-091, and the spoiler semantics are
`/docs/DATA_MODEL.md` § progression cursor + `/docs/EPISTEMIC_MODEL.md`.

## Identity

- **Name**: One Piece Wiki (header wordmark; `<title>` suffix).
- **Style**: wiki-first — content-dense, link-dense, Wikipedia-inspired:
  right-hand infobox on entity pages (stacks on mobile), prose sections,
  muted chrome, generous internal linking. Dark + light themes.
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
  captain via `captained-by`/`led-by`) · **member list with portrait
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

## i18n

UI strings FR/EN mirrored from the reader locale (`web_locale` cookie,
SSR-correct). Data translations come from the artifact's
`translations` table; missing locale falls back to EN then to the key.
URLs stay locale-free (slugs are English, CLAUDE.md).

## Out of scope for v1 (parked, see ROADMAP Phase 6.x)

Search, SEO/SSG pass, OG images, comparison view, relation graphs,
per-arc easter eggs, PWA/offline.
