# Public wiki app (`apps/web`) — "One Piece Wiki"

The public, read-only wiki over the SQLite artifact (`dist/onepiece.db`,
ADR-086). This doc is the architecture + presentation spec; the strategic
rationale is ADR-027, the skeleton decision is in STATE (2026-08-08), the
presentation-layer contract is ADR-091, and the spoiler semantics are
`/docs/DATA_MODEL.md` § progression cursor + `/docs/EPISTEMIC_MODEL.md`.

## Identity

- **Name**: One Piece Wiki (header wordmark; `<title>` suffix).
- **Style** (v8 "Grand Line", 2026-08-09 — an official franchise
  universe database: immersive, cinematic, branded. The reference
  register is `starwars.com/databank` and the LoL champions page, NOT
  a neutral reference work, an editorial layout or an arty minimal
  page — all three were explicitly rejected.)
  - **The artwork is the interface.** Every entity carries a
    deterministic generated composition (ADR-102). Entity pages open
    on a **full-bleed hero** built at the wide `hero` frame and a
    raised detail level, stacked three deep — a blurred over-scaled
    copy for atmosphere, the composition itself barely defocused so
    its hard tile-scale edges melt instead of reading as seams at
    1440 px, then two scrims (vertical, dissolving the stage into the
    canvas; horizontal, weighting only the type side). EVERY entity
    gets a hero, picture or not. Listings are walls of full-tile art
    with the name over the composition.
  - **Colour comes from the entity, not the chrome** (ADR-103).
    `lib/entity-tint.ts` hashes the id into a chord and emits CSS
    custom properties; `.tinted` re-points the theme tokens so every
    Tailwind utility inside an entity page is already that entity's
    colour, and the `--art-*` tokens are re-pointed on every tile so a
    grid is individually coloured. The accent's lightness is raised
    until its measured WCAG contrast against the canvas clears 4.5 —
    swept over all 360 hues in tests. Chrome, footer and listings keep
    the neutral tokens so navigation never wobbles.
  - **Facet-filtered collections.** Type listings derive their filters
    from the SCHEMA (`buildFacets`, `server/views.ts`): any declared
    enum property that actually splits the population becomes a facet,
    labelled through its vocabulary, counted server-side against the
    reader's cursor. No facet list exists to maintain; a type with no
    enum property renders no filter bar (ADR-091 degradation).
  - **The connection is still the core unit**: every reference is an
    image-led link module — thumb + name + precise sub-label (role,
    period, type) — grouped by relation type with counts and
    **ordered by importance** (well-known-id priority list, ADR-091:
    crew → fruit → techniques/weapons → family → …; unknown ids fall
    to the end but always render). **Designed for scale**: each group
    shows a collapsed budget (8 rows / 12 tiles / 28 numbers) and
    folds the tail behind a "Show N more" toggle.
  - **Former members stay VISIBLE**: shown with a "Former" tag, their
    period and a subdued tile — and the spoiler rule holds, a
    departure anchored beyond the reader's cursor renders as CURRENT
    (`isDepartureVisible`, `server/progress.ts`).
  - **Motion is part of the finish**: tiles lift and their art scales
    on hover, the ring takes the entity's colour. Nothing informative
    hides behind hover (touch readers never hover), and `.motion-lift`
    is cancelled wholesale under `prefers-reduced-motion`.
  - Typography: Archivo Variable, expanded (font-stretch 115%) and
    heavy, is the branded display voice — wordmark, entity names set
    uppercase at hero scale, section titles, figures; Inter carries
    data/UI; tabular numerals throughout.
  - Chrome: slim sticky top bar over the **Log scrubber** — the
    manga-axis progression as a gold progress track (fill to the
    cursor, labelled marker, diamonds at the page's knowledge anchors,
    computed from already spoiler-filtered entries so it cannot leak).
    `main` is full-bleed; every page opts into `.page-column` for its
    reading column, so a hero spans the viewport without a `100vw`
    breakout (which would overflow by the scrollbar width).
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

One shared image component renders EVERY image in the app
(`components/EntityImage.tsx`). Rules:

- A broken or still-loading image is NEVER shown raw: load state is
  tracked and the designed ground renders until a real image
  confirms; when an entity has no image at all, the infobox has no
  image block (no empty frame pretending to be a photo).
- That ground is **generated artwork**, not a monogram tile (see
  below). No AI-ish stock gradients, no glassmorphism, no emoji.
- Aspect ratios are reserved (3:4 portraits, 1:1 thumbs), covers use
  `object-fit: cover`, `loading="lazy"`, and a subtle (~200 ms)
  fade-in when a real image lands.

## Generative entity art (2026-08-09, ADR-102)

The corpus has essentially no pictures, so the placeholder is the
artwork on screen, on every card, thumb and portrait. `lib/entity-art.ts`
turns an entity id into an abstract composition; `components/EntityArt.tsx`
renders it as inline SVG.

- **Deterministic**: the id is hashed (FNV-1a) and every parameter is
  drawn from a seeded PRNG (mulberry32). Same id → byte-identical
  markup, forever, on server and client. No `Math.random`, no `Date`,
  no requests, no client JS, no layout shift.
  **Cross-engine determinism is part of that contract**: the scene is
  emitted by Bun (JavaScriptCore) during SSR and recomputed by V8 at
  hydration, so no implementation-defined operation may feed a
  threshold. `Math.hypot` did (the engines disagree on ~11% of inputs,
  and the screentone tests distance against a radius), which cost a
  React hydration mismatch on every page carrying art; distance goes
  through `Math.sqrt` — correctly rounded by IEEE-754 — and coordinate
  rounding biases ties consistently. A source-level test guards it,
  since one engine can never observe the divergence.
- **Per-type grammar**: each entity type maps to a visual family —
  `character → figure` (eclipse / cropped profile / column, and
  deliberately no head-and-shoulders silhouette, which is the avatar
  icon we are running away from), `crew → ensign` (mast, flag,
  emblem), `arc → horizon` (strata, sun, sail), `event → impact`
  (shards from an off-frame focal point), `devil-fruit → spiral`,
  `manga-chapter → panels` (a comic page), `volume → stack` (a cover
  over a stack of leaves), `document`/`reference` → `folio`. **Any
  unmapped type degrades to the generic `field` family**, whose
  variant is picked from the TYPE hash so a new type is instantly
  self-consistent without touching code (ADR-091 degradation rule).
- **Re-skinning is a stylesheet edit**: the generator emits only
  `var(--art-*)` references. The nine tokens live in `src/styles.css`
  (`--art-bg`, `--art-ink`, `--art-glow`, `--art-1..6`) and are roles,
  not hues — ink is the dark mass, glow the light one, 1..6 an
  interchangeable wheel compositions draw a chord from. Changing the
  site palette means changing those nine values, nothing else.
- **Frames**: `portrait` (3:4), `square`, `wide`, and `hero`
  (1440x560, the page stage) — composed for the frame (the ratio joins
  the seed), never stretched. `hero` also raises the **detail level**:
  grammars scale their repeated elements by it, and two generic passes
  wrap the grammar — `atmosphereBack` sweeps large masses UNDER it
  (they read through the translucent ground as depth) and
  `atmosphereFront` lays dust, rays and a glint OVER it. Tiles are
  unaffected: detail is 1 for every other frame.
- **Per-entity colour** (ADR-103): `lib/entity-tint.ts` re-points the
  `--art-*` tokens per tile from the entity's own chord, so the wheel
  below is the neutral default and no two entities share a palette.
- **Review**: `bun run -F @onepiece-wiki/web art:preview [out.html]`
  writes a contact sheet of the whole corpus at every frame, plus an
  unknown-type degradation strip. It reads the tokens out of
  `styles.css`, so it always shows the current skin.

## i18n

UI strings FR/EN mirrored from the reader locale (`web_locale` cookie,
SSR-correct). Data translations come from the artifact's
`translations` table; missing locale falls back to EN then to the key.
URLs stay locale-free (slugs are English, CLAUDE.md).

## Out of scope for v1 (parked, see ROADMAP Phase 6.x)

Search, SEO/SSG pass, OG images, comparison view, relation graphs,
per-arc easter eggs, PWA/offline.
