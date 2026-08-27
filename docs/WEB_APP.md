# Public wiki app (`apps/web`) — "One Piece Wiki"

The public, read-only wiki over the SQLite artifact (`dist/onepiece.db`,
ADR-086). This doc is the architecture + presentation spec; the strategic
rationale is ADR-027, the skeleton decision is in STATE (2026-08-08), the
presentation-layer contract is ADR-091, and the spoiler semantics are
`/docs/DATA_MODEL.md` § progression cursor + `/docs/EPISTEMIC_MODEL.md`.

## Identity

- **Name**: One Piece Wiki (header wordmark; `<title>` suffix).
- **Style** (v8.1 "Grand Line", 2026-08-09 — an official franchise
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
  - **Colour comes from the entity, not the chrome** (ADR-103), out of
    a **curated gold-anchored palette** (ADR-104).
    `lib/entity-tint.ts` hashes the id into one of TEN hand-authored
    chords — `or` (the anchor), `laiton`, `ocre`, `cuivre`, `safran`,
    `orange-brule`, `vermillon`, `sang-de-boeuf`, `terre`, `ambre` —
    and emits them as CSS custom properties; `.tinted` re-points the
    theme tokens so every Tailwind utility inside an entity page is
    already that entity's colour, and the `--art-*` tokens are
    re-pointed on every tile so a grid is individually coloured.
    **The whole palette lives in one warm band (12°–100° oklch)**:
    no green, no cyan, no blue, no violet, anywhere — a free hue wheel
    was tried first and read as random noise. Because the chords
    cannot separate by hue they separate by **value structure**: each
    authors its own ground / dark mass / highlight (grounds run
    0.17 → 0.31 in lightness, paints span ≥ 0.4 within a chord), which
    is what keeps a wall of thumbs varied. The accent's lightness is
    raised until its measured WCAG contrast against the canvas clears
    4.5. Chrome, footer and listings keep the neutral tokens so
    navigation never wobbles — and **gold is the constant identity**
    (wordmark, bounty figures, focus ring) whatever chord a page is on.
  - **Facet-filtered collections.** Type listings derive their filters
    from the SCHEMA (`buildFacets`, `server/views.ts`): any declared
    enum property that actually splits the population becomes a facet,
    labelled through its vocabulary, counted server-side against the
    reader's cursor. No facet list exists to maintain; a type with no
    enum property renders no filter bar (ADR-091 degradation).
  - **v9 (2026-08-09) — each type is its own page.** The colours
    (ADR-104) and the chrome above are unchanged and accepted; what
    changed is the entity page's LAYOUT: a per-type band registry
    (ADR-106), a backdrop + poster hero, prev/next for sequential
    entities, and every property's history inline in the data sheet.
    See § Per-type layouts below.
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
  - Chrome: ONE slim sticky top bar — wordmark, the compact
    progression control, the locale switcher. Nothing else. The
    graduated manga-axis rail that used to span the header (the "Log
    scrubber", v5–v8) was **removed in v8.1**: a permanent full-width
    chart of the whole series above every page was chrome shouting
    over content, and it was never liked. The reader's position stays
    permanently visible — it is the label of the progression control,
    in gold ("Ch. 600 · Ép. 1071") behind a gold hairline — and one
    click opens the same form. Spoiler semantics are untouched
    (`web_progress` cookie, SSR-filtered first paint).
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

## Per-type layouts (ADR-091, ADR-106)

`apps/web` may bind to WELL-KNOWN type/relation/property ids as a
presentation concern (contra the dashboard, which stays 100%
schema-driven). Binding rules: every binding must degrade to the
generic template when the id is absent from the catalogue or the data
— so the app keeps working for other universes later.

### The layout registry (v9, ADR-106)

An entity page is a fixed vocabulary of **modules** (slots):

| slot                 | what it renders                                                                  |
| -------------------- | -------------------------------------------------------------------------------- |
| `sheet`              | every property, each with its own history INLINE, plus the infobox relation rows |
| `narrative`          | the narrative markdown                                                           |
| `affiliations`       | a character's crews, each with its other members                                 |
| `members` / `former` | a crew's roster / a fruit's users, current and ended                             |
| `contents`           | what a container holds (an arc's chapters, a volume's chapters, a saga's arcs)   |
| `position`           | a source's place inside its arc, as a sibling ribbon                             |
| `cast`               | who/what a source features                                                       |
| `availability`       | where to read / watch                                                            |
| `gallery`            | every OTHER visible depiction (episode stills, covers, plates)                   |
| `appearances`        | the ordered sources this entity appears in, with a ratio                         |
| `connections`        | **every relation group no other module consumed**                                |

`src/lib/entity-layout.ts` maps an entity type id to an ordered list of
**bands**: `full` (a lead module at the reading width), `split` (a wide
main column beside a 19 rem aside, on the `start` or `end` edge) and
`pack` (a balanced masonry). That is what makes each type its own page
— a crew opens on its roster, an arc on its chapter ledger, a chapter
on its position in the arc, a devil fruit on its classification
history, a volume on its contents with the sheet as a left rail.

**Degradation is enforced by the renderer** (ADR-106): `bandsFor(type)`
appends a trailing masonry band with every slot the authored layout did
not mention, and an unauthored type gets `GENERIC_LAYOUT`, which names
all twelve. A layout may reorder and re-weight a page; it can never
hide data. `src/lib/__tests__/entity-layout.test.ts` asserts it.

**Packing is content-derived**: a band that renders a single module
gives it the full width and lets it use its own columns; a row list
derives its column count from its item count (one row spans; two rows
make two columns). No fixed N-column grid ever holds a single item —
that was the "trou à droite" the maintainer rejected in v8.

### Hero (v9): backdrop + figure

Two planes, per the maintainer's brief (« une version large opacité
faible sur full width, et sur le côté au-dessus, un rectangle de la
taille de l'image avec rounded »):

1. **Backdrop** — the entity's artwork (or photo) at the full width of
   the viewport, low opacity, defocused twice and dissolved into the
   canvas by two scrims. Atmosphere.
2. **Figure** — the same subject CRISP, in a rounded frame with a
   hairline ring, on the side. `layout.figure` picks its shape per
   type: a 3:4 `poster` for people, crews, volumes, chapters; a 16:9
   `plate` for episodes, arcs, events and images, whose subject is a
   scene rather than a person.

### Sequential entities: prev/next (ADR-091 degradation)

Types carrying an ordinal get previous/next controls at the left and
right of the hero. The ordinal property is **discovered from the
schema**, never listed per type: the first property an entity type
declares whose id is `number` or ends in `_number` AND whose
`value_type` is numeric (`manga-chapter` → `number`, `arc` →
`arc_number`, `film` → `film_number`, `saga` → `saga_number`,
`live-action-episode` → `season_number` if it declares no `number`…).
Siblings come from a per-type `ordinal → entity` index built once per
process from the immutable artifact. A type that declares no such
property, or an entity carrying no value for it, simply gets no
navigation.

Ordinals are read WITHOUT the cursor (chapter 1044 is 1044 for every
reader), but **a neighbour beyond the reader's progression is not
announced at all** — its title alone would be a spoiler, so the button
disappears rather than rendering a teaser.

### Appearances (UI shipped, data pending ADR-105)

The appearances module counts incoming edges whose SOURCE is an entity
of an **ordered** type (one declaring an ordinal), shows them as
`count` out of the cursor-visible population of that type, and lists
them. The derivation is generic: the day `features` edges exist from
`manga-chapter` / `anime-episode` to characters (ADR-105), the module
lights up with no code change. Until then there are no such edges and
it renders nothing — no placeholder, no fabricated data.

Container contents are excluded by construction: a volume's chapters
are consumed by the `contents` module before appearances are computed,
so they are never miscounted as appearances.

### Episode stills

`gallery` renders every visible depiction beyond the display image, at
16:9. Attaching image entities to an episode is all that is needed; no
importer is shipped (a TMDB import needs an API key and a licensing
decision — out of scope, see IDEAS.md).

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
- **manga-chapter / anime-episode** (source types): header with the
  ordinal · **prev/next buttons** in the hero (schema-discovered
  ordinal, see above) · arc banner (via `part-of-arc` /
  `occurs-during-arc`) linking to the **arc's episode/chapter list** ·
  **cast** ("personnages présents" — `features`, grouped by entity type
  with thumbnails) · availability (`available-on`, region-aware
  `link_template` resolution, ADR-090) · release/publication data.
  Cast, availability, gallery and the ordinal sequence are **page-level
  modules computed for every type**, not source-only: a volume gets its
  availability and an image entity its gallery through the same code.
- **arc / saga / volume / live-action-series** (container types): every
  incoming `part-of-*` edge, bucketed by the type of the thing
  contained and ordered by that type's own ordinal — an arc yields its
  chapters AND its episodes, a saga its arcs, a volume its chapters,
  and a containment relation added later needs no code change. Short
  runs render as titled rows (columned so they fill their band), long
  ones as a numbered ledger.
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
- **Per-entity colour** (ADR-103/104): `lib/entity-tint.ts` re-points
  all nine `--art-*` tokens per tile from the entity's own chord, so
  the values in `styles.css` are only the neutral chrome default. Those
  defaults sit in the same warm band as the chords, and a unit test
  parses `styles.css` to prove it — the art tokens can never drift out
  of the palette.
- **Review**: `bun run -F @onepiece-wiki/web art:preview [out.html]`
  writes a contact sheet of the whole corpus at every frame, plus an
  unknown-type degradation strip and a 40 px thumb wall. Every tile
  carries its own chord (and names it in the caption), so the sheet
  answers the question a narrow palette raises: is the wall still
  varied? Judge value structure and composition there, not hue.

## i18n

UI strings FR/EN mirrored from the reader locale (`web_locale` cookie,
SSR-correct). Data translations come from the artifact's
`translations` table; missing locale falls back to EN then to the key.
URLs stay locale-free (slugs are English, CLAUDE.md).

## Out of scope for v1 (parked, see ROADMAP Phase 6.x)

Search, SEO/SSG pass, OG images, comparison view, relation graphs,
per-arc easter eggs, PWA/offline.
