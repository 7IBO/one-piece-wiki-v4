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
  - Chrome: ONE slim sticky top bar — wordmark, the **search field**
    (ADR-108), the compact progression control, the locale switcher.
    Nothing else. Below `sm` the field wraps onto its own full-width
    line inside the same bar rather than opening a second register. The
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
   (data withheld) rather than a 404 — the reader chose the URL; we
   warn, we don't gaslight. What it can print of the NAME is whatever
   rule 7 allows, which for an entity gated on its own existence is the
   slug, never the authored name.
4. Epistemic reveals: an entry whose `epistemic_status` is a
   believed-state with `actual_value` shows ONLY the believed value
   until the revealing source (the entry carrying the revealed state)
   is within the cursor. Handled naturally by (1) since reveals are
   later entries.
5. Relation edges carry `since` too — same rule as (1).
6. Images: an image whose `spoiler_since` is beyond the cursor is not
   rendered (alt slot hidden entirely).
7. **Names are gated like values.** See § Display names below — the one
   rule that used to have an exception, and no longer does.

The cursor UI: header button "📍 Ch. 1044 · Ép. 1071" (or "Définir ma
progression") opening a small panel with the two numeric inputs +
"tout afficher" reset. Server functions read the cookie so SSR output
is already filtered — no client-side flash of spoilers.

## Display names — one resolution, one gate

A name is a historisable value like any other: a character can be
renamed at chapter 96, and the Gomu Gomu no Mi becomes the "Hito Hito
no Mi, Model: Nika" at 1044. **Showing a reader a name they have not
reached is a spoiler**, exactly like showing them a bounty they have
not reached.

`resolveEntityName` (`server/views.ts`) therefore does NOT read
`canonical_name_key`. It runs `DISPLAY_NAME_SQL`
(`server/search-sql.ts`) — the _same statement, with the same
`search_gates` predicate_, that labels a search result — so a page
title, the hero, the `<title>` tag, a chip, a link label, a listing
card and a search hit cannot disagree about which name the reader has
reached. Ordering mirrors what the builder recorded in `name_rank`:
`canonical_name_key` first, then the entity type's
`display_name_properties` in order, latest entry winning, reader locale
as the last tiebreak.

Because the gate sits in the WHERE clause, a canonical name the reader
has not reached does not exist for that query, and resolution falls
through to the name that WAS in force at the cursor.

Two fallbacks, in order:

1. the entity carries no indexed candidate name at all — its
   `canonical_name_key` is not held by any localizable property, which
   is what an `image` entity does. Such a key carries no `since`, hence
   no progression anchor, so it is resolved straight from
   `translations` exactly as before;
2. the entity HAS names and the reader has reached none of them:
   **degrade to the slug**. Reaching for the raw key here is the leak.

_History_: until 2026-08-27 this function resolved
`canonical_name_key` without the cursor, so an entity page could title
itself with a name from beyond the reader's progression while search
correctly refused to surface it. The corpus never exhibited it (every
multi-named entity happens to declare its EARLIEST name as canonical),
which is why `apps/web/server/__tests__/display-name.test.ts` grafts
two synthetic entities onto a throwaway copy of the artifact and
mirrors the two search cases: a later NAME, and a later EXISTENCE.

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

### Sub-pages, not tabs (ADR-110, 2026-08-27)

An entity that outgrows one screen splits into **sub-pages at real
URLs** — `/crew/straw-hat-pirates/appearances`,
`/character/monkey-d-luffy/relations` — not client-side tabs. The
decisive criterion is VISION.md § 3: « Visiteur Google » is a named
audience, and a tab is not a destination (it cannot be indexed,
linked, shared, or opened in a new tab). ADR-110 has the full
reasoning and the options weighed.

`src/lib/entity-sections.ts` is the registry, and it does **not** fork
the layout registry above: a section is a SUBSET OF SLOT NAMES. The
type's authored bands are computed exactly as before (`bandsFor`) and
then sliced down to the slots the current page owns (`restrictBands`),
so a crew's roster still leads at full width and an aside is still an
aside. `src/routes/$type_.$slug_.$section.tsx` is thirty lines: it
resolves the section and renders the SAME article component.

Authored sections (well-known type ids, ADR-091):

| type                   | sub-pages                                    |
| ---------------------- | -------------------------------------------- |
| `crew`, `organization` | `former-members` · `gallery` · `appearances` |
| `character`            | `relations` · `gallery` · `appearances`      |

What earns a sub-page: a module that grows without bound with the
corpus (a roster's alumni, an appearance ledger over a thousand
chapters, a gallery of stills), or one that answers a different
question from the one the page opened on. What stays on the overview:
the identity of the thing — its data sheet, its prose, and the one
module the type is really about (a crew IS its roster).

Three invariants, each with a test
(`src/lib/__tests__/entity-sections.test.ts`):

- **Nothing is dropped.** `overviewSlots` is a SET DIFFERENCE, not a
  list: every slot belongs to exactly one page, and a slot added to
  `ALL_SLOTS` tomorrow lands on the overview by default rather than
  falling off the site.
- **No empty sub-page is ever offered.** `slotHasContent` is the single
  judgement of "does this module have anything", used both to skip a
  module and to decide whether to LINK a section — so a tab can never
  promise a blank page. An entity with nothing to split shows no
  navigation at all (a lone tab is not navigation), which is why the
  Straw Hat Pirates render as one page today: their roster is the only
  populated module in the corpus.
- **Unauthored types are untouched.** No sections, one page, every
  module on it — the ADR-106 behaviour, unchanged.

A declared section whose modules are empty for one entity still
RESOLVES (it is part of the page, not a claim about what exists) and
says so; a section id the type does not declare is a genuine 404. Each
sub-page carries its own `<title>` — `Name — Section — One Piece
Wiki` — because a duplicate title in an index is exactly the problem
sub-pages were chosen to avoid.

### Hover preview on desktop (2026-08-27)

« Hover card sur desktop sur genre des liens ou on a pas d'image »
(VISION.md § 5.1). Dwell on a link that carries no picture — an inline
chip, a chapter number in a ledger, a title in a contents list — and a
small plate opens beside it: the entity's artwork or photo, its name,
its identity line, two or three facts, its first appearance.
`src/components/HoverPreview.tsx` wraps the link; `buildEntityPreview`
(`server/views.ts`) builds the model.

- **A preview is a SURFACING**, exactly like a search hit: built
  server-side at the reader's cursor, and an entity beyond the cursor
  returns null — the card never opens, and no placeholder admits that
  something exists later (ADR-108's third hazard).
- **Desktop only.** Everything is behind
  `(hover: hover) and (pointer: fine)`, evaluated after mount, so SSR
  emits no card and a phone never renders one. Nothing informative is
  hidden behind hover: every fact on the card is also on the page it
  links to.
- **Keyboard**: focusing the link opens the same card, Escape and
  scrolling close it. The card is `aria-hidden` and
  `pointer-events: none` — a sighted-user affordance holding nothing to
  interact with and nothing a reader could not get by following the
  link, so announcing it would only make the link read twice.
- **`prefers-reduced-motion`** cancels the entrance animation outright
  (`.hover-card`, `styles.css`).
- **Register**: squared off (3 px), hairlined, opaque, artwork-led and
  in the entity's own chord (ADR-103) — a plate lifted off the page,
  not the floating rounded SaaS popover VISION.md § 4 rejects.

**Loading strategy** — three compounding guards, so this is never an
N+1 storm:

1. **Hover intent.** Nothing is requested until the pointer has rested
   on the link for 170 ms. Sweeping a cursor across a roster of forty
   links fires zero requests.
2. **A module-level memo keyed `locale/type/slug/scope`.** A preview is
   fetched at most ONCE per entity per page session, whatever the
   number of links pointing at it. The artifact is immutable at runtime
   (CLAUDE.md), so a cached preview cannot go stale; changing the
   cursor reloads the page, which is also what discards the memo.
3. **One in-flight promise per key**, so two links hovered in quick
   succession share a single request instead of racing.

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

## Search (ADR-108)

Full-text, typo-tolerant, multilingual, and spoiler-gated — the
maintainer's requirement verbatim: « Recherche complète, par texte
poussé, gestion des fautes ou multilangues. »

**Where the work happens.** The index is built into the SQLite
artifact by `packages/db-builder` at `bun run build:db` time
(BUILD_PIPELINE.md § 9) and is never touched at runtime. `apps/web`
only queries it:

| file                           | role                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/search-sql.ts`         | the SQL of both passes + the spoiler gate + the FTS5 MATCH expression + `DISPLAY_NAME_SQL`, which the WHOLE app uses to resolve names (§ Display names). Pure strings and parameter arrays, so the gate is unit-testable without an artifact. |
| `server/db.ts`                 | the prepared statements (lexical, fuzzy, display name, has-display-name), created once per process.                                                                                                                                           |
| `server/search.ts`             | the policy layer: how the passes combine, how a hit becomes a rank, how a result becomes a card.                                                                                                                                              |
| `src/routes/search.tsx`        | `/search?q=…` — SSR, cursor-filtered first paint.                                                                                                                                                                                             |
| `src/components/SearchBox.tsx` | the header field.                                                                                                                                                                                                                             |

**Two passes.**

1. **Lexical** — FTS5 prefix matching over `search_fts`, ranked by
   `bm25`. Answers almost every query: exact words, prefixes ("lu" →
   Luffy), multi-word (all terms must occur in the same string) and —
   through the `unicode61 remove_diacritics 2` tokenizer — accents
   ("equipage" → « Équipage du Chapeau de Paille »).
2. **Fuzzy** — Sørensen–Dice trigram overlap against each document's
   best-matching WORD, run once per query term and **intersected**
   across terms. A strict fallback: it fires only when the lexical pass
   found nothing, so a working query never pays for it and never gets
   near-miss noise mixed in. Terms shorter than four letters are not
   fuzzy-matched (below that every short word is a near-neighbour of
   every other: "hat" is a 0.57 Dice match for "chat"). This is the
   typo tolerance — "zorro" → Roronoa Zoro, "nammi" → Nami,
   "marinford" → Marineford. The page says so ("No exact match —
   showing the closest entries") rather than pretending.

**Multilingual.** The index carries one row per UI locale that has a
value. A query matches rows in ANY indexed locale, so a French reader
finds an entity by its English name and vice versa; the reader's own
locale only gets a small ranking bonus, and the result is always
**labelled in the reader's locale**. `ja` / `ja-latn` are data locales
(ADR-095) and are deliberately not indexed — a search hit is a
surfacing, and those never surface in the public UI.

**Ranking** is `match quality × string weight × entity-type weight`,
all readable constants in `server/search.ts`:

- _quality_: exact string 1.0 · whole-string prefix 0.85 · lexical
  0.60–0.80 by bm25 rank · fuzzy 0.15–0.50 by Dice. A fuzzy hit can
  never outrank a real one.
- _string weight_: `name` 1.0 · `slug` 0.7 · `text` 0.5. Which class a
  string belongs to is decided by the BUILDER from the schema
  (`romanizable` marks a name-like property type), never from a list of
  property ids.
- _entity-type weight_: a presentation binding (ADR-091) so the
  character "Nami" beats the chapter titled "Nami". Every id absent
  from the table degrades to a high default (0.85): an unlisted type is
  unranked, not demoted.

Only the best-scoring string per entity survives — a page is one
result, whichever of its names matched.

### Spoiler gating — the subtle part

Every indexed string carries the progression anchors that gate it
(`search_gates`): the entity's own existence anchors (its id when it is
a numbered source, plus its `first_appearance_source`) AND the entry's
own `since`. The reader's cursor is applied as a `NOT EXISTS` predicate
**in the WHERE clause of every pass**, so SQLite excludes gated rows
before the `LIMIT`. Post-filtering a limited result set would silently
drop results.

Two distinct cases, both covered:

- **The entity's existence is the spoiler.** `event:nika-reveal` is
  anchored at chapter 1044. At cursor 100 no query reaches it — not its
  name, not its French name, not its slug, not the bare word "nika".
  It returns **nothing**, never a redacted "hidden result" row: such a
  row would itself announce that something exists later. It is not
  counted either.
- **The entity exists, a LATER NAME is the spoiler.** Luffy exists from
  chapter 1; "Straw Hat" is his epithet only from chapter 96. At cursor
  50, searching "Straw Hat" does not return him — but "Luffy" does, and
  the crew _named_ "Straw Hat Pirates" since chapter 1 still shows up.
  The rule gates strings, not words. Likewise the Gomu Gomu no Mi is
  findable under its old name at cursor 100 and not under "Hito Hito no
  Mi, Model: Nika".

The **label** of a result goes through the same gate — and, since
2026-08-27, through the same STATEMENT as every other name on the site
(`DISPLAY_NAME_SQL`, § Display names above). `resolveEntityName` runs
it too, so a renamed entity is listed under the name it had at the
reader's cursor AND its page titles itself with exactly that name;
search no longer needs a label of its own. Everything else on the card
(identity line, status tag, image) comes from the same
`buildEntityCardView` a listing uses, already spoiler-checked.

Covered by `apps/web/server/__tests__/search.test.ts` (both spoiler
cases against the real artifact), `.../search-sql.test.ts` (the gate is
in the WHERE, before the LIMIT), `packages/db-builder/__tests__/search.test.ts`
(what the schema makes searchable, and the gate rows) and
`packages/schemas/__tests__/search-text.test.ts` (folding + typo
similarity).

### The page

`/search?q=…`, server-rendered against the cursor. Results reuse the
collection wall (`CardGrid` + `EntityCard`) rather than a bespoke
result-row language: a search result IS an entity and should look
exactly like the same entity on its type listing — artwork-led tile,
name over the composition, its own colour chord, the type as the corner
tag. The only search-specific addition is the card's `meta` line, which
names WHICH string matched when it was not the displayed name
("Epithet · Straw Hat"), so a hit on an alias explains itself.

No autocomplete popover: results are a page. A floating suggestion card
is exactly the "modern web app" register § Identity rejects. The header
field is a plain `<form role="search">` — Tab reaches it, Enter
submits, the field mirrors `?q=` so Back refills it.

## Contribute strip (bottom of every entity page)

A quiet full-width strip: "Ces données sont libres —" with buttons
**Voir / modifier les données** → `<DASHBOARD_URL>/types/<type>/<slug>`
and **Historique** → `<DASHBOARD_URL>/types/<type>/<slug>/history`.
`DASHBOARD_URL` comes from `VITE_DASHBOARD_URL` (build-time env),
defaulting to the production dashboard.

## URLs (2026-08-09)

Canonical page URLs are **`/{type}/{slug}`** with the ENTITY TYPE ID
as segment — `/character/monkey-d-luffy`, `/crew/straw-hat-pirates`,
`/manga-chapter/chapter-1044` — type listings at `/{type}`, and entity
sub-pages at **`/{type}/{slug}/{section}`** (ADR-110), whose segment is
a kebab-case English id from `src/lib/entity-sections.ts`.
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
- Aspect ratios are reserved up front so layout never jumps between art
  and photo, `loading="lazy"`, and a subtle (~200 ms) fade-in when a
  real image lands. WHICH ratio is the subject of the next section.

## Image ratios — fixed per kind of image (2026-08-27)

The maintainer's requirement: « Les images affichées doivent respecter
un ratio précis analysé pour chaque type d'image ». The decisive word
is _type of image_: **a ratio is a property of what the picture IS, not
of the slot it lands in.** A 16:9 episode still cropped into a 3:4
poster frame is not a portrait, it is a mutilated still.

`src/lib/image-ratio.ts` owns the whole rule; `EntityImage` applies it,
which means `EntityCard`, `EntityHero`, the gallery and every
connection thumb apply it too, since they all render through that one
component. `EntityArt` follows: when a frame takes an image's own
ratio, the artwork ground underneath is composed for the nearest
generator frame (`artFrameFor`).

### The five ratio classes

| class      | ratio | what it holds                                             |
| ---------- | ----- | --------------------------------------------------------- |
| `portrait` | 3:4   | people, crews, posters — the databank portrait            |
| `cover`    | 2:3   | volume / book / databook covers (the tankōbon proportion) |
| `square`   | 1:1   | emblems, jolly rogers, icons, connection thumbs           |
| `plate`    | 16:9  | episode stills, scenes, location views — the screen       |
| `banner`   | 21:9  | colour spreads and headers — wider than a screen          |

### How an image gets one — schema first, never a hardcoded map alone

1. **Its own pixels.** The `image` entity type already declares
   `image_width` / `image_height` (`data/schemas/entity-types/image.json`).
   When both are present that IS the ratio, exactly, with nothing to
   maintain. This is why no new data mechanism was invented.
2. **Its depiction role.** Failing intrinsic dimensions, the `role`
   qualifier of the `depicted-by` edge says what the picture is, and
   its values come from the schema vocabulary `depiction-roles` — so
   the table below is keyed on authored values, not invented ones:

   | role                                                    | class      |
   | ------------------------------------------------------- | ---------- |
   | `primary_portrait`, `secondary_portrait`, `silhouette`  | `portrait` |
   | `cover`                                                 | `cover`    |
   | `scene`, `emotional_moment`, `location_view`            | `plate`    |
   | `color_spread`                                          | `banner`   |
   | `group_photo`, `ability_illustration`, `equipment_view` | `square`   |

3. **Nothing.** An unclassified role — or a role the corpus invents
   tomorrow — yields no ratio, and the caller keeps its own frame.
   That is the ADR-091 degradation: an unknown image type still renders
   sanely, it simply is not special-cased.

### Frame vs picture

Two decisions, deliberately separate:

- **The frame.** `ratio` names the SLOT's shape and is what a grid
  needs — a wall of cards stays a wall of cards whatever pictures land
  in it. `fit="native"` hands the frame over to the image's own ratio
  instead, and is used where the picture IS the subject: the hero
  figure and the gallery plates.
- **The picture inside.** It fills the frame (`object-fit: cover`)
  only while its own ratio is within `CROP_TOLERANCE` (1.15) of the
  frame's — a 3:4 portrait in a 1:1 thumb is a legitimate crop of a
  portrait. Beyond that it is `contain`ed over the artwork ground
  instead, letterboxed rather than butchered. An image whose ratio
  nothing declares keeps the historical `cover`.

`src/lib/__tests__/image-ratio.test.ts` pins the derivation order, the
crop rule and the degradation.

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

SEO/SSG pass, OG images, comparison view, relation graphs, per-arc
easter eggs, PWA/offline. (**Search shipped** — ADR-108, § Search
above. The ⌘K palette and result facets stay parked.)
