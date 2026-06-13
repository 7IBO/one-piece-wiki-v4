# Data Expansion Plan (Fandom-informed)

Planning artifact for a large, research-driven expansion of the data model.
It is the bridge between **what a complete One Piece wiki must store** (learnt
by analysing onepiece.fandom.com) and **our schema-driven model**. It is a
_plan_, not yet a spec: each cluster below becomes its own ADR + PR (the model
rule stands — concepts land in `DATA_MODEL.md` and an ADR _before_ code).

- **Method**: four parallel research passes over rich Fandom pages — people &
  organizations (Luffy, Zoro, Robin, Straw Hats, Marines, Baroque Works);
  powers & equipment (Devil Fruit, Gomu/Nika, Haki, Rokushiki, Wado Ichimonji,
  Meito, Gear 5); sources, canon & narrative structure (Chapter 1, Episode 1,
  Film Red, SBS, Vivre Card, Marineford Arc, Summit War Saga); world, races,
  ships, concepts, events & timeline (Wano, Water 7, Fish-Man, Mink, Thousand
  Sunny, Will of D., Poneglyph, Battle of Marineford, Timeline). Data was read
  from the MediaWiki `action=parse` API (Fandom blocks plain fetches).
- **How to read**: each change carries a tag.
  - `[A]` additive — no migration, safe.
  - `[B]` breaking — needs a migration script + `schema_version` bump.
  - `[D]` decision — needs a maintainer product/architecture call (listed in
    § "Open decisions").
  - `[V]` verify — value set / number must be checked against canon before the
    enum is frozen (research came from an LLM reading Fandom; treat exact
    counts/years as provisional).
- **Status**: proposed. Nothing here is implemented yet. Supersedes nothing
  until each ADR lands.

---

## 1. Cross-cutting findings (shape the whole plan)

These recur across every entity type and should be decided first, because the
per-cluster changes depend on them.

### 1.1 Naming is multi-axis and edition-scoped `[D]`

Every notable entity on Fandom carries **4+ name fields**, and the "English"
name is _not_ single — it varies by edition/dub:

| Axis                       | Example (Luffy / Gomu Gomu / Wado)                                                | Today                        |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| Native script (kanji/kana) | `モンキー・D・ルフィ` / `ゴムゴムの実` / `和道一文字`                             | not modelled                 |
| Romanized (Hepburn)        | `Monkī Dī Rufi` / `Gomu Gomu no Mi` / `Wadō Ichimonji`                            | not modelled                 |
| Literal meaning            | "Way of Harmony"; Nika = grin onomatopoeia                                        | not modelled                 |
| Official EN (per edition)  | Viz `Gum-Gum Fruit` vs 4Kids; `Zoro` (Viz) vs `Zolo` (4Kids); `Marines` vs `Navy` | single `i18n_key` per locale |

We already have `name_type` (common/full_name/true_name/epithet/nickname/alias/
codename/title/insult/honorific/mistranslation) and a `translation-variants`
vocabulary (`viz`, `glenat`, `kana`, dubs, `fan_translation`). The gap is that
a name _value_ cannot say _which edition_ it belongs to. **Proposed**: add a
`name_type` family for script axes (`native_script`, `romanized`,
`literal_meaning`) and let localizable values carry an optional `variant`
qualifier (→ `translation-variants`) so "Zoro/Zolo/Navy/Marines" coexist and the
read path picks the reader's edition. This is the single highest-leverage change
— it touches every entity. See cluster **C1**.

### 1.2 In-universe time is a first-class, layered axis `[D]`

Fandom dates events three ways simultaneously: a **relative offset** (`38 years
before present` — note "present" drifts as the manga advances), **absolute
calendars** (Age of the Sea Circle ≈ 1541; Age of Heaven ≈ 4131), and **named
eras** (Void Century, God Valley Incident, Age of Dawn, Great Pirate Era, the
"New Era" beginning at Marineford). We only have a flat `during-periods`
enum for pre-canon anchoring. **Proposed**: promote eras to first-class
entities and add a structured in-universe temporal value
`{ era?, years_before_present?+anchor, calendar?{system,year,month?,day?},
precision: exact|approx|unknown }`, itself spoiler-versioned (a date is often a
late reveal — God Valley moved from legend to dated event around ch.1096). See
cluster **C9**.

### 1.3 "Succession over time" is a recurring relation pattern `[A]`

Devil-fruit users (a fruit reincarnates on death: Joy Boy → Luffy), weapon
owners (Wado: Kuina → Kōshirō custody → Zoro), titles (Mera Mera: Ace → Sabo),
crew flagships (Going Merry → Thousand Sunny), org leadership (Kong → Sengoku →
Sakazuki). All share one shape: a **historised relation** carrying `since`/`until`
plus a `reason`/`succession_kind` qualifier. ADR-037's relation epistemic axis
already supports the hidden cases (a secret heir). This needs no new mechanism —
just `historical: true` relations, a small qualifier vocabulary, and a build/SDK
"current vs former" convention. Directly answers the user's G4 (`until` on
ate-fruit) and overlaps G1/G3.

### 1.4 Canonicity ≠ spoiler `[A]`

Abilities, fruits, techniques, episodes and SBS facts each carry a _canon
tier_ that is orthogonal to spoiler progression: canon / anime-only / movie-only
/ game-only / SBS-semi-canon. We have `canon-scopes` on sources; the gap is that
**derived entities** (a non-canon technique, an SBS-only birthday) need the same
axis. SBS introduces a genuine new tier: **`semi_canon`** (fan-suggested facts
Oda later ratified — birthdays, blood types). See clusters **C5**, **C8**.

### 1.5 Real-world production people are reusable entities `[D]`

Seiyū, dub VAs (4Kids/Viz/Funimation/Odex), live-action actors, episode/animation
/art directors, screenplay writers, theme-song artists — each is reused across
hundreds of sources/characters. Today there is no place for them. **Proposed**:
a `person` entity type (real-world) with role-scoped relations (`voiced-by`,
`portrayed-by`, `directed`, `wrote`, `performed-theme`). See cluster **C7**.

---

## 2. Per-cluster change list

Each cluster = one ADR + PR. Ordered later (§3). Tables list _additions only_;
existing fields are omitted.

### C1 — Naming, scripts & translation editions `[D]` (foundational)

| Change                                                          | Detail                                                                                                           | Tag      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| `name-types` += `native_script`, `romanized`, `literal_meaning` | hold kanji, Hepburn, gloss as typed name entries                                                                 | `[A]`    |
| `variant` qualifier on localizable values                       | enum → `translation-variants`; lets Viz/4Kids/Glénat/Kana/fan names coexist; read path filters by reader edition | `[D]`    |
| `translation-variants` += dub editions                          | `funimation`, `4kids`, `odex`, `toei_jp`, `live_action` (verify against current set)                             | `[A][V]` |
| i18n strategy: per-(locale,variant) keys                        | `I18N_STRATEGY.md` update; resolution precedence (reader edition → official → fallback)                          | `[D]`    |

**Expected result**: any entity can store JP/romaji/meaning + multiple official
EN/FR names without collision; spoiler- and edition-correct display.

### C2 — Character depth

| Change                         | Detail                                                                                                                                                                           | Tag      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `occupation` property          | `multi_enum`, historisable, spoiler-sensitive; vocab `occupations` (Pirate, Captain, Swordsman, Archaeologist, Assassin, Bounty Hunter, Revolutionary, Marine, Bandit, Slave, …) | `[A][V]` |
| `blood_type` vocab fix         | One Piece uses **F / S / X / XF / XS**, not A/B/AB/O — verify & correct `blood-types.json`                                                                                       | `[B][V]` |
| `phase` qualifier              | enum `debut`/`child`/`pre_timeskip`/`post_timeskip` for values that jump at the 2-year timeskip but span many chapters (age, height, sometimes bounty)                           | `[D]`    |
| `residence` / `origin`         | `entity_ref(location)` distinct from `birthplace` (origin sea-region vs hometown vs current home, historised)                                                                    | `[A]`    |
| bounty qualifier `reason`      | why the bounty changed (event ref / free note)                                                                                                                                   | `[A]`    |
| `held-rank` relation/qualifier | Marine/Navy rank over time → see C7 `rank` vocab                                                                                                                                 | `[A]`    |

### C3 — Organizations & affiliation history

| Change                                      | Detail                                                                | Tag   |
| ------------------------------------------- | --------------------------------------------------------------------- | ----- |
| `subdivision-of` relation                   | org → org (World Government → Marines/Cipher Pol; Marines → SWORD)    | `[A]` |
| `leads` / `led-by` historised               | leadership lineage with `until` (Fleet Admiral Kong→Sengoku→Sakazuki) | `[A]` |
| `based-at` historised                       | HQ/bases over time                                                    | `[A]` |
| `member_serial_id` qualifier on `member-of` | "Marine code" (e.g. `G-1 00660`)                                      | `[A]` |
| `uses-ship` historised (crew→ship)          | flagship succession (Going Merry → Thousand Sunny) with `until`       | `[A]` |

### C4 — Devil fruits: identity, succession, awakening

| Change                             | Detail                                                                                                                                                               | Tag   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `zoan_model` property              | orthogonal to `classification` ("Model: Nika", "Model: Phoenix", "Model: Daibutsu") — open string or sub-vocab                                                       | `[A]` |
| `eaten-by` → historised succession | a fruit reincarnates: `since`/`until` + `succession_reason` (death) + previous users; current-user is the latest open edge (uses ADR-037 epistemic for hidden cases) | `[A]` |
| `awakening-of` relation            | technique ↔ fruit (Gear 5 ↔ Hito Hito Nika)                                                                                                                          | `[A]` |
| `canonicity` property              | canon/anime_only/movie_only/game_only                                                                                                                                | `[A]` |
| Nika retcon worked example         | `name` (true_name) + `classification` flip together at `revealed_since: chapter:1044`, `known_truth_by: [World Government]` — add to `EPISTEMIC_MODEL.md`            | `[A]` |

### C5 — Abilities: fighting styles, Haki, techniques

| Change                                  | Detail                                                                            | Tag   |
| --------------------------------------- | --------------------------------------------------------------------------------- | ----- |
| `fighting-style` (or `concept` subtype) | Rokushiki, Santōryū, Black Leg, Haki as systems that group techniques             | `[D]` |
| `part-of-system` relation               | technique → system; inverse `comprises`                                           | `[A]` |
| `technique.canonicity`, `is_secret`     | many Rokushiki variants are anime-only; Rokuōgan is secret/7th                    | `[A]` |
| Named Haki techniques as entities       | Future Sight (Observation), Emission/Kōka + Ryūō (Armament), Advanced Conqueror's | `[A]` |
| `technique-types` review                | confirm `transformation`/`awakening` cover Gear forms (ADR-034)                   | `[V]` |

### C6 — Weapons & the Meito system

| Change                                                         | Detail                                                                                                                                          | Tag      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `weapon-grades` correction                                     | the four Meitō tiers: `saijo_o_wazamono` (Supreme, 12), `o_wazamono` (Great, 21), `ryo_wazamono` (Skillful, 50), `wazamono` (base) + `unranked` | `[B][V]` |
| orthogonal flags                                               | `is_cursed` (Kitetsu line) and `is_black_blade`/`blade_color` are **not** grades — split them out (a sword can be Supreme _and_ cursed)         | `[B]`    |
| `weapon-types` += `naginata`, `shikomizue`, `cutlass`, `saber` | observed on Meito list                                                                                                                          | `[A][V]` |
| `meaning` (i18n)                                               | "Way of Harmony" etc. → name_type `literal_meaning` (C1)                                                                                        | `[A]`    |
| `wielded-by` → historised succession                           | ownership vs custody (Wado: Kuina→Kōshirō custody→Zoro); `succeeds` weapon→weapon (Kitetsu generations)                                         | `[A]`    |

### C7 — Sources, production & real-world people

| Change                             | Detail                                                                                                                                                                      | Tag      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `person` entity type               | real-world: seiyū, dub VAs, directors, writers, theme artists, live-action cast                                                                                             | `[D]`    |
| relations                          | `voiced-by` (qualifiers `language`, `dub_studio`, `context`=young/OVA), `portrayed-by` (`medium`), `directed`/`wrote`/`storyboarded`, `performed-theme`                     | `[A]`    |
| `rank` vocabulary                  | ordered Marine ranks (Fleet Admiral→…→Recruit) with kanji/romaji; reused via `held-rank`                                                                                    | `[A][V]` |
| manga-chapter                      | multi-title (C1), `is_color_spread`, `cover_page` descriptor                                                                                                                | `[A]`    |
| anime-episode                      | per-dub airdates+titles (+4Kids own numbering), staff credits (screenplay/storyboard/episode/animation/art director), opening/ending theme refs, TV `rating`, debut buckets | `[A]`    |
| film                               | `opening_theme`/`ending_theme`/`writer`/`film_number`/`prev`+`next`, regional releases                                                                                      | `[A]`    |
| `theme-song` entity                | opening/ending/insert tracks, `performed-theme` by person/artist                                                                                                            | `[D]`    |
| `adapts`/`adapted-by` many-to-many | non-linear mapping (Ep1↔Ch2, Ch1↔Ep4; one chapter → several episodes) + `anime_original_content` flag + page-level source anchoring                                         | `[B]`    |

### C8 — Volumes, SBS Q&A, databook cards, cover-story arcs

| Change                         | Detail                                                                                                                                                              | Tag   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `volume` entity (tankōbon)     | cover character(s), JP/Viz release dates, chapter set, hosts the SBS column (SBS starts vol 4)                                                                      | `[D]` |
| `sbs-qa` entity                | atomic Q&A: question, answer, asker P.N., volume+page locus, `reveals` → entity/property; canon tier `semi_canon`; many ages/birthdays/blood-types are sourced here | `[D]` |
| `databook-card` entity         | numbered stat card; fixed profile schema; `profiles` → entity; each datum sourced to a card; card variants                                                          | `[D]` |
| `cover-story-arc` entity       | parallel narrative container (Buggy's Adventures, CP9's Independent Report, Caribou); `has-cover-story` (chapter→arc, qualifier `installment_number`)               | `[D]` |
| `arc`/`saga` additions         | global + in-saga ordinals, `episode_range`, divergent manga/anime date spans, `alt_official_names`, **arc→arc nesting** (sub-arcs), `prev_anime` ≠ `prev`           | `[A]` |
| `arc-subtypes` +=              | `cover_story_arc`; keep `filler_arc` vs `story_arc` distinction                                                                                                     | `[A]` |
| `appearance-types` +=          | `wanted_poster`, `eyecatcher`                                                                                                                                       | `[A]` |
| `canon-scopes` += `semi_canon` | SBS-ratified facts (between author-canon and non-canon)                                                                                                             | `[A]` |

### C9 — World, lore, events & the timeline

| Change                                         | Detail                                                                                                                                                                                                                                                  | Tag      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `location.region`                              | enum `east_blue`/`west_blue`/`north_blue`/`south_blue`/`grand_line`/`paradise`/`new_world`/`calm_belt`/`red_line` (+ `all_blue` myth)                                                                                                                   | `[A][V]` |
| `location.status` historised                   | `active`/`destroyed`/`sunken`/`risen`/`undersea`/`frozen`/`abandoned`/`occupied` (Wano undersea→risen)                                                                                                                                                  | `[A]`    |
| location relations                             | `affiliated-with`/`controlled-by` (org, historised), `former-name`/aka, `log_pose_time`                                                                                                                                                                 | `[A]`    |
| `race` additions                               | `features`, `homeland` relation, `slave_price` (recurring quantified field), `aka`, `danger_classification` (Type A/B/C)                                                                                                                                | `[A][V]` |
| `ship` additions                               | figurehead, hull subtype, `built-from-material` (→ `material` entity, e.g. Adam Wood), dimensions, launch date, `status`                                                                                                                                | `[A]`    |
| `concept` additions                            | `meaning`, `created-by`, Poneglyph subtypes (`road`/`regular`/`historical`), `can-read`/`decipherable-by` (epistemic-heavy)                                                                                                                             | `[A]`    |
| `ancient-weapon` + `artifact`/`document` `[D]` | Pluton/Poseidon/Uranus (note Poseidon = Shirahoshi → `is-also`/`embodies`, ties to G2); Poneglyph _instances_ vs the _concept_; wanted posters as documents                                                                                             | `[D]`    |
| `event` enrichment                             | `event_subtype` → **array** (war+execution+skirmish), `duration`, in-universe `date` (C9 timeline), `factions`/`instigated-by`/`commanded-by`(side), `precursor`/`followed-by`, structured `outcome[]` linking to deaths/bounty-changes/era-transitions | `[B]`    |
| `era` entity + `during-periods` migration      | Void Century/God Valley/Age of Dawn/Great Pirate Era/New Era with start/end anchors + nesting; `occurs-during-era`                                                                                                                                      | `[B][D]` |
| structured in-universe temporal value          | `{era?, years_before_present?+anchor, calendar?{system,year,month?,day?}, precision}` (§1.2), spoiler-versioned                                                                                                                                         | `[D]`    |

---

## 3. Sequencing

Dependency-ordered; each is an ADR + PR, gauntlet-green before merge.

1. **Docs reconciliation** (no schema change) — fix the drift the audit found so
   the docs are a trustworthy base: INVENTORY dir-tree + the 16 ADR-033/034
   deleted relation mirrors + vocab count (actual **36**) + relation count
   (**52**); DATA_MODEL canon-scopes 8→10; SCHEMA_SPEC `object` value-type stub;
   restructure for agent navigation. (≈ backlog #8.)
2. **C1 naming/i18n** — foundational; everything else reuses it.
3. **C4 devil-fruit succession + Nika** and **C6 weapon Meito/succession** —
   self-contained, exercise §1.3 + ADR-037, high reader value.
4. **C2 character depth** + **C3 organizations** + **C7 `rank`/`person`** —
   interlinked (occupations, ranks, VAs).
5. **C9 world/region/status** then **C9 events+timeline/era** — the timeline is
   the biggest architectural piece; do world fields first, dating last.
6. **C8 sources/volumes/SBS-QA/databook-cards/cover-stories** — large; can run in
   parallel with 4–5 since mostly new entity types.
7. **C5 fighting-styles/Haki/techniques** — depends on C1 + the `concept`/
   `fighting-style` decision.

After each cluster ADR lands, update the relevant `/docs/*` in the **same PR**
(model rule), and tick the cluster here.

---

## 4. Open decisions (need a maintainer call)

These are genuine product/architecture calls — flagged rather than decided:

1. **Edition-scoped names (C1)**: add a `variant` qualifier on localizable
   values, or keep one EN/FR and treat dub variants as out of scope for now?
2. **`person` entity (C7)**: model real-world people (VAs, staff, actors) now,
   or defer (DATA_MODEL currently lists voice/live-action cast as "possible
   later")? Big surface, high reuse.
3. **Timeline model (C9)**: adopt `era` entities + the structured temporal value
   now, or keep `during-periods` and add only `years_before_present`?
4. **SBS-QA / databook-card / volume / cover-story-arc as entities (C8)** vs
   lighter modelling (properties/relations only)? They are real reveal-sources;
   entities make provenance precise but add types.
5. **`fighting-style` (C5)**: new entity type, or a `concept` subtype?
6. **`ancient-weapon`/`artifact`/`document` (C9)**: own types vs `concept`
   subtypes; interacts with the deferred `document` type (ADR-011) and G2
   (`is-also`/`embodies`, Poseidon = Shirahoshi).
7. **`event_subtype` → array** and **structured `outcome[]`** (C9): worth the
   breaking change now, or additive-only first?

## 5. Docs refactor plan (task: agent-readability + completeness)

Goal: docs an agent can navigate fast and trust. Per-doc actions:

- **INVENTORY.md** — single source for "what exists"; fix dir-tree, the deleted
  mirrors, counts (52 relations, 36 vocabs); add a stable "last-verified against
  catalogue" line; consider generating parts from the catalogue to stop drift.
- **DATA_MODEL.md** — canon-scopes 8→10; ensure each cross-cutting concept
  (historisation, epistemic incl. relations/ADR-037, canon, provenance, i18n,
  timeline) has one canonical section; add the Nika worked example pointer.
- **SCHEMA_SPEC.md** — add the `object` value-type section (ADR-026 prereq);
  document relation base qualifiers cross-link (done in ADR-037); document the
  `variant` qualifier once C1 lands.
- **CONVENTIONS.md** — naming axes + edition variants; succession-relation
  convention (current = latest open edge).
- **EPISTEMIC_MODEL.md** — Nika retcon + Baroque Works codenames + secret-
  alliance (ADR-037) as worked examples.
- **CANON_MODEL.md** — `semi_canon` tier; canonicity-vs-spoiler distinction.
- **ROADMAP.md / STATE.md** — reference this plan; track cluster progress.
- Add a short **top-of-tree `docs/README.md`** map ("which doc answers which
  question") for agent navigation.

---

## 6. Caveats

Research was read by LLM agents from Fandom; **exact value sets, counts and
in-universe years are provisional** (`[V]`) and must be verified against canon
(and the Glénat FR terminology) before any enum is frozen. Fandom's own
structure is a _reference for completeness_, not a target to copy — we keep our
spoiler-versioned, epistemic, schema-driven model; Fandom tells us which
variables that model must be able to hold.
