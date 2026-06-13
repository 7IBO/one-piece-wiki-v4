# Architectural Decisions

This is the project's Architecture Decision Record (ADR) log. Every
non-trivial architectural decision is recorded here with date, context,
options considered, choice, and rationale.

Format: append new entries at the top.

---

## ADR-046 — `material` entity + `made-of`; Seastone's Devil-Fruit nullification

**Date**: 2026-06-14

**Context**: The "fruit mechanics + materials" cluster. One Piece has a small
set of **named, reusable substances** that matter mechanically — Seastone
(kairōseki), Treasure Tree Adam / Adam Wood, Wapometal, Dyna Stones — that ships
and weapons are built from. The model had no way to name them or to link an
object to what it's made of. The headline mechanic is **Seastone**, whose
defining trait is that it nullifies Devil-Fruit powers.

**Key modelling question — where do Devil-Fruit weaknesses live?** The sea/water
and Seastone weaknesses are **universal to the Devil-Fruit phenomenon**, not
facts about any individual fruit. Encoding them per-`devil-fruit` entity would
duplicate the same datum across every fruit. So they are _not_ per-fruit data.

**Decision** (additive):

1. **`material`** entity type — name, `material_subtype` (enum → new
   **`material-subtypes`** vocab: mineral/metal/alloy/wood/organic/synthetic),
   `nullifies_devil_fruits` (boolean), `description_key`. `url_segment`
   `materials`, ui group `objects`.
2. **`nullifies_devil_fruits`** boolean property (on `material`) — the
   structural home of the Seastone weakness: `material:seastone` sets it `true`.
   The weakness is encoded **once**, on the substance, rather than on every
   fruit.
3. **`made-of`** relation (`ship` / `weapon` → `material`, not historised) —
   qualifiers `since` (source) and `component` (which part, e.g. hull / blade /
   jutte tip). Declared on `ship.allowed_relations` + `weapon.allowed_relations`.
4. `depicted-by` `valid_from_types` += `material` (a substance can carry an
   image).

**Rationale**: A `material` entity makes Seastone & co. first-class, queryable,
and citable, and `made-of` turns "the Thousand Sunny is Adam Wood" / "Smoker's
jutte tip is Seastone" into real edges. Putting `nullifies_devil_fruits` on the
material (not on fruits) models the weakness where it actually lives — a
property of the substance — and answers "which materials neutralise Devil
Fruits?" structurally. The general sea/water weakness and the descriptive
_effects_ of awakening stay in narrative (awakening's structural footprint —
`awakened` + `awakening-of` — already landed in ADR-039/C4); elemental
type-advantages (magma > fire) are deferred (low volume, debatable canon).

**Consequences**: +1 entity type (22), +2 properties (78), +1 relation (58),
+1 vocabulary (48); `ship` / `weapon` `allowed_relations` and `depicted-by`
source widened. No `/data` migration (additive; no `material` entities exist
yet). Snapshot regenerated (all diffs additive per `check:compat`).

---

## ADR-045 — Location geography (`region`) & historised lifecycle `status`

**Date**: 2026-06-14

**Context**: Cluster C9a (the first, cleanly-additive slice of the C9 world
cluster). Locations carry two facts the model lacked: **which sea/region** they
sit in (the four Blues, the Grand Line and its two halves, the Calm Belt, the
Red Line) and a **lifecycle status that changes over the story** (Wano goes
undersea → risen; islands are destroyed, frozen, abandoned, occupied). The
plan (§C9) also listed an `affiliated-with` / `controlled-by` relation — but
`controlled-by` **already exists** as the build-generated inverse of
**`controls-territory`** (organization → location, historised). The only gap is
that a pirate **crew** can't currently be the controller (its `valid_from` is
`organization` only), so territories held by a crew (Beasts Pirates → Wano)
can't be modelled. A brand-new `controlled-by` relation would duplicate this.

**Options** (for the governance gap):

- A — Add a new `controlled-by` relation (plan's literal wording).
- B — Widen the existing `controls-territory` to also accept `crew` as the
  controller.

**Choice**: B for governance; plus the two properties.

**Decision** (additive):

1. **`region`** property (`enum` → new **`location-regions`** vocab: east_blue,
   west_blue, north_blue, south_blue, grand_line, paradise, new_world,
   calm_belt, red_line). Not historised (a place doesn't change seas), not
   required. **`all_blue` is deliberately excluded** — it's a legend, not a
   navigable region; if ever modelled it belongs as a `concept`, not a location
   region.
2. **`location_status`** property (`enum` → new **`location-statuses`** vocab:
   active, destroyed, sunken, risen, undersea, frozen, abandoned, occupied;
   historised, spoiler-sensitive, default qualifier `since`). A separate
   property from the character-only `status` (different value set — a place
   isn't "alive").
3. **`controls-territory`** `valid_from_types` widened to include `crew` (a
   territory held by a pirate crew, e.g. Wano under the Beasts Pirates), and
   `controls-territory` added to `crew.allowed_relations` so the capacity is
   usable — instead of a new, overlapping `controlled-by` relation.
   `ruled-by` (formal rulership: a king/government rules a kingdom) is left as
   is — distinct from territorial control.

**Rationale**: Region and status are intrinsic location data, modelled as
properties (status historised because it's the textbook spoiler-versioned fact).
Widening `controls-territory` over adding a new relation avoids the near-
duplicate the de-dup review explicitly guards against — the model already had
`controls-territory`/`controlled-by` for org control, so only the crew domain
was missing. Keeping `ruled-by` (rulership) and `controls-territory` (control /
occupation) as distinct edges is intentional: a region can be formally ruled by
one party while controlled by another. Looser `affiliated-with` and the
`former-name` / `log_pose_time` ideas are dropped/deferred (naming → C1;
log-pose time is minor).

**Consequences**: +2 properties (76), +2 vocabularies (47); `location` schema
bumped to v3; `controls-territory` source widened + declared on `crew`. No
`/data` migration (additive; no location data sets these yet). Snapshot
regenerated (all diffs additive per `check:compat`). Cluster C9a; the C9
timeline/era and event-enrichment slices (which carry the `[D]`
in-universe-time decision) remain.

---

## ADR-044 — `person` entity (real-world cast & staff) + Marine rank vocabulary

**Date**: 2026-06-13

**Context**: Cluster C7. Two gaps surfaced by the Fandom survey (§2A / the
cast-and-staff line in DATA_EXPANSION_PLAN). First, the model had **no way to
represent real-world people** — seiyū, dub VAs (Toei/Funimation/4Kids/Odex),
live-action actors, directors, writers, composers, theme performers, the
mangaka — even though almost every character page carries this. DATA_MODEL
explicitly listed it as _not captured_ (scoped to hypothetical `voice-cast` /
`live-action-cast` types). Second, Marine and Navy characters hold a **formal
rank** (Fleet Admiral → Seaman) that is a tenured, spoiler-sensitive fact
attached to their service, not a free-text occupation.

**Options**:

- A — One `person` entity type with a `person_roles` multi-enum; cast links are
  `character → person` relations (`voiced-by`, `portrayed-by`).
- B — Separate `voice-cast` / `live-action-cast` / `staff` types (the old
  DATA_MODEL sketch).
- C — Keep cast as free-text strings on the character (status quo).

**Choice**: A.

**Decision** (additive):

1. **`person`** entity type — real-world people. Properties: `name`,
   `person_roles`. `allowed_relations`: `depicted-by` (a headshot → `image`).
   `url_segment` `people`, ui group `production`.
2. **`person_roles`** property (`multi_enum` → new **`person-roles`** vocab:
   voice_actor, dub_actor, live_action_actor, series_director, episode_director,
   film_director, animation_director, screenwriter, character_designer, composer,
   theme_performer, mangaka). A person can hold several roles.
3. **`voiced-by`** relation (`character → person`, historised) — qualifiers
   `since`, `language`, `dub_studio` (enum → new **`dub-studios`** vocab:
   toei/funimation/4kids/odex), `context`.
4. **`portrayed-by`** relation (`character → person`, historised) — live-action;
   qualifiers `since`, `production`, `context`.
5. **`held_rank`** qualifier (enum → new **`marine-ranks`** vocab: 15 values,
   fleet_admiral → seaman) on **`member-of`** — a Marine's rank within the
   organization they serve, historised via the relation's own `since`/`until`.
6. `depicted-by` `valid_from_types` widened to include `person` (so a person can
   carry a portrait); `character` `allowed_relations` gains `voiced-by` /
   `portrayed-by`.

**Rationale**: One uniform `person` type (Option A) keeps the SDK/form surface
flat — the same `getEntity` path, the same generated form — where Option B
multiplies near-identical types. Roles are data (`person_roles`), not structure.
Cast becomes first-class relations, so "who voiced Luffy in the Funimation dub
since 2007" is a queryable edge with qualifiers rather than a string. Marine rank
rides `member-of` because rank only exists _relative to_ the org served and is
already historised there — no parallel timeline to keep in sync.

**Consequences**: +1 entity type (21), +1 property, +3 vocabularies, +2
relations; `character` and `member-of` extended, `depicted-by` source widened.
No `/data` migration (additive; no `person` entities or cast/rank data exist
yet). Snapshot regenerated (all diffs additive per `check:compat`). DATA_MODEL's
"does not capture" note updated to reflect cast/staff is now captured. Cluster C7.

---

## ADR-043 — Organizations: sub-units, power systems, member nations

**Date**: 2026-06-13

**Context**: Cluster C3. The Fandom prose survey (§2A) surfaced group/government
structure the model lacked: crews and orgs **nest** (Whitebeard's ~43
subordinate crews, the World Government → Marines / Cipher Pol subdivisions);
**power systems** (Shichibukai / Yonko / Admirals) are appointed, revoked, and
sometimes **abolished wholesale** (the Warlords were abolished at ch.956); the
World Government has ~170 **member nations**; and a membership / title tenure
ends for varied reasons (declined, resigned, expelled, revoked).

**Decision** (additive):

1. **`subordinate-to`** relation (crew/org → crew/org, historised) — sub-crews
   and org subdivisions. Distinct from `member-of` (person → group) and `ally-of`
   (symmetric); this is the asymmetric "reports to".
2. **`member-state-of`** relation (location → organization, historised, with a
   `membership_status` qualifier → new `membership-statuses` vocab) — a nation's
   membership in the World Government. New edge domain: a location as the member.
3. **`departure_reason`** qualifier (→ new `departure-reasons` vocab:
   declined/resigned/expelled/revoked/annulled/abolished/deceased/mia) on
   `member-of` + `bears-title` — why a membership or title ended.
4. **`system_status`** property (enum → new `system-statuses` vocab:
   active/abolished/reformed; historised, spoiler-sensitive) on `title` — a power
   system's lifecycle, e.g. `title:shichibukai` flips to `abolished` at ch.956.
   Appointment / revocation of individual holders stays on `bears-title`
   (`since`/`until` + the base `event` qualifier).

**Consequences**: +2 relations, +1 property, +3 vocabularies; `crew` / `org` /
`location` `allowed_relations` and `member-of` / `bears-title` qualifiers
extended. No `/data` migration (additive; no group/title data uses them yet).
Snapshot regenerated (all diffs additive per `check:compat`). Cluster C3.

---

## ADR-042 — Schema-evolution policy + `check:compat` lockfile (SDK/API compatibility)

**Date**: 2026-06-13

**Context**: The data-expansion plan adds entity types / properties / relations
/ vocabularies fast. Because the model is schema-driven and the
SDK/API/db-builder are **generic** (records carry the JSON as opaque
`data`/`value`/`qualifiers`; queries key off string ids), **additive** changes
already flow through without breaking consumers — and SQLite is a disposable
artefact rebuilt from migrated JSON, so there is never stranded data. The real
risk is a **breaking** change (remove / rename / retype / tighten) reaching the
SDK/API or external consumers (public app Phase 6, API Phase 8) **unnoticed**.
There was no automated guard for that.

**Decision**:

1. **Policy: expand → migrate → contract** (parallel-change). Never remove or
   rename in one step: add the new, migrate the data, mark the old
   `deprecated`, remove it later once no consumer uses it. **Additive by
   default.**
2. **`check:compat` schema lockfile.** A committed
   `packages/schema-engine/schema-snapshot.json` captures the public **contract**
   — per entity-type the property set + which are required; per property-type
   the `value_type` / `enum_ref` / `historical` / `localizable`; per
   relation-type the endpoints + qualifiers + `inverse_inferred`; per vocabulary
   its value set. `bun run check:compat` (CI gate, after coherence) fails on
   **any** divergence; `bun run compat:snapshot` regenerates it. The classifier
   tags each diff **additive** vs **breaking**; breaking diffs are listed and
   additionally require a `/data` migration + the `schema-breaking` PR label. ⇒
   the contract change is always visible in review, and a break can't ship by
   accident.
3. **Stable-name core.** The build pipeline references a few names directly
   (`canon_scope`, `features`, `appearance_type`) for derived fields
   (primary_canon_scope, appearances). These are a documented small set **not
   to rename** without updating `packages/db-builder`.
4. **SDK stays generic** (no per-property typed methods) and exposes
   `schema_version`; the public **API is versioned** (`/api/v1`) when it opens.

**Consequences**: every schema PR now regenerates + commits the snapshot (one
extra step), so the contract diff is reviewable. New `compat.ts` +
`check-compat` CLI + `schema-snapshot.json` + a CI step + tests. The
`deprecated` marker (step 1) is the intended contract mechanism; the field
lands as an additive meta-schema change when the first deprecation occurs.
This is the infra cluster requested before continuing the data-expansion
clusters; it does not block them — additive cluster work passes the gate after
a snapshot refresh.

---

## ADR-041 — Character occupations + One Piece blood-type system

**Date**: 2026-06-13

**Context**: Cluster C2. (a) Characters need a **profession axis** (pirate,
marine, swordsman, doctor, revolutionary, …) distinct from their in-crew
**role** (`crew-roles`, carried on `member-of`): a character has crew-independent
occupations, often several, and they change over time. (b) The `blood-types`
vocabulary mixed the canonical **One Piece** system (F / S / X / XF — Oda's
parody of A / O / B / AB) with real-world ABO values (`A_plus` … `O_minus`) that
One Piece never uses, and tagged F/S/X with inaccurate species annotations.

**Decision** (additive bar the vocab cleanup — no entity uses `blood_type`,
verified):

1. `occupation` property (`multi_enum` → new `occupations` vocab; historised,
   spoiler-sensitive) on `character`. Distinct from `crew-roles`: occupation is
   the profession/identity (multiple, crew-independent); a crew-role is a seat
   on a specific crew. `[A][V]`
2. `blood-types` reduced to the canonical OP set `F` / `S` / `X` / `XF`
   (dropped the real-world `A/B/AB/O ±` and the species notes);
   schema_version 1 → 2. **No migration** (zero characters carry `blood_type`).
   `[B but no data][V]`

**Consequences**: +1 property type, +1 vocabulary; `blood-types` 12 → 4 values.
Occupation values + the blood-type set are `[verify against canon]`. The prose
research's "bounty change reason" is **already covered** by the base `event`
qualifier on property values — no `bounty` change. No `/data` migration.
Cluster C2 of the data-expansion plan.

---

## ADR-040 — Weapon grades (Meitō system) & owner succession

**Date**: 2026-06-13

**Context**: Cluster C6. The `weapon-grades` vocabulary used invented tiers
(`supreme_grade`/`great_grade`/`skillful_grade`/`legendary`/`cursed`) that
conflated the canonical Meitō ranking with orthogonal blade traits. Canon: graded
swords (Meitō, 名刀) form four tiers — Saijō Ō Wazamono (12 blades), Ō Wazamono
(21), Ryō Wazamono (50), Wazamono — while **cursed** (the Kitetsu line) and
**black blade** (Kokutō, _earned_ through Armament Haki) are independent flags,
not grades. No `weapon` entity exists in the corpus (verified: no
`entities/weapon/` dir, no `weapon_grade`/`weapon_type` usage), so the vocab
correction needs no data migration.

**Decision** (additive bar the vocab swap, which has zero data to migrate):

1. `weapon-grades` → `saijo_o_wazamono` / `o_wazamono` / `ryo_wazamono` /
   `wazamono` / `unranked` (schema_version 1 → 2). `[verify against canon]`
2. `is_cursed` (boolean) + `is_black_blade` (boolean, historised — earned)
   properties on `weapon`, split out from the grade axis.
3. `weapon-types` += `naginata`, `shikomizue`, `cutlass`, `saber`.
4. `wields-weapon` gains `succession_reason` (`until` already present) → weapon
   owner-succession (Wado Ichimonji: Kuina → Kōshirō custody → Zoro), reusing the
   `succession-reasons` vocab (ADR-039) and the §1.3 pattern.

**Consequences**: `weapon-grades` values are provisional pending a canon check;
+2 boolean property types; +4 `weapon-types`; **no `/data` migration** (zero
weapon entities). Deferred: the Kitetsu generational `succeeds` (weapon→weapon)
relation. Cluster C6 of the data-expansion plan.

---

## ADR-039 — Devil-fruit identity, user-succession & awakening

**Date**: 2026-06-13

**Context**: Cluster C4 of `DATA_EXPANSION_PLAN.md`. Devil fruits carry identity
nuance the model didn't hold: (a) a Zoan **model** ("Model: Nika") is orthogonal
to `classification` and is often a late reveal; (b) a fruit **reincarnates on its
user's death** — the Mera Mera no Mi passed Ace → Sabo, the Gomu Gomu / Hito Hito
Nika from Joy Boy → Luffy — so the eater is a **succession over time**, not a
single link; (c) an **awakening** is a distinct technique tied to the fruit
(Gear 5 ↔ Hito Hito no Mi, Model: Nika); (d) some fruits/abilities are
**non-canon** (anime/film/game-only).

**Decision** (additive, no migration):

1. `zoan_model` property (string, historisable, spoiler-sensitive) on
   `devil-fruit` — an open-ended model name, revealed independently of
   `classification`.
2. `ate-fruit` gains `until` (source_ref) + `succession_reason` (enum → new
   `succession-reasons` vocab). User-succession is N historised `ate-fruit`
   edges with `since`/`until`; the **current eater is the latest open edge**.
   Hidden eaters reuse ADR-037's relation epistemic axis. Answers backlog G4
   (`until` on `ate-fruit`) and the §1.3 succession pattern.
3. `awakening-of` relation (technique → devil-fruit, inverse "awakened form").
4. `canonicity` property (enum → new `canonicity-tiers` vocab:
   `canon`/`anime_only`/`film_only`/`game_only`/`sbs`/`non_canon`) on
   `devil-fruit` + `technique` — a canon tier orthogonal to spoiler progression
   (§1.4).

The **Nika reveal** becomes the worked epistemic case: at ch.1044 the fruit's
`classification` (paramecia → mythical_zoan), its `name` (true_name) and its
`zoan_model` (Nika) all flip together at one event, with the World Government as
`known_truth_by`. Documented in `EPISTEMIC_MODEL.md`.

**Consequences**: +2 property types (`zoan_model`, `canonicity`), +1 relation
(`awakening-of`), +2 vocabularies; `devil-fruit` / `technique` entity-types gain
the new fields/relation. No `/data` migration (additive; `gomu-gomu` gains
`zoan_model`). The §2A devil-fruit extras (weaknesses, fruit↔fruit interactions,
special-cost abilities, awakening outcome) are deferred to a follow-up **C4b**.
Cluster C4 of the data-expansion plan.

---

## ADR-038 — Naming axes (native script, romaji, literal meaning) + edition variants

**Date**: 2026-06-13

**Context**: The Fandom survey (`DATA_EXPANSION_PLAN.md` cluster C1) shows every
notable entity carries **4+ name axes** — native script (kanji/kana), romanized
(Hepburn), literal meaning/gloss, and official names that **differ per edition**
(Viz `Gum-Gum Fruit` vs 4Kids; `Zoro` vs `Zolo`; Glénat FR). Our model is most of
the way there already: `name` is an `i18n_key` property with a `name_type`
qualifier, and the i18n layer's translation files **already** support per-key
`{ default, variants: { … } }` (see `I18N_STRATEGY.md`), with `translation-variants`
a vocabulary. Two gaps: (a) no `name_type` values for the script/meaning axes;
(b) the variant-example keys in `I18N_STRATEGY.md` (`viz_translation`,
`fr_glenat`) did not match the vocabulary ids (`viz`, `glenat`), and no
resolution precedence was written down.

**Decision**:

1. Add three `name-types` values: `native_script` (kanji/kana), `romanized`
   (Hepburn), `literal_meaning` (gloss). A name entry of these types holds an
   `i18n_key` like any other. `native_script` / `romanized` are **locale-neutral
   content** (the same string under every UI locale until a `ja` locale is added
   per `I18N_STRATEGY.md`); `literal_meaning` is genuinely localizable.
2. **Edition variants stay in the i18n layer** — no property-level qualifier.
   The per-key `{ default, variants: { viz, glenat, … } }` shape (already
   specced) holds the edition spellings. **Resolution precedence**: reader's
   chosen edition variant → `default` → `en` fallback.
3. Add `funimation` and `4kids` to `translation-variants` (distinct EN editions
   whose names diverge, e.g. Zoro/Zolo). `[verify against need]`

**Consequences**: additive — three `name-types` values, two
`translation-variants` values; **no data migration**, **no code change** (the
read-path variant resolution is a Phase-6 public-app concern; the storage shape
already exists). Docs updated same-PR: `DATA_MODEL.md` (Name types), `INVENTORY.md`
§5.4, `I18N_STRATEGY.md` (corrected the variant-key example to the real vocab ids
`viz`/`glenat`; documented the precedence). Worked example — Gomu Gomu no Mi:
`native_script` `ゴムゴムの実`, `romanized` `Gomu Gomu no Mi`, `literal_meaning`
"Gum-Gum", Viz variant "Gum-Gum Fruit". First cluster of the data-expansion plan.

---

## ADR-037 — Generalize the epistemic axis to all relations as base qualifiers

**Date**: 2026-06-13

**Context**: ADR-034 (#2) gave `uses-technique` an `epistemic_status`
qualifier so an edge could mean "shown using" vs "inferred-available".
The same machinery is needed far more broadly: **hidden relationships** —
secret alliances, double agents, concealed family ties, disguises
(`Sogeking = Usopp`), shared identities — all turn on _what kind of truth
a link is_ and _who knows it_, exactly the axis historisable **property
values** already carry (`epistemic_status`, `believed_by`,
`known_truth_by` — see DATA_MODEL § "Epistemic status").

Relation qualifiers are already a free bag: `buildEntitySchema`
(`entity-loader.ts`) and the generated `RelationEntry`
(`printers/entities.ts`) both type `qualifiers` as
`z.record(z.string(), z.unknown())`, so `epistemic_status` on a relation
already _validates_. What is missing is three things:

1. **Recognition** — the axis is not acknowledged as base, so a relation
   type can redundantly re-declare it (only `uses-technique` does today),
   and a typo in the enum value is silently accepted.
2. **Reference integrity** — `check:references` / `check:coherence`
   follow only `since`/`until`/`source`/`event` on a relation, so a
   character referenced solely as a secret-keeper would be invisible.
3. **Exposure** — the db-builder `relations` table buries everything but
   `since`/`until` in the opaque `qualifiers` JSON blob, and the SDK
   `RelationRecord` surfaces none of it. You cannot query "who is secretly
   allied with whom, as known at chapter N" without re-parsing JSON.

**Decision**: promote a fixed set of **relation base qualifiers** —
`epistemic_status`, `believed_by`, `known_truth_by`, `revealed_since` —
to first-class, engine-provided status on every relation, mirroring the
property base qualifiers.

- `epistemic_status` (enum `epistemic-statuses`), `believed_by` /
  `known_truth_by` (entity_ref[]) carry the same semantics they have on
  property values.
- `revealed_since` (source_ref) is **new**: the source at which the
  relation — or its true nature — becomes known to the reader/world,
  distinct from `since` (when the link holds in-universe). For a secret
  alliance, `since` = when it formed, `revealed_since` = the chapter it
  surfaces, `known_truth_by` = who was in on it, `epistemic_status` =
  `believed_by_characters` / `implied` / `confirmed`.

Concretely:

1. **Recognition + guard**: relation types MUST NOT declare a base
   qualifier (mirrors the SCHEMA_SPEC rule for properties). A new
   schema-level `check:coherence` rule `RELATION_DECLARES_BASE_QUALIFIER`
   enforces it. `uses-technique` drops its now-redundant `epistemic_status`
   declaration.
2. **Validation**: `buildEntitySchema` and the generated `RelationEntry`
   type the four base qualifiers inside `qualifiers` (all optional,
   enum/ref-typed) while keeping `.passthrough()` for relation-specific
   qualifiers — existing data stays valid, and a bad `epistemic_status`
   value is now rejected.
3. **Reference integrity**: relation `revealed_since` (source_ref) and
   `believed_by` / `known_truth_by` (entity_ref[]) join the ref-resolution
   and unreferenced-entity scans.
4. **Exposure**: the db-builder `relations` table gains
   `epistemic_status` (NOT NULL DEFAULT `'true'`), `believed_by`,
   `known_truth_by`, `revealed_since` columns, populated for **both** the
   authored edge and its generated inverse (a secret tie is equally secret
   in both directions). The SDK `RelationRecord` surfaces the same four.

**Scope / non-goals**:

- `since` / `until` / `source` stay relation-type-declared qualifiers
  (they already are) — only the **epistemic axis** becomes base. This is
  the explicit ask and leaves the well-established temporal qualifiers
  undisturbed.
- The property base set's `event` and `actual_value` are **not** added to
  relations; `revealed_since` covers the relation reveal-point directly.
  Room is left to add them later if a case demands it.
- `family-of.known_publicly_since` overlaps `revealed_since` but can also
  mean "public knowledge" (vs "revealed to reader", which
  `epistemic_status` + `believed_by` capture); left as a relation-specific
  qualifier. Consolidation is a possible follow-up, not part of this ADR.
- Unblocks **G3** (`disguise-of` / `same-identity-as`) and secret-alliance
  / double-agent modelling, which depend on this axis.

**Consequences**:

- New coherence code `RELATION_DECLARES_BASE_QUALIFIER`; `uses-technique`
  qualifier list shrinks by one (now base).
- `relations` table widens by 4 columns; `RelationRecord` gains 4 fields.
  **No `/data` migration**: the change is additive and existing
  epistemic-on-relation data (e.g. `bears-title`/`eaten-by` examples in
  DATA_MODEL) was already valid under the free bag.
- Docs updated same-PR: DATA_MODEL § "Epistemic status on relations",
  SCHEMA_SPEC § "Relation base qualifiers", INVENTORY § "Universal
  relation qualifiers", BUILD_PIPELINE relations-table columns.

---

## ADR-036 — Folder-based universe schemas (`data/universes/<id>/schemas/`)

**Date**: 2026-06-13

**Context**: ADR-035 added universe scoping via an optional `universes`
tag + a consistency guard. The maintainer prefers expressing "this
schema belongs to One Piece" by **location** — a `schemas/` folder
inside the already-existing `data/universes/one-piece/` — rather than a
tag on every file.

**Choice**: the loader now reads, in addition to the shared core under
`/data/schemas/**`, each universe's
`/data/universes/<id>/schemas/{entity-types,property-types,relation-types,vocabulary}/**`
and **auto-scopes** those files to `<id>` (injects `universes: [<id>]`;
an explicit `universes` on the file still wins, so a folder can host a
schema shared with a sibling universe). **Folder = scope** for the common
case; the `universes` tag (ADR-035) remains for cross-subset sharing.
The merged catalogue and `checkUniverseScopes` are unchanged.

**Consequences**:

- Loader merges core ∪ per-universe folders (this PR). With the One Piece
  folder still empty, behaviour is unchanged (verified). The dashboard's
  `import.meta.glob('../../../data/**/*.json')` already captures the new
  paths — no bundle change needed.
- **Relocation is a deliberate follow-up** (task #24): the One Piece power
  system (devil-fruit, techniques, haki, bounty) is woven into a central
  `character` type via properties + relations, so a _consistent_ move
  (guard-green) pulls most of the domain into `one-piece/`, leaving a
  small universal **core** (image; the media/narrative types
  `manga-chapter`/`anime-episode`/`film`/`arc`/`saga`; generic property
  types; the provenance/epistemic/canon/name-type/license vocabularies;
  generic structural relations). Where the core/One-Piece line falls —
  notably whether `character` is core or per-universe — is the open
  design call; the guard makes whatever partition is chosen provably
  consistent. The move is mechanical (git mv) and leaves the merged
  catalogue identical, so validate/build stay green.

---

## ADR-035 — Universe-scoped schemas (multi-manga), guarded for consistency

**Date**: 2026-06-13

**Context**: The data model must eventually host more than One Piece
(Naruto, Bleach, …). Entities are already per-universe
(`/data/universes/<id>/`), but **schemas are global** (`/data/schemas/`).
ARCHITECTURE §Extensibility said "extend `/data/schemas/` for a new
universe" — which makes the schema a union, with nothing scoping a type
to a universe: editing One Piece would offer Naruto's `jutsu` type or a
`chakra-natures` vocab. The maintainer's framing: _schemas differ per
manga, but the whole thing must stay manageable._

Investigation showed the **primitives are already universal** (the four
historisation axes, epistemic-statuses, canon-scopes, name-types,
image/license/format vocabularies, value-types). What is
One-Piece-specific is a subset of **entity types / property types /
relation types / vocabularies** (devil-fruit, bounty, haki, SBS, …).
Crucially, these are **entangled**: tagging `devil-fruit` one-piece
pulls in `ate-fruit` → `character` → `bounty`, `technique` →
`enabled-by-fruit`, etc. — a reference closure. A half-done tagging
silently dangles in another universe.

**Options considered**:

1. **Per-universe schema directories** (`/data/universes/<id>/schemas/`,
   loader merges core ∪ universe). Clean at scale but a big-bang
   relocation of ~190 files + a per-universe catalogue/generator rewrite.
   Deferred — not needed with one universe.
2. **Tag each schema with `universes`** (omitted = shared core). Chosen:
   additive, no file moves, forward-compatible, and the same flat layout
   keeps tooling simple while there is one universe.

**Choice**: optional `universes: Slug[]` on every meta-schema
(entity/property/relation/vocabulary). Omitted/empty = **shared core**
(present in every universe). A universe's effective catalogue is
`forUniverse(catalogue, id)` = core ∪ schemas scoped to `id`.

The invariant that keeps it manageable — **a schema may only reference
schemas present in every universe where it itself is present** (core may
reference only core; a `["one-piece"]` schema may reference core +
one-piece). `checkUniverseScopes` enforces this in `check:coherence`
(`SCHEMA_UNIVERSE_SCOPE_LEAK`), so an inconsistent tag is caught before a
second universe exists.

**Consequences**:

- **This PR (mechanism + guard)**: the `universes` field, `forUniverse`,
  and `checkUniverseScopes` (wired into `check:coherence`); meta-schemas
  regenerated. Everything stays **core** for now → guard green, zero
  behaviour change. Tests cover filtering + the leak guard.
- **Next (apply scoping)**: tag the One-Piece reference-closure
  (`devil-fruit`, `character`, `technique`, `sbs` + their props/relations/
  vocabs) under the guard — iterate until green — then point the
  dashboard at `forUniverse(catalogue, "one-piece")` so the editor only
  offers a universe's own types. Where the core/specific line falls (esp.
  is `character` core or per-universe? its property composition is
  universe-specific) is the design call there.
- **Deferred**: per-universe Zod generation + per-universe `validate`
  (today's global validation is correct while one universe exists). The
  directory-relocation (option 1) remains available if the flat layout
  grows unwieldy.
- Supersedes ARCHITECTURE §Extensibility's "just extend /data/schemas"
  with the scoped-tag model.

---

## ADR-034 — Techniques, transformations & per-user vs fruit-inherent abilities

**Date**: 2026-06-13

**Context**: How does the model represent techniques (Hiken, Gear 2),
transformations/awakenings (Gear 5, Gear 4 forms), and — crucially —
the fact that an ability can be **shared by several users of the same
fruit** yet only **partially observed** per user? Concrete case: Ace
and Sabo both ate the Mera Mera no Mi; some of Ace's techniques have
been shown used by Sabo, but **not all** — the model must distinguish
"seen using" from "could use (fruit-inherent) but never shown".

**What already exists (sufficient bones)**:

- `technique` is a first-class entity (`technique_type`, `name`,
  `description_key`).
- `character --uses-technique--> technique` (historisable, `since`,
  `allow_multiple_concurrent`): WHO has been seen using WHAT, and when.
- `technique --enabled-by-fruit--> devil-fruit`: a technique is
  fruit-derived ⇒ conceptually available to ANY user of that fruit.
- `technique --derived-from--> technique`: variations / evolutions
  (e.g. Gear 4 Snakeman derived-from Gear 4).
- `devil-fruit.awakened` (boolean): fruit awakening.

So "shared" is naturally one technique entity with N `uses-technique`
edges (Ace AND Sabo → same `technique:hiken`), and "fruit-inherent" is
the `enabled-by-fruit` link. No new entity type is needed.

**Decisions**:

1. **Transformations are techniques**, not a new entity type. Added
   `transformation` and `awakening` values to the `technique-types`
   vocabulary. Gear 5 = a `technique` of type `awakening`,
   `enabled-by-fruit` the fruit, with `devil-fruit.awakened = true`;
   Gear 2/4 = `transformation`; sub-forms chain via `derived-from`.
   Rejected a dedicated `transformation` entity type as over-modelling —
   the technique entity + vocab + `derived-from` already express it.

2. **Observed vs inferable is the epistemic axis** (PROPOSED — pending
   implementation, gated on this ADR): `uses-technique` today carries
   only `since`. Add an epistemic qualifier (`epistemic_status`, or an
   `observation: confirmed | inferred`) so an edge can mean "shown using"
   vs "inferred-available". An entity is linked only for techniques it
   has actually been shown using; the **inference engine** (backlog #5)
   then derives _"techniques of a user's fruit they haven't been shown
   using"_ = `enabled-by-fruit(fruit)` − `uses-technique(user)`, surfaced
   as _potential / unconfirmed_ and spoiler-filtered. This is what
   answers the Ace/Sabo case precisely.

3. **Mirror cleanup completion** (extends ADR-033): the prefer-inferred
   pass missed three redundant manual mirrors — `used-by`
   (↔ `uses-technique`), `borne-by` (↔ `bears-title`), `has-member-race`
   (↔ `belongs-to-race`). Deleted all three (zero data usage) and removed
   them from `technique` / `title` / `race` `allowed_relations`.

**Consequences**:

- Vocab `technique-types` gains `transformation`, `awakening` (additive,
  no migration). Relation catalogue 55 → 52 (three more mirrors gone).
- **Implemented now**: items 1 + 3 (vocab + mirror deletions).
- **Deferred to implementation** (item 2): the `uses-technique`
  epistemic qualifier + the inference rule, which depends on the
  db-builder inference engine (backlog #5). When built, it needs the
  qualifier added to `uses-technique` and an SDK surface for
  "potential abilities".
- Still open (separate, ADR-033 §deferred): the intentional-vs-redundant
  status of `has-member`/`member-of`, `led-by`, `captained-by`,
  `crewed-by`, `pilots` — these LOOK like mirrors but the schema author
  marked them deliberate dual-authoring; left untouched pending a call.

---

## ADR-033 — One canonical direction per relation: prefer the inferred inverse

**Date**: 2026-06-13

**Context**: The build pipeline auto-generates a reverse edge
`<relId>.inverse` for every relation type with `inverse_inferred: true`
(`packages/db-builder/src/extract.ts`). But the schema ALSO carried, for
~13 relations, a **hand-written mirror** expressing the same edge in the
opposite direction (e.g. `born-in` [inverse_inferred] **and** a separate
`birthplace-of`; `ate-fruit` **and** `eaten-by`; `depicted-by` **and**
`depicts`). So each such edge was represented twice — a generated
inverse plus a redundant manual relation — inflating the relation
catalogue, doubling `allowed_relations` entries, and inviting drift
(the two sides could disagree on `valid_*` types or qualifiers).

The W-A coherence audit surfaced this; no entity data used any of the
manual mirrors (data uses only the "active"/inverse_inferred side).

**Options considered**:

1. **Prefer manual** — set `inverse_inferred: false` everywhere and keep
   the explicit mirror files. Rejected: more files to hand-maintain and
   keep in sync; defeats the point of inverse inference.
2. **Prefer inferred.** Chosen: keep the `inverse_inferred: true`
   relation as the single canonical direction; delete the redundant
   manual mirror; the build supplies its reverse as `<relId>.inverse`.

**Choice**: For each strict-mirror pair, the `inverse_inferred: true`
side is canonical. Deleted the 13 manual mirrors — `birthplace-of`,
`home-of`, `mentored-by`, `wielded-by`, `contains-location`,
`causes-event`, `replaced-by`, `contains-arc`, `adapts`, `depicts`,
`enables-technique`, `eaten-by`, `participated-in` — and removed them
from the 9 entity types' `allowed_relations`. An entity expresses the
relationship from the canonical side (e.g. a character holds
`depicted-by → image`; the image's "depicts" is generated), never by
declaring the mirror.

**Consequences**:

- Relation catalogue 68 → 55. No data migration (no entity used a
  deleted relation; `check:references` + `check:coherence` green).
- The schema-level coherence check (ADR-032 W-A) already guards against
  an `allowed_relations` entry whose relation forbids that source type,
  so re-introducing a mirror that isn't wired correctly is caught.
- **Deferred — NOT strict inverses, need a product decision** (left
  untouched): `references` ↔ `references-event` (overlapping subset,
  both inverse_inferred), `appears-in` ↔ `features` (asymmetric
  valid_* types; `appears-in` is the authored entity→source side),
  `part-of-arc` ↔ `occurs-during-arc` (both inverse_inferred and both
  used by data — genuinely two relations). These are tracked
  separately, not folded into prefer-inferred.
- Intentional asymmetric authored pairs (`has-member`/`member-of`,
  `captains`/`captained-by`, …) are NOT mirrors and were left as-is.

---

## ADR-032 — Re-sequence: pull admin queue, schema editor & availability links forward

**Date**: 2026-06-13

**Context**: ADR-027 set the post-4.3 order as 4.3 → 3.5 (bulk ingest) →
6 (public app) → 5 (schema editor) → 7 (community) → 8 (API). The
maintainer has since reprioritised toward **dashboard/admin maturity
before bulk ingest**: an in-dashboard PR-review queue, contributor &
contribution surfaces, schema/enum/value editing, a real media-
management UX, platform "where to watch/read" links, plus a pass on
entity coherence and dashboard UI consistency. The motivation is that
ingest (3.5) produces thousands of `auto_imported` entities that are
unusable without strong triage/review tooling — so the tooling should
land first — and that the maintainer is today the sole reviewer doing
PR triage by hand on github.com.

Investigation (2026-06-13) established what already exists vs is
missing, which reshapes the work into additive slices rather than new
phases:

- **Admin moderation queue** (Phase 7.3): promote/reject **backend
  shipped** (`server/admin-promote.ts`, `/api/admin/{promote,reject}`);
  only the gated `/admin/queue` **UI** is missing.
- **Contributors/contributions**: only `MyContributions` (the user's
  own open PRs) exists; no global aggregation. **Constraint:** every
  commit/PR is bot-authored (ADR-016), so GitHub's native
  author/contributor APIs don't reflect humans — the sole human-
  attribution source is the **PR-body "Contributors" bullet**, which any
  aggregation must parse.
- **Availability/platform links**: fully **designed** (ADR-028 +
  DATA_MODEL "Availability links") but **no schema/code**; affiliate
  links explicitly deferred there and undesigned.
- **Schema/enum editor** (Phase 5): not started.
- **Media management**: uploader exists (drag-drop, presign, progress)
  but there is **no media library, no reuse picker, and images are
  never displayed on any entity page**.
- **Coherence/UI**: no automated coherence checker beyond reference
  resolution; dashboard has god-modules and ~7 routes duplicating the
  `useEffect`+`useState`+skeleton+`Failed:` pattern with no shared
  data-fetching abstraction.

**Options considered**:

1. **Hold ADR-027 order** (ingest next). Rejected: floods the wiki with
   un-triageable auto-imports before the triage/review tools exist.
2. **Re-sequence: tooling-before-ingest.** Chosen: build the admin/
   review/editor/media tooling and the coherence + UI foundations
   first, then run 3.5 ingest into mature tooling.

**Choice**: New post-4.3 order →
**F (UI-coherence foundation) → A (coherence linter) → B (admin queue +
contributors) → C (schema/enum/value editor) → E (availability links) →
D (media library + image UX)**, then resume **3.5 → 6 → 7 → 8**. Each
workstream ships as independent PR(s); the full breakdown lives in
`/docs/STATE.md` § "Active plan". No new app, no runtime DB: live
PR/contributor data is read from the GitHub API on demand (module-level
cache); derived aggregates are either computed server-side or emitted as
generated TS manifests under `packages/` (same pattern as
`packages/schemas/generated`); image bytes stay on R2.

**Consequences**:

- ROADMAP "Current phase" / order line updated to reference this ADR;
  Phases 5 and 7.3 are pulled forward of 3.5/6 (their specs stand —
  only timing moves, mirroring how ADR-027 reordered).
- **Dependent decisions still required** (logged separately as work
  reaches them): qualifiers schema-driven (task #3); affiliate links
  (FTC disclosure + `rel="sponsored nofollow"` + program/tag model);
  god-module decomposition (task #8); possibly adopting the already-
  bundled TanStack Query for the shared fetch layer; a `SCHEMA_SPEC`
  `object` value-type section (ADR-026 prereq for availability links).
- Does not block a later return to 3.5; the ingest spec (ADR-026) is
  unchanged.

---

## ADR-031 — Schema-driven display-name resolution (`display_name_properties`)

**Date**: 2026-06-13

**Context**: The shared display-name resolver
(`packages/schemas/src/display-name.ts`, extracted in the dedup PR)
still hardcoded the property priority `['name', 'title_key']` as a
code-level constant. That violates the non-negotiable rule "No property
name is hardcoded in application code" (CLAUDE.md / ADR-002): a new
universe — or a One Piece entity type whose display name isn't `name`
or `title_key` (e.g. `image` → `caption_key`) — could not control its
own display name without a code change.

**Options considered**:

1. **A marker on _property-type_ schemas** (e.g. `is_display_name: true`).
   Rejected: a property type is shared across entity types, so it can't
   express per-entity-type priority (a chapter's `title_key` vs a
   character's `name`) or ordering, and it couples the property's
   identity to one role.
2. **`canonical_name_key`-first** (privilege the existing
   `canonical_name_key` concept). Rejected: `canonical_name_key` is an
   entity-instance/i18n concern, not a per-type display-priority list,
   and several types have no single canonical key.
3. **An ordered `display_name_properties` list on the _entity-type_
   schema.** Chosen: display priority is intrinsically per-entity-type
   and ordered; this matches the shape exactly, stays additive, and
   needs no data migration.

**Choice**: Add an optional ordered `display_name_properties: Slug[]` to
the entity-type meta-schema. The resolver accepts it as a
`nameProperties` argument; when a type omits it (or a caller has no
schema config to hand), the functions fall back to a documented
`DEFAULT_NAME_LIKE_PROPERTY_IDS = ['name', 'title_key']`. So behaviour
is identical for every existing type, while the priority is now
schema-controlled.

**Consequences**:

- `EntityTypeSchema` (Zod) gains optional `display_name_properties`.
- `nameKeyFor` / `resolveDisplayName` take an optional ordered list;
  the three dashboard call sites (server `buildDisplayNames`, the entity
  page, the edit drawer) pass the entity type's `display_name_properties`.
- `anime-episode`, `film`, `manga-chapter` declare
  `["title_key"]` explicitly — exactly what the default already
  resolved to, so no behaviour change; it documents intent and
  exercises the override.
- **Now unlocked (follow-up):** types with no `name`/`title_key` — e.g.
  `image` (`caption_key`) and `sbs` — can get real display names instead
  of the slug fallback by declaring `display_name_properties`. Left out
  of this PR to keep it behaviour-preserving.
- No data migration; `bun run validate` + `schema:check` pass;
  generated types unchanged.

---

## ADR-030 — Standardize on `bun test`; remove Vitest

**Date**: 2026-06-13

**Context**: CLAUDE.md's stack listed _"Tests (unit): Vitest (use
`bun test` only for plain runtime scripts)"_, and a `vitest.config.ts`
existed. But the codebase never followed it: all seven test suites
import `bun:test`, CI runs `bun run test` → `bun test`, and nothing
invokes Vitest. The `vitest` devDependency + config were dead, and the
documented mandate contradicted reality — surfaced when a new
db-builder test was first written against Vitest and failed under the
actual `bun test` runner.

**Options considered**:

1. **Migrate every suite to Vitest** to honour the existing mandate.
   Rejected: pure churn for no benefit — `bun test` already runs the
   whole suite fast, in-process, with the same Jest-style `expect`
   API, and is the runtime the project already standardised on.
2. **Standardize on `bun test`, remove Vitest.** Chosen: align the
   contract with the de-facto reality.

**Choice**: `bun test` is the unit-test runner. Removed the `vitest`
devDependency and `vitest.config.ts`; updated CLAUDE.md.

**Consequences**:

- `vitest` devDependency and `vitest.config.ts` deleted.
- CLAUDE.md stack line updated to `bun test`.
- No test files change — they already use `bun:test`.
- Playwright remains the planned e2e runner (unaffected; ROADMAP
  Phase-4 / task to add it stands).
- `bun test` continues to pass (52 tests across 7 files).

---

## ADR-029 — Two schema regimes: pre-freeze volatility, post-freeze API stability

**Date**: 2026-06-13

**Context**: ADR-025 and ADR-028 describe an elaborate public-API
versioning regime — frozen per-version wire-format adapters, MAJOR
bumps on rename/remove, 18-month deprecation windows, an impact
analyzer that blocks breaking PRs. That ceremony presumes a _stable_
schema where breaking changes are rare, deliberate events. The
current reality is the opposite: the schema is **volatile**. Property
and relation shapes change often as the model matures; fields get
renamed and removed routinely. There are also **zero external API
consumers today** — no public API is deployed — so there is no
contract to honor. Applying the post-freeze ceremony now would either
paralyse ordinary schema evolution or accumulate meaningless `v2`
bumps and dead aliases for fields nobody outside the repo ever
consumed.

**Decision**: distinguish two explicit regimes, separated by a
one-way **schema-freeze milestone**.

### Pre-freeze regime (current)

- No public API is deployed; no external consumer is pinned to any
  wire format.
- The schema may change freely, **including breaking changes**
  (rename, remove, retype a property / relation / vocabulary value).
- A breaking change is handled in a **single PR**:
  1. edit the schema file;
  2. migrate `/data` — rewrite every entity JSON that used the old
     shape;
  3. bump the affected entity type's `schema_version`;
  4. regenerate Zod (`bun run schema:generate`);
  5. update internal consumers (`packages/sdk`, `apps/dashboard`,
     `apps/preview`) in lockstep.
- **No deprecation, no aliasing, no old-field retention.** Internal
  consumers are not version-pinned; they ride the current data shape
  and are refactored together. This is safe precisely because there
  is no external contract.
- `schema_version` and the `assisted_by` / `review_status`
  provenance are the only backward-looking metadata kept. Old
  _field names_ are not preserved.

### Post-freeze regime (begins at API v1.0.0)

- Triggered when the freeze milestone is declared and
  `packages/api-v1/` ships.
- The full ADR-025 / ADR-028 ceremony then applies: frozen wire
  format per MAJOR, aliasing or `v2` on rename, deprecation windows,
  `api:impact` as a blocking CI gate.
- Internal data keeps evolving; the adapters absorb the drift so
  external consumers stay insulated.

### The freeze gate

The schema is declared stable enough to freeze and ship v1 only when
**all** of:

1. The Phase 3.5 bulk ingest is complete — data shapes proven
   against the full corpus (~1500 characters, ~1130 chapters, …),
   not just the ~30 seed entities. A model that holds at 30 entities
   can still break at scale.
2. No breaking change to the **core** entity types (`character`,
   `devil-fruit`, `manga-chapter`, `anime-episode`, `arc`, `crew`,
   `event`) has landed in the preceding ~8 weeks.
3. The Phase 6 public web app has run on the schema and exercised
   every property / relation a consumer would read.

Until all three hold, the project stays pre-freeze and the API
versioning machinery is **documentation, not policy**.

**Consequences**:

- `PUBLIC_API_DESIGN.md` gains a prominent §0 stating the gate: its
  versioning rules apply only post-freeze; pre-freeze, see this ADR.
- The `api:impact` analyzer (ADR-025) is **not** wired as a blocking
  gate until the freeze. Pre-freeze it runs advisory-only, or not at
  all.
- A lightweight **schema-migration helper** becomes valuable now
  (frequent renames during volatility). Pulled forward from Phase 5
  Task 4 as a near-term backlog item: a scripted `/data` rewrite +
  `schema_version` bump so a rename stays a one-command operation
  rather than a manual sweep. Tracked separately; not built here.
- No code, schema, or data change in this ADR.

**Open question**: should `schema_version` bump automatically
(tooling-enforced) on a detected breaking change pre-freeze, or stay
manual? Direction: manual until the migration helper lands, then
helper-driven.

---

## ADR-028 — Anticipate availability links + webhook event model (design-only)

**Date**: 2026-06-13

**Status**: design-only, no code in this ADR. Two forward-looking
concepts are recorded now so the data model, build pipeline and
public API are built ready for them rather than retrofitted.

**Context**: two needs surfaced that the current design does not
cover.

1. **"Where to watch / where to read" links.** The Phase 6.1
   episode and chapter templates want per-platform links — Netflix,
   Disney+, Crunchyroll, ADN, Prime Video for anime episodes; MANGA
   Plus, Shōnen Jump+, Viz for manga chapters. ADR-026's
   `external_refs` covers cross-database _identifiers_ (`tmdb_id`,
   `mal_id`, `anilist_id`) but not per-platform, per-region
   _watch/read URLs_. Different concept, different lifecycle (URLs
   rot; identifiers don't).
2. **Webhooks.** ADR-025 / `PUBLIC_API_DESIGN.md` defer webhooks to
   "its own ADR". The maintainer wants the architecture not to
   foreclose them — webhooks need a domain-event stream, and if the
   build/merge pipeline never emits events, retrofitting one is
   painful. Fixing the event taxonomy and the emit seam now is cheap
   insurance.

**Decision 1 — Availability links as a historisable property**:

- New property type `availability` (`value_type: object`),
  attachable to the source entity types (`anime-episode`,
  `manga-chapter`, `film`). `allow_multiple` so one source can list
  many platform×region rows.
- Each entry shape:
  `{ platform, url, kind: "watch" | "read", region?: ISO-3166-1,
  subtitle_langs?: string[], dub_langs?: string[],
  requires_subscription?: boolean, verified_at?: ISO-8601 date }`.
- New vocabulary `streaming-platforms` (`netflix`, `disney-plus`,
  `crunchyroll`, `adn`, `prime-video`, `hulu`, `manga-plus`,
  `shonen-jump-plus`, `viz`, …) with FR/EN labels.
- **Not in the anti-spoiler scope.** Availability is real-world
  metadata; a watch link reveals nothing in-universe, so it is
  always visible. The _existence_ of the episode/chapter is still
  spoiler-gated by the normal source-reachability rules — you only
  reach the page if your progression reaches the source.
- **Freshness**: URLs rot. Each entry carries an optional
  `verified_at`; a future scheduled job can re-check and flag stale
  links. Maintained as data by contributors via the dashboard, like
  any other property.
- **Monetisation / affiliate links**: explicitly out of scope here.
  If affiliate tagging is ever wanted it is a separate decision; the
  `url` field stays a plain canonical link for now.

**Decision 2 — Webhook event model (taxonomy fixed, delivery
deferred)**:

- Fix a stable domain-event taxonomy now:
  - `entity.created`, `entity.updated`, `entity.deleted`
  - `source.published` (a new chapter / episode enters the corpus)
  - `vocabulary.changed`
  - `build.completed`
- Event envelope:
  `{ event, id, type, schema_hash, occurred_at, api_version }`.
  Snake_case on the wire, consistent with the REST conventions.
- **Emit seam**: the build pipeline (`packages/db-builder`) and the
  PR-merge flow are the natural emit points. The build manifest
  already records build metadata; the prerequisite for webhooks is a
  **build diff** — entities/sources added or changed since the
  previous manifest. This ADR does **not** implement the emitter,
  but it directs that future `db-builder` refactors preserve (and
  ideally expose) a manifest-to-manifest diff capability, since that
  is the seam every webhook feature will read from.
- **Delivery (future, own implementation ADR)**: a dispatcher reads
  the build diff, signs payloads (HMAC-SHA256 with a per-subscriber
  secret), POSTs to subscriber URLs with retry + exponential
  backoff, and exposes subscription management in the dashboard.
  All deferred; only the taxonomy and the emit seam are fixed here.
- `PUBLIC_API_DESIGN.md` § 6 / scope upgraded from "no webhook" to
  "webhook event taxonomy fixed in ADR-028; delivery deferred".

**Rationale**:

- Modelling availability as a property (not as `external_refs`)
  keeps identifiers and URLs separate: identifiers are stable join
  keys, URLs are perishable presentation data with their own
  freshness lifecycle. Conflating them would force the same
  validation and review cadence on two very different things.
- Region-awareness is unavoidable for streaming (One Piece is on
  different platforms per country); modelling it as a per-entry
  field lets the public app filter by the visitor's region without a
  schema change later.
- Fixing the webhook taxonomy now costs a paragraph; retrofitting an
  event stream onto a build pipeline that discarded its diffs costs
  a rewrite. The asymmetry justifies the cheap up-front commitment
  even though delivery is far off.
- Keeping delivery deferred avoids over-building: there are zero API
  consumers today, so a running dispatcher would be speculative.

**Consequences**:

- New schema files (spec'd, implemented when Phase 6.1 needs them):
  `data/schemas/property-types/availability.json`,
  `data/schemas/vocabulary/streaming-platforms.json`. The three
  source entity types (`anime-episode`, `manga-chapter`, `film`)
  gain an `availability` property reference.
- `docs/DATA_MODEL.md` gains an "Availability links" subsection.
- `docs/PUBLIC_API_DESIGN.md` § scope + a new "Webhook event model"
  note updated to reference this ADR.
- `docs/ROADMAP.md` Phase 6.1 episode + chapter templates list the
  "where to watch/read" surface.
- `packages/db-builder`: future refactors keep a manifest-to-
  manifest diff capability in mind — it is the webhook emit seam and
  also feeds the Phase 6.6 `/help-wanted` and "recently revealed"
  surfaces.
- No code, schema, or data changes in this ADR.

**Open questions** (for the implementation ADRs):

1. Region granularity — per-country (ISO-3166-1) vs per-locale
   bucket? Direction: per-country, displayed grouped by locale.
2. Link-freshness ownership — contributor-maintained only, or a
   scheduled HEAD-check job that flags 404s? Direction: start
   contributor-only, add the job if rot becomes a problem.
3. Webhook subscriber auth + secret rotation model — deferred to the
   delivery ADR.
4. Whether `source.published` fires on data merge or only on a
   tagged release build — deferred to the delivery ADR.

---

## ADR-027 — Lead with product: expand Phase 6, defer Phase 5 + Phase 7

**Date**: 2026-05-21

**Context**: the wiki has zero contributors, no public app live, no
runtime database (intentionally), and a single maintainer. The
current ROADMAP runs Phase 5 (vocab/schema editor in dashboard)
before Phase 6 (public web app), and treats Phase 6 as a thin
deliverable (five tasks: design system, SEO, progression UX, search,
perf pass).

To attract a community without marketing budget or sustained social
presence, the only viable strategy is to lead with product quality.
A polished public app whose data depth and UX feel a generation
ahead of fandom.com is the marketing — the alternative (build a
mediocre site, then evangelise) reverses the cost-benefit and is
unrealistic for a solo project.

A subordinate decision: the absence of a runtime DB is **not** a
constraint on the wiki experience. Every visualisation the wiki
needs (bounty curves, classification timelines, relation graphs,
comparison views) is derivable from the static JSON corpus at build
time. The DB question only constrains the social layer (comments,
votes, real-time notifications), which is explicitly out of scope
for Phase 6.

**Options considered**:

1. **Marketing-led**: pre-launch social presence, Discord buildup,
   YouTuber outreach, partnership posts. Rejected: requires
   sustained single-maintainer time investment that bottlenecks
   product development.
2. **Feature-mass**: ship many low-polish features quickly to "look
   active". Rejected: dilutes effort, leaves a thin site, defeats
   the moat strategy.
3. **Quality-led, single soft launch**: invest heavily in Phase 6
   quality + Phase 3.5 data completeness, then a single targeted
   soft-launch post per relevant community. Chosen.

**Choice**:

- **Reorder the roadmap**:
  - Phase 6 (public app) executes **before** Phase 5 (vocab/schema
    editor in dashboard).
  - Phase 5 becomes "executed when dashboard volume justifies it";
    direct GitHub PRs on schema files remain acceptable in the
    meantime.
  - Phase 7 (community opening) executes **after** Phase 6 soft
    launch and only when contributor inflow justifies the 3-tier
    auth + moderation queue.
- **Expand Phase 6 into seven sub-phases** (6.0 through 6.7), each
  shippable independently with its own preview deploy. Full detail
  in `docs/ROADMAP.md` § Phase 6.
- **Reaffirm the no-runtime-database constraint**: all "graphs" in
  the public app are static SVGs generated at build from the
  SQLite artifact. Analytics use Plausible or Cloudflare Analytics,
  not an own DB. Social-layer features stay out of Phase 6 scope.
- **Soft-launch criterion**: a single post on r/OnePiece and a
  single post on r/OnePieceFR, no paid promotion, no influencer
  outreach. Day-one success metric is "≥ 100 unique visitors and
  ≥ 1 inbound contributor signal (issue, PR, Discord join)".

**Rationale**:

- A solo maintainer with zero contributors cannot afford parallel
  marketing work and product work. Picking one means picking the
  one whose output compounds: product.
- Phase 5's dashboard vocab/schema editor is a developer
  convenience, not a contributor-facing feature. The maintainer
  already commits schema PRs directly on GitHub via the worktree
  flow. Deferring it costs nothing relative to the strategic
  objective.
- Phase 7's full three-tier auth + moderation queue is meaningful
  only at non-trivial contributor volume. Building it before any
  contributor exists is over-engineering. The Phase 7 spec stands
  as written; only its timing moves.
- Phase 6 at its current size (~5 bullet tasks, ~30 lines) is too
  thin to express the "wow" expected of a quality-led launch. The
  expansion into seven sub-phases puts the actual work on paper.
- A no-runtime-database constraint is a free pass on the social
  layer's complexity. Embracing it explicitly (vs leaving it as an
  ambient assumption) lets future contributors avoid proposing
  DB-introducing features in Phase 6.

**Consequences**:

- `docs/ROADMAP.md` § Phase 6 rewritten with seven sub-phases (6.0
  Foundations, 6.1 Per-entity-type templates, 6.2 Spoiler cursor,
  6.3 Search + ⌘K + facets, 6.4 Visual polish + internal links,
  6.5 SEO + social + JSON-LD, 6.6 Contributor surfaces, 6.7 Perf
  pass + soft launch).
- `docs/ROADMAP.md` § Phase 5 and § Phase 7 each gain a
  **Scheduling** preamble explaining the new ordering.
- `docs/ROADMAP.md` top-of-file phase-order note updated to reflect
  the sequence: 4.3 → 3.5 → 6 (sub-phases) → 5 (when needed) →
  7 (when contributor inflow justifies) → 8 (REST API) → 9+.
- `IDEAS.md` gains ~15 parking-lot entries for features surfaced
  during the strategic pass (comparison views, embed widgets,
  cover-story navigation, today-in-OP-history, PWA offline, etc.).
  These are forward pointers, not Phase 6 scope.
- No code, schema, or data changes in this ADR.

**Out of scope**:

- Choice of analytics provider (Plausible vs Cloudflare Analytics):
  decided at Phase 6.7.
- Discord server tooling: hosted-service decision deferred.
- Mobile app: deferred to Phase 9+.
- Translation contribution UI: filed in `IDEAS.md`; promoted
  post-launch if FR contributors materialise.
- Marketing strategy beyond the single soft-launch post per
  community: out of ADR-027 scope.

---

## ADR-026 — Bulk ingest from Fandom EN + TMDB; split `appearance_type` into two axes

**Date**: 2026-05-17

**Context**: the wiki currently holds ~30 seed entities. To reach a
usable baseline before the public web app (Phase 6) we need to bulk-
import the One Piece corpus: ~1 500 named characters, ~250 devil
fruits, ~80 crews, ~1 130 manga chapters, ~1 181 anime episodes,
~25 arcs, ~9 sagas, hundreds of locations and events. Phase 3 Task 4
piloted 10 East Blue characters; this ADR scales that work to the
whole corpus, layers in multilingual episode content, and records
the model deltas the reconnaissance surfaced.

Two candidate sources were probed on real pages before this decision:

- **Fandom EN** (`onepiece.fandom.com`). PortableInfobox + DPL3
  extensions enabled; structured infobox data is fetchable as JSON
  via the API. Section layout is highly regular across 17 episodes
  (1 → 1131), 12 chapters, 15 arcs, 9 sagas sampled. Every chapter
  / episode page carries an ordered `Characters` list with inline
  `(qualifier)` annotations that map almost 1-to-1 to our
  `appearance-types` vocabulary. The Long Summary prose is
  CC-BY-SA, so out of bounds for copy; the structured fields and
  the ordered character lists are not copyrightable.
- **TMDB** (TV id `37854`). 1 181 episodes, 23 seasons cleanly
  organised by story arc, per-episode `overview` available in **21
  locales** with editorially real content (en, fr, de, es-ES,
  es-MX, it, pt-BR, pt-PT, ja, ko, ar, he, ru, tr, th, ro, ca, da,
  zh-CN/TW/HK), per-episode still image present on every episode
  sampled.
- **Fandom FR** (`onepiece.fandom.com/fr`). 7 612 articles, 39 032
  images, ~55 % of the EN volume. Lags significantly on Wano+
  content (every recent page is `{{Ébauche}}`). Distinct infobox
  template names, sparser fields, different markup conventions
  (`<small>(flashback)</small>` instead of `''(flashback)''`).
- **`langlinks` on EN pages**. Returns the page's title in up to 26
  other locales; FR present on every major entity probed. Becomes
  a free cross-lingual canonical-name index without fetching any
  non-English page.

**Options considered**:

1. **Adopt CC-BY-SA for the project to copy Fandom prose
   verbatim.** Rejected: locks the project's license in perpetuity
   for a benefit (legal prose copy) the project does not need
   (One Piece IP precludes commercial use anyway, and the
   maintainer explicitly declined).
2. **Single-source from TMDB only.** Rejected: zero structural
   coverage for characters, fruits, crews, chapters, arcs, sagas.
3. **Single-source from Fandom only.** Rejected: weak multilingual
   coverage (especially for recent content), no clean API for the
   non-English wikis, no still-image CDN.
4. **Hybrid: structured facts from Fandom EN, multilingual episode
   prose + stills from TMDB, FR canonical names from EN page
   `langlinks`, Fandom FR for FR dub airdates only, narrative prose
   generated locally.** Chosen.

**Choice**:

Source mapping (definitive for Phase 3.5):

| Data                                               | Primary                                                        | Notes                               |
| -------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Structured facts on every entity type              | Fandom EN PortableInfobox + Qref                               | —                                   |
| Per-chapter / per-episode ordered character list   | Fandom EN section parser                                       | —                                   |
| Filler-vs-canon episode flag                       | Fandom EN `Episode Box.filler`                                 | —                                   |
| Anime-episode → manga-chapter adaptation           | Fandom EN `Episode Box.chapter`                                | —                                   |
| Multilingual episode title + overview (21 locales) | TMDB `season/<n>/episode/<m>?append_to_response=translations`  | only EN + FR consumed in 3.5        |
| Episode still image                                | TMDB image CDN, hotlinked                                      | R2 mirror deferred                  |
| Canonical FR display name on any entity            | EN page `langlinks` (single API call)                          | —                                   |
| FR dub airdate per episode                         | Fandom FR `Episode Box.Date`                                   | only field consulted on the FR wiki |
| Long narrative prose (EN, FR)                      | Generated by Claude, using Fandom EN + FR as factual reference | prose **never** copied              |

**Locale scope for Phase 3.5: EN + FR only**. `langlinks` makes
24 additional locales available for free, but writing the
corresponding `translations/<locale>/...json` files is deferred to
Phase 6 when the public app will need them. This preserves the
Phase 1 i18n scope.

Model deltas to land in Phase 3.5 (specified here, implemented in
the Phase 3.5 sub-PRs):

- **`appearance_type` split into two orthogonal axes**.
  Reconnaissance found that ~10 % of Fandom character annotations
  combine modifiers — `flashback; silhouette`, `cover; fantasy`,
  `image; shadowed`, `flashback, as kouzuki momonosuke`. A single
  enum either explodes combinatorially or loses information. New
  shape on `features` and `appears-in` qualifiers:
  - `appearance_type` (single enum, required on `features`): what
    kind of presence — `full`, `mentioned`, `named_only`,
    `narrator_only`, `corpse`.
  - `appearance_modifiers` (array enum, may be empty): how /
    where — `flashback`, `silhouette`, `partial`, `voice_only`,
    `photograph`, `portrait`, `imagined`, `monitor_screen`,
    `cover_story`, `recap`, `revelation`.
  - Two new modifier values (not present in today's vocabulary):
    `voice_only` (heard, not seen), `monitor_screen` (projected on
    a screen / hologram / transponder snail visual).
  - Migrated from the old single enum into `appearance_modifiers`:
    `silhouette`, `partial`, `flashback`, `cover_story`, `recap`,
    `vision` → folded into `imagined`, `photograph`, `portrait`,
    `imagined`, `revelation`.
  - Net new vocabulary file: `appearance-modifiers.json`.
  - `appearance-types.json` bumped to `schema_version: 2`, value
    set reduced to the five-value type axis.
- **`features` relation extension**: add `anime-episode` to
  `valid_from_types` (today only `manga-chapter`); add `location`
  and `technique` to `valid_to_types` (Fandom episode infoboxes
  expose `locationDebut`, `techDebut`).
- **New universal property type `external_refs`**. Object value
  type with optional sub-fields `tmdb_id`, `fandom_url`,
  `fandom_pageid`, `mal_id`, `anilist_id`. Attachable to every
  entity type via the schema-engine universal-property mechanism
  (analogous to `assisted_by` / `review_status`). Required for
  idempotent re-imports and for traceability back to the source
  page.
- **New property type `aired_at_fr`** on `anime-episode` (date,
  optional, not historical). Populated only when the Fandom FR
  page exposes a `Date / Diffusion Française` field.
- **`image-licenses` vocabulary extension**: add
  `tmdb-attribution`. The `fandom-cc-by-sa` value is **not** added
  in Phase 3.5 because no Fandom-hosted image will be mirrored;
  it is added when (if) the policy changes.
- **`since` policy when Fandom does not supply one**: omit the
  field. Zod accepts its absence on the import path; the
  dashboard surfaces a "missing source" indicator for human
  review. **Do not** invent a default such as `manga-chapter:1`.
- **Disguised-as cases** (Higurashi appearing as Momonosuke,
  Sabo as Lucy in Dressrosa, etc.): captured via a future
  optional qualifier `disguised_as: <entity_ref>` on `features` —
  not in 3.5 scope, noted as a follow-up.

Importer contract (lands as Phase 3.5 Task 1, before any bulk
run):

- `packages/importers` must implement **PR mode** (Phase 2 shipped
  dry-run only).
- Raw upstream payloads are snapshotted to `data/imports/raw/
  <source>/<key>.json` (gitignored from history, but kept locally
  for re-runs and diffs). Re-runs produce diff PRs, not blind
  overwrites.
- Every emitted value carries `assisted_by` + `review_status:
  "auto_imported"`. `assisted_by` is `"claude-<family>-<ver>-via-cc"`
  for AI-mediated mappings, `"tmdb-via-importer"` /
  `"fandom-via-importer"` for purely mechanical field copies.
- Parser tolerates both qualifier markups: `''(<q>)''` (EN
  convention) and `<small>(<q>)</small>` (FR convention).
- Composite qualifiers like `flashback; silhouette` decompose
  into multiple `appearance_modifiers` entries.
- Qualifier aliases applied at parse time: `shadowed → silhouette`,
  `fantasy → imagined`, `wanted poster → photograph`, `newspaper
  → photograph`, `not fully seen → partial`.
- Qref keys accepted in both EN (`chap=`, `ep=`) and FR
  (`chapitre=`, `episode=`) forms, even though FR-Fandom isn't a
  primary source — protects against accidental cross-wiki content
  and future expansion.

**Rationale**:

- Extracting only the non-copyrightable parts of Fandom while
  generating prose locally keeps the project off CC-BY-SA forever
  while still benefiting from the encyclopedic completeness of
  the EN wiki community. The maintainer can change license
  posture later without a destructive rewrite.
- TMDB's 21-locale episode coverage is editorially better than
  Fandom FR's and ships through a single API call. There is no
  realistic alternative for multilingual episode summaries.
- `langlinks` collapses what would otherwise be 26 separate
  cross-wiki import pipelines into a single string lookup per
  imported entity. The cost-benefit is unambiguous.
- Splitting `appearance_type` into two orthogonal axes is the only
  shape that captures the composite cases observed in real data
  without a combinatorial explosion or information loss. The
  five-value type axis is small, stable, semantically distinct;
  the modifier axis is extensible.
- Deferring the 24-locale `translations/` population to Phase 6
  preserves the Phase 1 scope. Storing them earlier would write
  files the public app does not yet read.

**Consequences** (each row a sub-PR target):

- New schema files: `data/schemas/property-types/external_refs.json`,
  `data/schemas/property-types/aired_at_fr.json`,
  `data/schemas/vocabulary/appearance-modifiers.json`.
- Modified schema files:
  `data/schemas/vocabulary/appearance-types.json` (reduced;
  `schema_version` 1 → 2), `data/schemas/vocabulary/
  image-licenses.json` (`tmdb-attribution` added),
  `data/schemas/relation-types/features.json` (extended
  `valid_from_types`, `valid_to_types`; new `appearance_modifiers`
  qualifier), `data/schemas/relation-types/appears-in.json` (same
  qualifier addition), `data/schemas/entity-types/anime-episode.json`
  (new `aired_at_fr` property reference).
- **One-shot data migration**: any existing entity carrying a
  deprecated `appearance_type` value (`silhouette`, `partial`,
  `flashback`, `cover_story`, `recap`, `vision`, `photograph`,
  `portrait`, `imagined`, `revelation`) is rewritten to keep
  the modifier under `appearance_modifiers` and set
  `appearance_type` to its most plausible primary value
  (default `full`). Run as a scripted migration under
  `data/migrations/` before the schema PR lands.
- Doc propagation in the implementing PRs:
  `docs/DATA_MODEL.md` § "Appearance types" rewritten for the
  two-axis split; § "Provenance and review status" extended
  with `external_refs`. `docs/SCHEMA_SPEC.md` updated for the
  object-value property type shape used by `external_refs`.
  `docs/I18N_STRATEGY.md` notes `langlinks` as the FR
  canonical-name source and reaffirms that narrative prose is
  generated, not copied. `docs/ROADMAP.md` gains Phase 3.5
  (this ADR ships that update).
- `packages/importers` work: PR-mode adapter, raw-snapshot
  store, per-source clients (`fandom`, `tmdb`), per-entity-
  type mappers, parser library (Qref, infobox, character-list
  sections, qualifier composites + aliases), epistemic-patch
  applier.
- Build-pipeline impact: SQLite schema regeneration absorbs
  the new property + relation qualifier shapes automatically
  (schema-driven). No manual table edits.

**Out of scope for ADR-026**:

- Mirroring TMDB stills to R2 (hotlinked in 3.5; mirror is a
  later phase).
- Document entity type for in-universe artefacts (ADR-011
  deferral stands).
- Knowledge graph (Phase 8+ deferral stands).
- Live-action episodes despite `Saga Box.liveact` being
  available.
- Cross-universe expansion.
- Replacing Claude Code with the Anthropic API for bulk runs
  — see ADR-010 for the migration triggers.

---

## ADR-025 — Public REST API with versioned wire-format adapters (design only, deferred)

**Date**: 2026-05-19

**Status**: design-only. Implementation deferred — no code change in
this ADR. See `/docs/PUBLIC_API_DESIGN.md` for the full design and
`/docs/ROADMAP.md` for the deferred phase placement.

**Context**: ARCHITECTURE.md flags a public API as a future concern
("becomes relevant when third parties want to consume the data — a
likely demand from YouTubers, fan apps"). Before the SDK refactor of
Phase B (cf. ADR-024) lands, we want the API design pinned down so
that the type-safety chain, the SDK conventions, and the future API
surface are co-designed — not retrofitted later under pressure.

The core tensions the API design must resolve:

1. **Data evolves continuously** in `/data/schemas/` and `/data/universes/`
   (ADR-023 added six vocabularies in one PR; ADR-020 ships new
   entity types; future contributors will keep doing this).
   **API contracts must stay stable** for committed versions — third
   parties pin to a version and expect it to work for months.
2. **Anti-spoiler invariant** is non-negotiable: the API cannot leak
   facts beyond the consumer's stated progression. Client-side
   filtering disqualified by design.
3. **TypeScript SDK ergonomics** want camelCase; the on-disk data
   model and REST industry standard want snake_case. A single
   "canonical" naming convention forced on every surface loses one
   side.

**Options considered**:

1. **No versioning — single API surface that follows the data.** Every
   schema change is a potential breaking change. Disqualified: makes
   third-party integration practically impossible.

2. **Major-only versioning, `/api/v1/`, `/v2/`, …** Each major freezes
   the wire format. Simple but every additive change costs a major
   bump and a 12-month deprecation cycle. Too rigid for a wiki where
   schema-additive changes happen monthly.

3. **Full semver `MAJOR.MINOR.PATCH`, URL carries MAJOR only,
   `MINOR.PATCH` in headers + archived OpenAPI snapshots.** Matches
   industry standard (GitHub, Stripe, Twilio). Allows additive growth
   without breaking pinned clients. **Chosen.**

4. **GraphQL.** Powerful query model but cache-hostile, DoS surface,
   resolver complexity. Deferred — REST first, GraphQL evaluated
   when concrete consumer demand surfaces.

**Choice**: Full semver REST API with **versioned wire-format
adapters** as the architectural primitive.

Key design tenets (full detail in `/docs/PUBLIC_API_DESIGN.md`):

- **URL prefix = MAJOR only.** `/api/v1/`, `/api/v2/`. MINOR and
  PATCH live in `X-API-Version` response headers and in archived
  OpenAPI snapshots under `docs/api-versions/v1/openapi-1.4.2.json`
  etc.
- **One `packages/api-vN/` package per active MAJOR.** Each package
  pins the wire-format at its release date and translates the
  current data into that frozen shape. Append-only within a major
  (new optional fields ok, removals require a new major).
- **Four drift strategies** for handling data changes against a
  pinned adapter: `ignore` (new field invisible to v1), `alias`
  (rename projected through), `freeze` (deprecated field returns
  sentinel + `Warning` header), `hard fail` (PR blocked until human
  decision).
- **Impact analyzer** (`bun run api:impact`, pre-commit + CI) diffs
  schema changes against every active adapter and classifies impact.
  Breaking changes without resolution block the PR. This is the
  mechanism that converts "fear of breaking the API" into mechanical
  verification.
- **Two-major-live policy.** At any time only `current` and
  `previous` MAJOR are served. Older majors are sunsetted with 18
  months notice via RFC 8594 `Sunset` headers. Caps maintenance at
  two adapter packages.
- **Wire format vs SDK convention split** (resolves tension #3):
  - **Wire (REST)**: `snake_case` for meta keys + immutable IDs for
    properties/qualifiers/vocab values. Mirrors on-disk JSON and
    SQLite columns. Matches REST industry standard.
  - **TypeScript SDK**: `camelCase` for meta keys + immutable IDs
    for properties/qualifiers/vocab values. Generated alongside the
    snake_case Zod schemas of ADR-024 Phase A.
  - The SDK exposes the same camelCase API whether backed by
    SQLite (`createClient`) or HTTP (`createHttpClient`).
- **Translations resolved server-side** when `?lang=` is supplied.
  Both `value_key` and resolved `value` are returned, side by side,
  so clients can debug missing translations and re-render on locale
  switch without refetch.
- **OpenAPI auto-generated** from the same schema-engine generator
  (extension of ADR-024 Phase A). Snapshot archived per MINOR. Lint
  in CI with Spectral. Round-trip test: generated client must
  compile against a real running API.

**Rationale**:

- The adapter pattern lets data and API evolve at independent
  cadences. Maintainers can ship `/data/schemas/` changes without
  thinking about API semantics most of the time (the analyzer flags
  the cases where they must).
- Two-major-live policy bounds maintenance burden. Without it, a
  long-lived API accumulates versions indefinitely.
- The wire/SDK convention split eliminates a class of mistakes
  (`entity_id` vs `entityId`) at the boundary that matters (the
  consumer's code) without compromising the on-disk model.
- Resolving translations server-side cuts the consumer's job in
  half — they don't need to ship the translation catalogue, just
  call the API with `?lang=fr`.

**Consequences if/when implemented**:

- New workspace `apps/api` (or routes group inside
  `apps/dashboard`, to decide at Phase 1 of implementation).
- New workspace `packages/api-v1/` containing the first frozen wire
  format. Adapters live as TS code, not declarative config (to
  reconsider after experience).
- New script `bun run api:impact`, wired into lefthook pre-commit
  and CI.
- New CI gate: PRs touching `packages/api-v*/src/` must update
  `packages/api-v*/CHANGELOG.md`.
- New doc `/docs/PUBLIC_API_DESIGN.md` — the design reference (this
  ADR's companion).
- ROADMAP entry replacing the "Public API" line in Phase 8+ with a
  proper deferred phase.
- Phase B of ADR-024 (typed SDK) becomes a hard dependency — the
  API serializers cannot be implemented cleanly against the current
  `Record<string, unknown>` SDK surface.
- 14 open questions remain (cf. `/docs/PUBLIC_API_DESIGN.md` §
  "Open questions"). They must be answered before phase 1
  implementation can start.

**Implementation guard**: this ADR is design-only. No code in this
PR. Before any `packages/api-*` package is created, a new ADR will
ratify the answers to the open questions and the choice of
integration branch.

---

## ADR-024 — End-to-end type-safe SDK from generated Zod schemas

**Date**: 2026-05-19

**Context**: The schema → SQLite → SDK chain validates aggressively at
the **write** boundary (every JSON file in `/data/universes/**` is run
through a Zod schema synthesised at runtime by
`packages/schema-engine/src/entity-loader.ts`). But at the **read**
boundary the type system collapses: the SDK in
`packages/sdk/src/client.ts` returns `Record<string, unknown>` for
`EntityRecord.data`, `PropertyRecord.value`, and
`RelationRecord.qualifiers`. Consequence: `apps/dashboard/src/api.ts`
and `apps/preview/views.ts` re-extract every property field by name
with zero compile-time safety, violating CLAUDE.md's "no property name
is hardcoded in application code" rule in spirit (the names are
hardcoded — they're just not checked).

The information needed to type the read side already exists in
`/data/schemas/**.json`. It just isn't propagated. Before building the
public wiki app (Phase 6+), the chain needs to be closed so app code
gets `data.bounty[0].value: number` instead of casting.

**Options considered**:

1. **Re-validate at read with the runtime mapper.** Reuse
   `buildEntitySchema(typeId, catalogue)` in the SDK, call `.parse()`
   on every row. Safe but pays the Zod cost on every read, and forces
   the public app to ship the meta-validator + the entire schema
   catalogue at runtime. Inconsistent with Architecture invariant #3
   ("performance at read time" via build-time precomputation).

2. **Hand-author types per entity type.** Cheapest implementation, but
   guarantees drift the first time a property is added without a code
   change. Violates the "schemas are data, not code" invariant.

3. **Generate static Zod schemas at build time, derive types via
   `z.infer`.** Schema-engine already emits ID arrays under
   `packages/schemas/generated/`; extend it to emit one Zod object per
   property-type, entity-type, and vocabulary. The SDK and apps `import
   type` from the generated files — zero runtime cost. The same Zod
   schemas remain available as runtime values for the dashboard's RHF
   form resolvers and for opt-in integration tests. **Chosen.**

**Choice**: Phase A of a three-phase refactor (Phases B and C deferred
to follow-up ADRs once Phase A lands and proves itself).

Phase A delivers the generator changes only — no SDK surface change
yet. It establishes the type vocabulary that Phase B will consume:

- New branded primitive `IsoDate` in
  `packages/schemas/src/primitives.ts` (regex `YYYY-MM-DD`, valid
  surface ranges). All `value_type: 'date'` property entries map to
  this brand at both compile time (the generator) and runtime
  (`entity-loader.ts:valueSchemaFor` switched from `z.string()` to
  `IsoDate`).
- New emitted file `packages/schemas/generated/vocabularies.ts` — one
  Zod enum per vocabulary file (`BloodTypesEnum`, `NameTypesEnum`, …)
  plus a `VocabularyValues` index keyed by vocabulary id and a
  `VocabularyValueOf<V>` generic.
- New emitted file `packages/schemas/generated/property-values.ts` —
  one Zod schema per property-type covering a single historisable
  entry (`BountyEntry`, `NameEntry`, …). Localizable property-types
  use `value_key: I18nKey`; others use `value: <typed>`. Universal
  qualifiers (`since`, `until`, `source`, `epistemic_status`,
  `event`, …) are flattened on the entry to mirror the on-disk
  shape. Property-specific qualifiers from `allowed_qualifiers` are
  added with the right enum/ref typing.
- New emitted file `packages/schemas/generated/entities.ts` — one Zod
  schema per entity-type covering the full on-disk JSON
  (`CharacterData`, `DevilFruitData`, …) plus an `EntityDataSchemas`
  index, an `EntityTypeId` union, and a discriminated `EntityDataMap`
  keyed by the entity-type id (matching `SDK.EntityRecord.type`).
- Relations stay generically typed at the entity level
  (`qualifiers: z.record(z.string(), z.unknown())`). A per-relation
  qualifier file is deferred to Phase B — adding 68 discriminated
  union branches to every entity blew up IDE perf in early
  experiments for very little gain. Narrowing happens at the call
  site instead.

The new printers live under
`packages/schema-engine/src/printers/` (one file per output) and share
a `value-type-to-zod.ts` helper that maps `ValueType` + constraints
to a Zod expression printed as a TypeScript source string. The
runtime mapper in `entity-loader.ts` stays in lockstep — both honour
`date → IsoDate` and the same enum-ref Pascal-casing.

**Rationale**:

- The emitted files are pure Zod, so `z.infer` gives types for free
  and the same schemas are reusable for dashboard form validation
  (RHF + `@hookform/resolvers/zod`) without re-authoring shapes.
- Types-only imports erase at compile time, so the public app pays
  zero runtime cost for type safety. The dashboard pays the Zod cost
  it would have paid anyway for form validation.
- The discriminated `EntityDataMap.type` literal (`z.literal('character')`,
  etc.) means a URL param of type `string` narrows naturally with
  `if (entity.type === 'character')` — no custom helper needed.
- Generated files stay git-ignored (already configured in
  `.gitignore`), matching the existing `generated/index.ts` policy.
  CI runs `bun run schema:generate` before typecheck.

**Phase B** (deferred, separate ADR): refactor the SDK to be generic
over `EntityTypeId`, return discriminated `EntityRecord` unions, and
migrate `apps/dashboard/src/api.ts` + `apps/preview/views.ts` to
typed access. Adds an integration test that loads a built `.db` and
asserts `client.getEntity<'character'>('character:luffy').data.bounty?.[0].value`
is `number` at compile time.

**Phase C** (deferred, separate ADR): emit a build-time schema hash
into a `meta` table in SQLite and into a `GENERATED_SCHEMA_HASH`
constant; SDK exposes `client.schemaHash` and an `assertCompatibleWith`
helper so apps fail fast on artefact/code drift instead of silently
returning malformed rows.

**Consequences**:

- Three new emitted files under `packages/schemas/generated/`
  (vocabularies.ts, property-values.ts, entities.ts). Existing
  `index.ts` extended to re-export them. All git-ignored.
- New branded `IsoDate` primitive exported from
  `@onepiece-wiki/schemas`. All four `value_type: "date"` properties
  (`aired_at_jp`, `publications`, `published_at_jp`,
  `released_at_jp`) now reject malformed dates; verified existing
  data is already `YYYY-MM-DD`.
- `entity-loader.ts` switched `date` runtime mapping from `z.string()`
  to `IsoDate` (in lockstep with the printer).
- Two new test files in `packages/schema-engine/__tests__/`: unit
  tests for the value-type printer and a generator smoke test that
  imports the emitted files and asserts a representative
  `BountyEntry` and `CharacterData` round-trip.
- All 11 packages typecheck clean; `bun test packages/sdk` (8 tests)
  and `bun test packages/schema-engine` (11 tests) pass; lint clean.
- No SDK consumer change in this ADR — the new files are not
  imported anywhere yet. Phase B will hook them in.

---

## ADR-023 — Audit + close every reasonable `string` qualifier as an enum

**Date**: 2026-05-17

**Context**: ADR-022 spotted that the `participant` relation's
qualifiers were declared as `value_type: "string"`, defaulting them
to a useless free-text input. A sweep of every other schema file
turned up the same anti-pattern on six more sites — all with
closed-set semantics (blood type, family relation kind, depiction
period, arc role, adaptation coverage, image source origin) that
should never have been free strings.

**Audit result** (each row = one schema upgrade):

| Schema                               | Field                     | Old `value_type` | New  | Vocabulary                                                      |
| ------------------------------------ | ------------------------- | ---------------- | ---- | --------------------------------------------------------------- |
| `property-types/blood_type`          | value                     | string + regex   | enum | `blood-types`                                                   |
| `property-types/source_origin`       | value                     | string           | enum | `source-origins`                                                |
| `relation-types/family-of`           | `relation_kind`           | string           | enum | `family-relations`                                              |
| `relation-types/features-characters` | `role`                    | string           | enum | `arc-roles`                                                     |
| `relation-types/adapts`              | `coverage`                | string           | enum | `adaptation-coverage`                                           |
| `relation-types/depicted-by`         | `period`                  | string           | enum | `depiction-periods`                                             |
| `relation-types/participated-in`     | `side`, `role`, `outcome` | string           | enum | reuse `event-sides`/`event-roles`/`event-outcomes` from ADR-022 |

`participated-in` is the inverse direction of `participant` (same
event-participation semantics) — reusing the ADR-022 vocabularies
keeps the value space consistent across both directions.

**Choice**: promote all seven sites; create six new vocabularies
(the seventh row is a vocab reuse). All values have FR + EN labels.

**Rationale**: same as ADR-022, scaled across the whole catalogue.
Closed enums give the dashboard a dropdown, gate-keep typos at
validation, and make the value space discoverable to contributors
who don't know what other PRs have already chosen as the canonical
spelling.

**Deliberately left as string** (after audit):

- `attribution`, `director`, `url`, `volume` — legitimately freeform
  (proper nouns, URLs, free text).
- `birthday` — keeps its regex constraint (`MM-DD`); an enum of 366
  values would be wrong.
- `depicted-by.context`, `name.context`, `epithet.context` —
  freeform narrative ("during the Marineford speech"); not enum-able.
- `clarifies-fact.property_name` — points at a property id in the
  schema registry, not a vocabulary value. An enum here would force
  manual sync every time a property is added/removed; better solved
  by a future autocomplete UI than by a vocabulary.
- `canonical_elements` — ambiguous semantics (no existing data, no
  doc), deferred until the field's contract is settled.

**Consequences**:

- Six new vocabulary files under `data/schemas/vocabulary/`
  (blood-types, source-origins, family-relations, arc-roles,
  adaptation-coverage, depiction-periods).
- Seven schema files modified (two properties, five relations).
- `blood_type`'s `schema_version` bumped 2 → 3, `source_origin`'s
  bumped 1 → 2 (semantic change to `value_type`).
- One existing data value already matched its new enum
  (`relation_kind: "sworn_brother"`); no other migration needed.
- `bun run validate` passes (30 entities still green).
- `bun run schema:check`: 30 → 36 vocabularies.

---

## ADR-022 — Close `participant` qualifiers as enums

**Date**: 2026-05-17

**Context**: The `participant` relation type (event → character/crew)
declared its three qualifiers — `role`, `side`, `outcome` — as
`value_type: "string"`, so the dashboard rendered them as plain text
inputs. Contributors had no autocomplete, no validation, and no
guidance on what values were already in use across the corpus. In
practice the existing data already used a closed-ish vocabulary:
`rescuer`, `survived`, `subject`, `awakened`, `captive`, `killed`
plus one inconsistency (`whitebeard-allies` with a hyphen vs.
snake_case everywhere else).

**Choice**: Promote the three qualifiers to `value_type: "enum"`
backed by three new vocabularies under
`data/schemas/vocabulary/`:

- `event-roles` (subject, combatant, rescuer, captive, …)
- `event-sides` (marines, whitebeard_allies, shichibukai, …)
- `event-outcomes` (survived, killed, awakened, captured, …)

Existing data migrated: `whitebeard-allies` → `whitebeard_allies`
to match the snake_case enum convention used by every other
vocabulary in the catalogue.

**Rationale**: free-string qualifiers don't scale — every
contributor invents their own term and the data becomes
ungroupable. Closed enums give the dashboard a dropdown (with
French + English labels), let the schema flag typos at validation,
and keep the value space discoverable. The 15–18 values per
vocabulary cover every existing usage with room for the next few
arcs without further schema changes.

**Consequences**:

- Three new files under `data/schemas/vocabulary/`.
- `data/schemas/relation-types/participant.json` switches qualifier
  `value_type` from `string` to `enum` + adds `enum_ref`.
- `data/.../entities/event/battle-of-marineford.json` gets a one-character
  data migration (hyphen → underscore).
- `bun run validate` passes (30 entities still green).
- **Open question for later**: `side: "captive"` is semantically more
  of a role than a side. The current data shape is preserved, but a
  follow-up could re-classify Ace as
  `side: whitebeard_pirates, role: captive`. Out of scope here.

---

## ADR-021 — Bulk per-source cast saves (one PR, many entity files)

**Date**: 2026-05-17

**Context**: The apparitions hub (per-source cast manager at
`/sources/$type/$slug`) lets a contributor add/remove N characters
from a single chapter, episode, film, etc. The natural unit of edit
is the **source**, but the actual mutations land on N separate
character (/devil-fruit/crew/…) entity files — each gains, loses, or
re-qualifies an `appears-in` relation. Every existing save flow in
`packages/github-client` keys the PR off a single entity (`Edit
character:luffy` → one entity's files in one PR). Reusing that flow
N times would open N parallel PRs for what the contributor sees as
one action.

**Options**:

- A — **Loop `submitEntityEdit` once per touched entity.** N PRs per
  cast change. Trivial to ship, terrible to review (mass of PRs all
  titled differently, no grouping).
- B — **Single PR, single commit, source-titled** — extend
  `commitMultipleFiles` (already used for entity + translations) to
  carry N _independent_ entity files in one commit, then open one PR
  titled `[DATA] Update cast of <sourceId>`.
- C — **Server-side queue that batches per source per N seconds** and
  opens one PR per batch. Solves the problem but adds a stateful
  worker — incompatible with our stateless-functions deployment model.

**Choice**: B.

**Rationale**:

- The Git Data API path (`commitMultipleFiles`) already handles
  N-file commits cleanly — same blob/tree/commit dance, just N
  blob entries instead of two. No new primitive.
- PR title reflects the contributor's mental model ("I changed
  Chapter 1's cast"), not the storage model ("I touched 5 character
  files"). Reviewer sees the cast change as a unit.
- Optimistic-lock check generalises naturally: per-file SHA check
  before commit, surface all conflicting paths in a 409 so the UI
  can prompt "reload the cast page".

**Consequences**:

- New flow `submitSourceCastEdit` in `packages/github-client/src/
  save-flow.ts` — branch `cast/<source-id>/<ts>`, message `Update
  cast of <sourceId>`, PR title `[DATA] Update cast of <sourceId>`,
  body lists each touched entity + diff blocks (reusing
  `renderDiffBlock`). Adds new label `apparitions` alongside `edit`
  / `via-dashboard` / `area:data`.
- New server endpoints in `apps/dashboard/api/server.ts`:
  - `GET /api/sources/:type/:slug/cast` — reverse-scan the in-memory
    catalogue for `appears-in` relations targeting this source,
    return grouped by entity type.
  - `POST /api/sources/:type/:slug/cast` — bulk apply
    `{add: [...], remove: [...]}` against the catalogue snapshot,
    validate every resulting entity, hand the file list to
    `submitSourceCastEdit`.
- **Deferred for v1**: resume-PR for cast saves (each save opens a
  fresh PR). The existing `findOpenPRForEntity` is keyed by
  `entityId` and won't match a source-titled PR. Acceptable —
  apparitions edits are typically one-shot ("I just watched the
  episode; here's everyone in it") rather than incremental.
- **Conflict UX**: if 2 contributors edit the same cast and their
  diffs touch the same character file, the 2nd save returns a 409
  citing the conflicting paths. The UI surfaces a toast + a
  "Refresh cast" affordance. Same SHA-based primitive as
  `OptimisticLockError`, just plural.

---

## ADR-020 — Entity creation from the dashboard

**Date**: 2026-05-17

**Context**: Phase 4's roadmap line item #3 listed a `/types/:type/
new` route from the start, but it was never wired — the dashboard
today only edits entities that already exist on disk. Adding a new
character means hand-writing the JSON file and committing as a
maintainer, which blocks every contribution scenario that isn't an
edit of something extant.

The flow is mechanically close to entity edit (same form, same
schema validation, same PR-via-`submitEntityEdit` pipeline) except
for two new wrinkles: the file doesn't exist yet (no `expectedSha`),
and the slug must be validated for both format and uniqueness
**before** the PR is opened.

**Options**:

- A — **Treat creation as a special form of edit** with
  `expectedSha: null` and rely on the existing `submitEntityEdit`
  to do the right thing on a missing file. Slug uniqueness checked
  server-side against the in-memory catalogue snapshot before the
  Git Data API write.
- B — **Dedicated `createEntity` server flow** (separate PR title,
  separate label) so review tooling can filter "new" vs "edit"
  contributions distinctly.

**Choice**: A with a label refinement.

**Rationale**:

- `submitEntityEdit` already handles the "file doesn't exist"
  branch correctly — `getFile` returns null on 404, the
  `expectedSha !== null` guard short-circuits, `commitMultipleFiles`
  uses the Git Data API which creates blobs/trees unconditionally.
  No `packages/github-client` changes required.
- A second label `new-entity` (alongside `edit`, `via-dashboard`,
  `area:data`) gives review tooling the discrimination capability
  without forking the save path. Reviewers can also distinguish via
  the PR title (`[DATA] Create character:foo` vs `[DATA] Edit
  character:foo`).

**Consequences**:

- New endpoint `POST /api/entities/:type` in `apps/dashboard/api/
  server.ts`. Body shape mirrors `PUT /api/entities/:id`'s `payload`
  - `translations`, plus an explicit `slug` field. Validation:
  * kebab-case via `SlugSchema`
  * uniqueness via in-memory snapshot scan
  * data shape via `buildEntitySchema(type, …).safeParse`
- `submitEntityEdit` called with `expectedSha: null` and a new
  optional `commitVerb: 'Create' | 'Edit'` so the PR title reads
  `[DATA] Create character:foo` rather than `[DATA] Edit
  character:foo`. Label `new-entity` added when verb is `Create`.
- New route `apps/dashboard/src/routes/types.$type.new.tsx` —
  wraps `EntityForm` with blank initial state + new `SlugInput`
  component (live regex + uniqueness check via TanStack Query).
- "+ New" button on `types.$type.index.tsx` next to the table-view
  link. Mobile-friendly per the same primitives as the rest of the
  contribution surface (`MobileSheet`-aware, ≥44px touch target).
- **Catalogue snapshot lag** (per ADR-019): the new entity won't
  appear in the dashboard's bundled data source until Vercel
  rebuilds. After PR opens, the UI surfaces a banner — "Your entity
  is in PR #N; it'll appear in the catalogue after merge + deploy"
  — instead of redirecting blindly to `/types/$type/$slug` (which
  would 404 until the next deploy).
- **Slug-conflict-with-open-PR** (rare): the snapshot is built from
  `main`, so a slug claimed by an in-flight PR but not merged yet
  won't fail the uniqueness check. The Git Data API write will
  succeed (different branch), but the second contributor's PR will
  conflict on merge with a clear file-already-exists error.
  Acceptable for v1 — no silent corruption, just a merge prompt.

---

## ADR-019 — Bundle `/data` into the dashboard SSR output for serverless deploys

**Date**: 2026-05-17

**Context**: ADR-018 migrated the dashboard to TanStack Start +
Nitro, producing a `.output/server/index.mjs` Node bundle that
runs on Vercel. First deploy attempt crashed: the API handler
calls `loadSchemas()` / `loadEntities()` from `@onepiece-wiki/
schema-engine`, which `node:fs.readdir` and `node:fs.readFile`
the `data/universes/**/*.json` tree at runtime. Vercel serverless
functions don't have access to repo source files — the bundler
only ships what's imported.

Side effect at module init: the dashboard's `apps/dashboard/api/
server.ts` was also calling `loadConfig()` eagerly which tried to
read a `.pem` file from disk. Same root cause — fs-based config
on a no-fs platform.

**Options**:

- A — **Bundle `data/` as static assets and read via HTTP at
  runtime** through Nitro's `publicAssets`. Adds a network hop
  per read and exposes the raw JSONs publicly. Wrong shape for
  a private editing tool.
- B — **Fetch from GitHub at runtime** via Octokit's
  `repos.getContent`. Adds latency + rate-limit risk for every
  page load. Defeats the "snapshot of main" model.
- C — **Bundle `data/` into the SSR JS** via Vite's
  `import.meta.glob('../../../data/**/*.json', {eager:true,
  query:'?raw'})`, then feed the resulting in-memory map to a
  custom `DataSource` adapter. The schema-engine's loaders read
  from that source instead of `node:fs`. Each Vercel function
  carries its own copy of the data tree, refreshed on every
  deploy.

**Choice**: C.

**Rationale**:

- **Read-only data on the dashboard side.** Every dashboard read
  (schemas, entity lists, single entities, translations) is a
  snapshot of `main`. Writes always go through GitHub PRs, never
  touch the local filesystem. So a snapshot-on-deploy model is
  semantically correct — no live writes to miss.
- **Vite already compiles + bundles JS for the SSR output.**
  Adding ~few hundred KB of JSON to that bundle (gzipped) is
  cheap compared to the ~700KB of `@aws-sdk/client-s3` already
  shipping in the same bundle.
- **One-line conditional in the dashboard** (`PROD ? bundle :
  fs`). Schema-engine consumers outside the dashboard (CLI,
  build pipeline) keep using the fs default unchanged.
- **No new dependency.** `import.meta.glob` is built into Vite,
  `inMemoryDataSource` is ~40 lines in `schema-engine`.

**Consequences**:

- New file `packages/schema-engine/src/data-source.ts` exports:
  - `DataSource` interface (`listJsonFiles`, `readTextFile`,
    `listSubdirectories` — the subset of `node:fs/promises` the
    loaders actually call).
  - `fsDataSource` — default implementation reading from the
    real filesystem. Preserves the original behaviour for every
    CLI and the build pipeline.
  - `inMemoryDataSource(files: Record<absPath, string>)` —
    builds a source from a pre-loaded path-to-content map.
    Used by the dashboard's Vite-glob path.
- `loadSchemas` and `loadEntities` gain an optional `source:
  DataSource = fsDataSource` parameter. Backward compatible —
  every existing call still works.
- New file `apps/dashboard/api/data-source.ts` exports
  `dashboardDataSource`, picked at module load:
  - `import.meta.env.PROD === true` → calls `import.meta.glob`,
    normalises the relative keys back to absolute REPO_ROOT
    paths, wraps in `inMemoryDataSource`.
  - Otherwise → `fsDataSource` (dev + legacy `bun api/server.ts`
    standalone).
- `apps/dashboard/api/server.ts` passes `dashboardDataSource` to
  both `loadSchemas` and `loadEntities`, and uses
  `dashboardDataSource.readTextFile` for translation lookups
  (the only direct `node:fs.readFile` call left in the file).
  `node:fs/promises` import dropped entirely.
- `vite.config.ts` picks the Nitro preset via env: `vercel`
  when `VERCEL` is set (Vercel always sets it on build), else
  `node-server` for local + VPS. `NITRO_PRESET` env overrides
  both.
- `vercel.json` at the repo root: `buildCommand=bun install &&
  bun run -F @onepiece-wiki/dashboard build`,
  `outputDirectory=apps/dashboard/.output`, `framework=null`
  (we use Vercel's Build Output API v3 via Nitro, no
  framework auto-detect).
- `.env.example` documents the
  `GITHUB_APP_PRIVATE_KEY_PATH` (local) vs
  `GITHUB_APP_PRIVATE_KEY` (inline, Vercel) split. The loader
  already supported the inline form; the comment makes the
  Vercel path discoverable.

**Refresh model**: any edit merged to `main` on the data repo
re-triggers Vercel's build → new SSR bundle → new in-memory
data snapshot. Latency from "PR merged" to "dashboard updated"
is whatever the Vercel build takes (~30s for the first build,
faster on subsequent if Turbo cache hits).

**What this ADR doesn't unblock yet**: the GitHub App webhook
(if/when we wire one) needs a stable HTTPS endpoint — which
Vercel provides — but the webhook handler isn't built yet.
Tracked in ROADMAP Phase 7+.

---

## ADR-018 — Migrate dashboard from Vite + standalone Bun API to TanStack Start

**Date**: 2026-05-17

**Context**: The dashboard had drifted from the stack declared in
CLAUDE.md ("Web framework: TanStack Start") to a Vite-SPA + sidecar
Bun process. Two consequences:

- **Vercel deploys broken.** Vite emits static files; the Bun API
  process has no host in a Vercel project. Hitting `/api/*` on a
  deployed build returned 404 because the SPA fallback shipped
  HTML for routes the SPA didn't know about.
- **Two dev processes.** `concurrently` ran `vite` + `bun --hot
  api/server.ts` in parallel, with a Vite proxy mapping `/api/*`
  to `127.0.0.1:4101`. If either crashed the other limped along,
  and on Windows the IPv4/IPv6 resolution of `localhost`
  occasionally broke the proxy silently.

The user explicitly asked to "migrate to option B" (TanStack Start)
to unblock Vercel deployment and re-align with the stated stack.

**Options**:

- A — **Server functions (`createServerFn`).** Convert every
  `/api/*` handler into a TanStack Start server function called
  from React via RPC. Removes the HTTP boundary; `api.ts`'s
  `fetch('/api/foo')` calls become `myServerFn({data})`. Refactor
  touches every endpoint + every caller.
- B — **Server routes (`createFileRoute('/api/foo')({server:
  {handlers: {GET, POST}}})`).** File-based HTTP handlers
  alongside UI routes. The frontend keeps using `fetch('/api/foo')`
  unchanged. Refactor is one catch-all file + auto-generation
  wiring; everything else moves.
- C — Drop Start entirely, keep two hosts (Vite on Vercel + Bun
  somewhere else). Cheap deploy, eternal dual-stack maintenance.

**Choice**: B (server routes), with a minimal-diff approach: a
single catch-all `src/routes/api/$.ts` that forwards every
`/api/*` request to the existing `handleApiRequest` export of
`apps/dashboard/api/server.ts`. ~15 endpoints stay in one file
with shared rate-limit map, session guards and admin checks; only
the entrypoint changed.

**Rationale**:

- Matches the docs at
  https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
  verbatim. The official `examples/react/start-basic` template uses
  the same `tanstackStart() + nitro()` pair and the same
  `createFileRoute(...)({server:{handlers}})` pattern we now have.
- Preserves the HTTP frontier (curlable endpoints, clean separation
  between API contract and UI code) that Option A would have
  dissolved.
- Auto-generated `routeTree.gen.ts` carries the type augmentation
  that makes `server: {handlers}` a valid option on
  `createFileRoute` — the hand-maintained tree we had pre-migration
  was the reason an initial attempt at this migration typechecked
  as "server does not exist". Letting the plugin own the file
  unblocks the API.
- Nitro produces a Vercel-compatible `.output/` bundle out of the
  box; `bun run build` then `node .output/server/index.mjs` runs
  the SSR + API server with zero per-platform configuration.

**Consequences**:

- New deps: `@tanstack/react-start@^1.168`, `nitro@^3` (devDep).
  Bumped `@tanstack/react-router` to ^1.170.
- New plugins in `vite.config.ts`: `tanstackStart({ srcDirectory:
  'src' })` and `nitro()`. Order matters: `tailwindcss` →
  `tanstackStart` → `react` → `nitro` (mirrors the official
  template).
- Scripts collapsed: `dev` is now `vite dev` (no more
  `concurrently`); `build` is `vite build` (emits SPA + Nitro
  server bundle); `start` is `node .output/server/index.mjs`.
- Files removed: `apps/dashboard/index.html`, `src/main.tsx`,
  the hand-maintained `src/routeTree.gen.ts`. The plugin
  regenerates `routeTree.gen.ts` on every save under `src/routes/`.
- Files added:
  - `src/router.tsx` exporting `getRouter()` (Start hook).
  - `src/routes/api/$.ts` — splat catch-all whose `server.handlers`
    forward every method to `handleApiRequest`.
  - `__root.tsx` now uses `shellComponent: RootDocument` returning
    a full `<html>`/`<body>`; the original app chrome moves into
    an `AppChrome` child that takes `children` (the matched route's
    output).
- `api/server.ts` refactored: the inner `Bun.serve({ fetch })`
  body is now the exported `handleApiRequest(req)`. The standalone
  `Bun.serve` is gated on `import.meta.main` so `bun api/server.ts`
  still works for debug scripts.
- Cross-runtime fix: `import.meta.dir` (Bun-only) → a `HERE`
  helper that prefers `import.meta.dirname` then falls back to
  `fileURLToPath(import.meta.url)`. Without this fix, the Nitro
  SSR bundle blew up at import time with "paths[0] must be a
  string" because Node doesn't populate `import.meta.dir`.
- Backwards-compat tax: `dev:api-legacy` script kept around for
  anyone who still wants `bun --hot api/server.ts` standalone.

**Vercel deploy — caveat that didn't ship in this ADR**: the
SSR-bundled server reads `data/universes/**/entities/*.json` at
runtime via `node:fs/promises`. Vercel serverless functions don't
share a filesystem with the build artefact, so the entity JSONs
need to either be (a) bundled into the function output, (b)
fetched from GitHub at runtime, or (c) replaced by the pre-built
SQLite from the data pipeline. Out of scope for this ADR; tracked
in `/IDEAS.md` for now.

**SPA-only routes**: setting `defaultSsr: false` on the router is
NOT supported in the installed Start version (option doesn't exist
on `RouterConstructorOptions`). The dashboard renders SSR by
default; pages that depend on browser-only globals (`window`,
`localStorage`, `BroadcastChannel`) already guard with
`typeof window !== 'undefined'` checks and `useEffect`-deferred
access, so SSR works without further changes.

---

## ADR-017 — Revert better-auth, keep stateless signed-cookie sessions

**Date**: 2026-05-16

**Context**: ADR-016 adopted `better-auth` (with its `anonymous`
plugin + `github` social provider) and a SQLite session store at
`apps/dashboard/.auth.db`. Within hours of shipping that, we
realised the cost / benefit didn't actually work out for our shape:

- **What better-auth gives us that we use**: stable identity in the
  cookie + `anonymous` plugin convenience. That's it.
- **What better-auth gives us that we don't use**: server-side
  session revocation (we have BLOCKED_GITHUB_USERNAMES instead),
  multi-device session sync (no UI), refresh token management (we
  don't call the user's GitHub token — writes go through the App
  installation), `linkAccount` anonymous→GitHub upgrade
  (not asked for), `/api/auth/get-session` exposed user shape
  (we override with our own projection anyway).
- **What better-auth costs us**: a new dependency (~70 transitive
  packages), a SQLite runtime DB the dashboard now needs to
  provision + migrate (`bun run auth:migrate`), and — critically —
  **incompatibility with Vercel-serverless deployment** without
  swapping the adapter to Turso / Neon / Vercel Postgres.

The user explicitly questioned the DB requirement. After confirming
that better-auth has no stateless mode — every adapter persists
user/session/account rows, and the `jwt()` plugin is additive rather
than a replacement — we decided the trade-off no longer made sense
for a hobby wiki.

**Options**:

- A — Keep better-auth and accept the SQLite/Turso requirement at
  deploy time. Pay the dependency cost now to keep flexibility for
  features we might want later (account linking, multi-device,
  refresh-token-using OAuth).
- B — Revert to hand-rolled signed-cookie sessions, extended with a
  discriminated union (`kind: 'github' | 'anonymous'`) so the
  anonymous flow doesn't need a separate code path.

**Choice**: B. Revert.

**Rationale**:

- Every user-facing feature shipped under ADR-016 (login page,
  contributions panel, Contributors PR body, server-side identity,
  drop Co-authored-by) keeps working unchanged — they were
  features of OUR code, not of better-auth.
- The stateless cookie carries `{kind, login|nickname, expiresAt}`,
  HMAC-signed with `SESSION_SECRET`. That's the entire session
  layer. ~150 lines in `session.ts`, ~80 lines of OAuth glue in
  `server.ts`.
- No runtime DB to provision. Deploys to Vercel serverless with no
  changes; deploys to a single Bun process on a VPS with no
  changes; no schema migrations to manage.
- The features better-auth enables that we sacrifice (revocation,
  multi-device, account linking) we don't ship anyway. When/if we
  ever need them, we can re-adopt better-auth — the codebase
  already knows that shape.

**Consequences**:

- Dependency `better-auth` removed; `@octokit/auth-oauth-user`
  restored on `packages/github-client` (powers `exchangeCode`).
- `apps/dashboard/api/session.ts` is back, rewritten with:
  - Discriminated union `Session = github | anonymous`
  - `base64url` encoding (RFC-clean, no `+` / `/` to URL-encode in cookies)
  - `timingSafeEqual` for signature comparison
  - Production assert: `SESSION_SECRET` is mandatory in
    `NODE_ENV=production`
  - 30-day TTL (was 8h) so a sporadic contributor finds their open
    contributions on return
- `apps/dashboard/api/auth.ts` is now ~20 lines: a re-export of
  `Session` as `DashboardSession` + the `readDashboardSession(req)`
  cookie reader. The route handlers never see the cookie format.
- New endpoints in `server.ts` (under `/api/auth/*`):
  - `GET  /api/auth/login/github` (302 to GitHub)
  - `GET  /api/auth/callback/github` (exchange + cookie + 302 home)
  - `POST /api/auth/anonymous` (validate pseudo + cookie)
  - `POST /api/auth/sign-out` (clear cookie)
  - `GET  /api/auth/me` (projection)
- Env var rename: `BETTER_AUTH_SECRET` → `SESSION_SECRET`.
  Anyone who set the better-auth one needs to rename it (a one-line
  update in `.env.local`).
- `apps/dashboard/.auth.db*` removed from `.gitignore` (no DB to
  ignore anymore).
- ADR-016 stays in the log for historical reference; this entry
  supersedes it.

---

## ADR-016 — Adopt better-auth; drop hand-rolled session + Co-authored-by trailer

**Date**: 2026-05-16

**Context**: ADR-015 opened writes to unauthenticated visitors via a
self-chosen pseudo passed in the save body. That worked but had two
gaps:

1. **No persistent identity across visits.** The pseudo was only a
   field on each request, so a returning contributor couldn't see
   "their" in-progress PRs without re-typing the exact same pseudo and
   the dashboard couldn't pre-fill anything from a prior session.
2. **Two auth code paths**, neither fully baked: a hand-rolled
   signed-cookie session (`apps/dashboard/api/session.ts`) for GitHub
   logins, and the bare-pseudo-in-body path for everyone else.

The user-facing ask was: "I want a login page with anonymous-with-pseudo
OR GitHub, and I want to come back the next day and find my
unmerged contributions."

**Options**:

- A — Extend the hand-rolled session: add `kind: 'github' | 'anonymous'`
  to the cookie, write the pseudo flow ourselves, layer CSRF /
  session-rotation / token-refresh on top as we discover we need them.
- B — Adopt `better-auth` (with its `anonymous` plugin + `github`
  social provider) and delete the hand-rolled session layer.

**Choice**: B (better-auth).

**Rationale**:

- The hand-rolled session covered ~30% of what a real auth lib does
  (sign + verify cookie). Refresh, rotation, CSRF, multi-device, and
  account linking would all need to ship as we needed them — death
  by a thousand cuts.
- `better-auth`'s `anonymous` plugin gives us a server-issued session
  for pseudo users with zero PII (no email, no link to an external
  identity), and its `socialProviders.github` covers OAuth without
  us needing to wrap `@octokit/auth-oauth-user` ourselves.
- The "find my open contributions" feature is trivial once identity
  lives on a stable session cookie — we just search the data repo
  for PRs whose body mentions the contributor.
- Cost we accept: one new dependency (~70 transitive packages) and a
  SQLite session store at `apps/dashboard/.auth.db` (gitignored).

**PR body attribution change** (rolled in here because it ships
alongside): drop the `Co-authored-by:` trailer entirely. Previously,
authenticated users got a trailer on every commit so their GitHub
contribution graph would show the edits. In practice this surfaced as
"a wall of commits authored by the bot, co-authored by me" which
nobody found useful, and the asymmetry vs anonymous users (no trailer)
created an unwanted "first-class vs second-class" reading. The bot is
now the sole listed author on every commit; the contributor is named
once, in the PR body's `Contributors` section:

- GitHub: `- @login` (renders as a clickable mention)
- Anonymous: `- **Pseudo** _(anonymous contributor)_` (bold plain
  text, NO `@`, so a reviewer can never confuse it for a real handle)

**Consequences**:

- A new SQLite DB at `apps/dashboard/.auth.db` is the dashboard's only
  stateful storage. Lost = everyone signed out, no data loss otherwise.
  Schema bootstrapped by `bun run auth:migrate` (programmatic, no CLI
  toolchain needed — see `api/auth-migrate.ts`).
- `BETTER_AUTH_SECRET` becomes a required production env var. A dev
  fallback gets generated at boot so `bun run dev` keeps working out
  of the box, at the cost of "every restart logs everyone out".
- Save endpoint now REQUIRES a session (anonymous or GitHub). Visitors
  who skip the login page see the save button disabled with a
  "Sign in to save" link. Read endpoints stay 100% public.
- The hand-rolled OAuth wrappers `authorizeUrl` / `exchangeCode` in
  `packages/github-client/src/oauth.ts` are deleted along with the
  `@octokit/auth-oauth-user` dependency. The `isAdmin` allow-list
  check stays in that file (used in two packages).
- New endpoint `GET /api/me/contributions` (and the home-page panel
  consuming it) lists the session's open dashboard-labelled PRs.
  Anonymous match is `**Pseudo**` substring, GitHub match is
  `- @login` substring; both filter to PRs labelled `via-dashboard`
  so coincidental body matches don't leak.

**Resume editing — shipped** (this section was previously marked
"deferred to a follow-up"; that follow-up landed). When a contributor
revisits an entity they already have an open PR on, the dashboard:

- detects the open PR via `findOpenPRForEntity(octokit, cfg, identity,
  entityId)` — title-exact `Edit <type>:<slug>` + the `via-dashboard`
  / `anonymous` label + the contributor's bullet (`- @login` or
  `**Pseudo**`);
- serves `data` + `translations` off the PR's head branch on
  `GET /api/entities/:type/:slug` so the form opens on the in-flight
  state, not on `main`;
- routes `POST /api/entities/:type/:slug` saves through the new
  `existingPR` mode of `submitEntityEdit`, which skips `createBranch`
  - `openPullRequest` and just appends a commit to the existing head
    branch;
- returns `{pr.reused: true}` so the dashboard's toast says
  "Commit ajouté à PR #N" instead of "PR #N ouverte" and a banner
  at the top of the entity page links the user to the open PR.

The "1 PR per entity per contributor" invariant is preserved: a
contributor cannot accidentally fan out parallel PRs by editing the
same entity twice. The lookup is best-effort — if GitHub's search
index lags or the call fails, the server falls back to opening a new
PR rather than blocking the save.

---

## ADR-015 — Open contributions with two-stage R2 + admin moderation queue

**Date**: 2026-05-16

**Context**: Phase 4 ships a dashboard that's effectively
admin-only — the OAuth callback rejects any login not in
`ADMIN_GITHUB_USERNAMES`. The maintainer wants to accept
contributions from anyone with a GitHub account: data edits AND
image uploads, with validation gated by a small admin set
(currently the maintainer alone, login `7IBO`).

Three concerns immediately surface:

1. **Identity / authorization.** Today's binary "in the list or
   out" check needs to become a tier system: visitors (read-only),
   contributors (open PRs that must be reviewed), admins (review +
   merge + block other contributors). Anonymous contributions
   would be a spam vector; GitHub OAuth as the identity layer keeps
   the cost of trolling non-zero.

2. **Image storage.** The current pipeline puts every PUT
   immediately on the public R2 CDN. With non-admins uploading,
   that means unvetted content is publicly accessible the instant
   the upload finishes, even if the maintainer never approves it.
   Worse, R2 has no lifecycle rule on the bucket, so closed PRs
   leave orphan bytes forever.

3. **Review surface.** GitHub's PR UI shows JSON diffs and image
   links but not a rendered preview of the entity post-merge nor a
   visual preview of staged images. The dashboard already computes
   a structured `DiffPopover` for unsaved changes; that same
   renderer can drive an admin-only `/admin/queue` route for
   triaging the backlog.

**Options considered**:

- **A — Stay admin-only.** Forever. Reject the request; rely on
  trusted maintainers only. Solves the moderation problem by
  refusing to have one. Caps the project's contributor pool at
  whoever the maintainer trusts directly. Not what the maintainer
  asked for.

- **B — Open + naive (no two-stage, no queue).** Drop the admin
  check on auth, let contributors hit the existing
  `/api/uploads/presign` and `/api/entities/:type/:slug` endpoints,
  rely entirely on PR review on GitHub. Cheap to implement but
  publishes raw uploads to the public CDN immediately and gives
  the maintainer no batch-review tooling.

- **C — Open + two-stage R2 + custom admin queue** (the
  recommendation). Three auth tiers in code, two R2 prefixes
  (`pending/` private + `images/` public), promotion driven by PR
  merge webhook, custom moderation UI for the admin. Split into
  four shippable sub-phases (see ROADMAP Phase 7).

- **D — C + active content moderation** (NSFW / copyright /
  fingerprinting). Adds an automated check service to every
  upload, blocking submission past a threshold. Extra cost
  (monetary + latency + false-positive handling). Overkill for an
  invite-only community-of-readers scale; revisit when contributor
  growth makes it warranted.

**Choice**: C, with the staging-prefix variant rather than
two-bucket. Phase 0 (lock admin set to `7IBO`) is config-only and
ships immediately; the remaining sub-phases (7.1 R2 two-stage, 7.2
auth opening, 7.3 admin queue) ship in order.

**Promotion path — revised**: the initial 7.1 implementation
shipped with a GitHub Actions workflow (`promote-images.yml`)
triggered on push to main. That was replaced before any production
use with a **dashboard-driven** promotion: the
`/api/admin/promote` endpoint encapsulates the full
"copy bytes + rewrite URLs on the PR branch + squash-merge"
sequence, called from the admin queue UI (Phase 7.3) or, until
that ships, directly by the maintainer. Rationale: a single admin
(7IBO) means GitHub's review UI isn't where merges happen — the
queue UI is. Driving promotion from the queue removes a class of
race (merge-but-promote-hasn't-run-yet), keeps the bytes off the
public CDN until an explicit human OK, and centralises the
"validation/transformation" surface (resize, optimize, NSFW
later) in one server module. The build guard in
`packages/schema-engine/src/cli/validate.ts` remains, so any
out-of-band merge still fails CI before bad data lands.

**Anonymous writes — revised**: the maintainer revised the auth
model again before 7.2 shipped: **unauthenticated users CAN
write** (modify data + upload images). Drops the GitHub-login
prerequisite that Option B explicitly rejected. The rationale is
Wikipedia-style: the barrier to "I want to fix one typo" should
be near-zero, and PR review remains the gate that prevents bad
data from landing.

**Anonymous attribution — revised**: the first 7.2 implementation
embedded a salted-SHA hash of the source IP in the PR body for
spam correlation. Reviewed and pulled back over privacy concerns
(hashed IPs are still personal data under EU law if the salt is
reachable). Replaced with a **self-chosen optional nickname**
prompted in the save bar when no GitHub session is attached. The
nickname is:

- a plain string the contributor types in (or doesn't);
- persisted to localStorage so a returning anonymous contributor
  doesn't have to re-type;
- surfaced in the PR body verbatim with NO `@` prefix so it can't
  be mistaken for a GitHub handle;
- length-capped (32 chars) and character-set restricted (letters /
  digits / dash / underscore / dot / space) server-side.

The dashboard server still uses the client IP for in-memory
rate-limiting + the `BLOCKED_IPS` kill-switch, but no IP-derived
value ever leaves the process. Spam correlation degrades from
"two PRs from same IP hash" to "two PRs from same self-chosen
nickname" — weaker, but a determined spammer rotates IPs anyway,
and the simpler model has zero personal-data surface.

Tiers become four, not three:

| Tier              | Identity                                  | Writes         | Co-authored-by  | Auto-merge eligible |
| ----------------- | ----------------------------------------- | -------------- | --------------- | ------------------- |
| **Anonymous**     | none                                      | yes            | none (bot only) | never               |
| **Contributor**   | GitHub-authenticated, any login           | yes            | contributor     | never               |
| **Admin (write)** | login in `ADMIN_GITHUB_USERNAMES`         | yes            | admin           | yes                 |
| **Admin (mod)**   | same login, calling admin queue endpoints | merge / reject | n/a             | n/a                 |

Consequences of opening to anonymous writes:

- **Rate-limit per IP** for anonymous saves + presign-upload (the
  dashboard's only handle on identity). Defaults: 10 anonymous
  PRs / hour / IP, 20 anonymous uploads / hour / IP. Tunable as
  env vars; abusive IPs get blocklisted.
- **`Co-authored-by` skipped** when the writer is anonymous. The
  PR is fully attributed to the GitHub App's bot identity. PR
  body shows the contributor's self-chosen nickname (if any) as a
  plain string — never as `@nickname`. See "Anonymous
  attribution — revised" below for why we don't use IP hashes.
- **`BLOCKED_GITHUB_USERNAMES`** no longer covers the abuse
  surface alone; it still works for authenticated trolls but
  anonymous abuse needs the IP rate-limit + a `BLOCKED_IPS` env
  var (also added). Defer captcha (Cloudflare Turnstile or
  similar) until volume forces it.
- **Auto-merge workflow** already requires an admin
  `Co-authored-by` to fire — anonymous PRs naturally don't
  qualify. No workflow change needed.
- **Image uploads stay staging-only** until the admin promotes
  via the queue UI. The anonymity tier doesn't change the
  storage model; it just lowers the bar to _upload to the
  staging area_.

The build guard + dashboard-driven promotion remain the canonical
"nothing reaches main without admin OK" path, anonymity or not.

**Rationale**:

- **Three tiers, not two**: a contributor IS materially different
  from an admin (can propose, can't approve) and pretending
  otherwise pushes the moderation problem onto manual GitHub PR
  triage, which the maintainer has correctly identified as
  insufficient.
- **Two-stage storage**: separating "uploaded" from "approved
  bytes" mirrors how every CMS handles user-generated content
  (WordPress media library has pending status, Notion has draft
  blocks, etc.). It's the cheapest mechanism that gives the
  maintainer the option to NOT publish without manual cleanup.
- **PR as the source of truth**: even with a custom admin UI, the
  merge action goes through the GitHub API. PRs stay
  reviewable / commentable / revertable through the normal GitHub
  surface, and a power user (the maintainer) can bypass the
  queue UI and review on GitHub directly when convenient.
- **Phased rollout**: each sub-phase is shippable independently
  and reverses the risk cleanly:
  - 7.0 (lock admin set) is reversible by changing an env var.
  - 7.1 (two-stage R2) is invisible to admin users (they still
    upload normally; staged + promoted in their merge flow).
  - 7.2 (open auth) is the moment the surface gets exposed; can be
    rolled back to admin-only by re-adding the
    `ADMIN_GITHUB_USERNAMES` check on `/auth/me`.
  - 7.3 (admin queue UI) is purely additive — GitHub PR review
    remains the fallback.
- **Defer active moderation (Option D) explicitly**: trust the
  admin + PR review for the foreseeable contributor scale.
  Revisit when (a) contributor count > 20 OR (b) the first
  inappropriate-upload incident makes the case.

**Consequences**:

- A new R2 prefix `pending/` requires a lifecycle rule (auto-purge
  > 14 days) and a webhook-driven promotion workflow. Both add
  > ops surface area, but the alternative is orphan bytes paid for
  > forever.
- The dashboard auth check shifts from "is this user in
  `ADMIN_GITHUB_USERNAMES`" to "what tier is this user", changing
  the session shape. `Phase 7.2` is the breaking change moment —
  every write endpoint needs to know which tier the caller has.
- The admin queue route at `/admin/queue` introduces a new
  authorization gate that doesn't exist today (any authenticated
  user is currently treated as admin by virtue of being in the
  list). Going forward the dashboard MUST consult the
  `tier === 'admin'` check on every admin-only route.
- The data model gains a transient URL scheme `staging://<key>`
  on the image entity's `url` property. This is a frontend-level
  encoding only — by the time the entity hits `main`, the URL is
  rewritten to the public CDN form via the promotion workflow's
  follow-up commit. Documented in DATA_MODEL.md when 7.1 ships.
- `auto-merge-dashboard.yml` is tightened: contributor PRs never
  auto-merge regardless of CI status. Admins still benefit from
  auto-merge for their own work.
- IDEAS.md "AI-assisted editing + external-source ingest" entry
  (Fandom / api-onepiece.com) interacts with this work: external
  ingest would naturally use the contributor flow (`assisted_by`
  attribution + admin review), but is NOT a prerequisite. Each
  ships independently.
- The work is sized at ~10 working days total (0.5 + 2 + 3 + 5)
  spread over a calendar quarter. The maintainer can pause
  between sub-phases without leaving the codebase in a broken
  state — each sub-phase ends at a green build.

---

## ADR-014 — Split Phase 4 into sub-phases; ship 4.1 (local dashboard) first

**Date**: 2026-05-14

**Context**: ROADMAP Phase 4 enumerates eight large tasks for one
sub-phase: TanStack Start setup, GitHub App auth, packages/github-client
(Octokit), schema-driven form generator, ten value-input components,
historical-value editor, relation editor, IndexedDB drafts, AI-assisted
Suggest buttons, and an image upload pipeline writing to R2. Some
of those dependencies require **external setup the maintainer must
perform out of band** — registering a GitHub App at
`github.com/settings/apps/new`, generating a private key, installing
it on the data repo — which Claude Code cannot do from inside the
sandbox. Treating Phase 4 as one monolithic deliverable conflates
"the dashboard works locally" (no external blockers) with "the
dashboard opens PRs on GitHub" (blocked on GitHub App registration).

**Options**:

- A — Keep Phase 4 monolithic. Wait until the maintainer registers
  the GitHub App; only then start any Phase 4 implementation. Phase 4
  stays at zero progress in the meantime.
- B — Split Phase 4 into four sub-phases, each with its own exit
  criteria. Ship the parts that have no external dependency first.

**Choice**: B.

**Phase 4 sub-phases**:

- **Phase 4.1 — Local dashboard** (no external blockers)
  - `apps/dashboard` (TanStack Start) runs locally.
  - `packages/ui` exposes the Tailwind v4 theme tokens + Base UI
    re-exports + `cn()` helper.
  - Routes: home, type list, entity list per type, entity edit.
  - Schema-driven form generator. Value inputs: String, Number,
    Enum, Boolean, EntityRef, I18nKey.
  - Save action writes JSON files to `/data/universes/` directly
    via a Bun server function. No auth, no PR flow.
  - Exit: `bun --filter @onepiece-wiki/dashboard dev` opens a
    browser-renderable dashboard; editing an entity and saving
    persists to disk; reloading shows the change.
- **Phase 4.2 — GitHub integration** (blocked on GitHub App)
  - `packages/github-client` (Octokit wrapper).
  - Server-side GitHub OAuth session.
  - Save action replaces local FS write with branch + PR via
    Octokit. SHA-based optimistic locking.
  - Exit: edits go through PRs rather than direct disk writes.
- **Phase 4.3 — Editor depth**
  - Remaining value inputs: SourceRef, MultiEnum, Date, Markdown.
  - Historical value editor (add/remove/reorder entries with
    qualifier sub-forms and inline timeline).
  - Relation editor (per-relation qualifier form).
  - IndexedDB drafts with auto-save and restore.
- **Phase 4.4 — AI-assisted + images**
  - `✨ Suggest` button per field (manual paste-flow via Claude Code).
  - Image upload value input writing to R2 (the upload server
    function from ROADMAP Phase 4 Task 8).

**Rationale**:

- 4.1 ships immediately. The maintainer gains a UI for editing
  entities without touching JSON, which is itself a meaningful
  improvement over Claude-Code-only editing.
- 4.2's blocking dependency is surfaced explicitly. Future sessions
  start it once the GitHub App is registered.
- 4.3 and 4.4 are nice-to-haves whose value compounds as data volume
  grows.
- The ROADMAP Phase 4 exit criteria remain the bar to mark Phase 4
  _complete_. ADR-014 only restructures the path to that bar; it
  does not move it.

**Consequences**:

- ROADMAP's "Current phase" tracker uses "4.1 complete" /
  "4.2 ready / blocked on GitHub App" semantics rather than a single
  in-progress/complete bit.
- Phase 4.1 ships without auth. The local server binds to localhost
  only and is **not** meant to be exposed publicly — it's a
  single-machine maintainer tool.
- Direct FS writes in 4.1 mean the maintainer's git workflow stays
  manual: edits land in the working tree; the maintainer commits.
  This is exactly the same surface they've been using via Claude
  Code so far, so no behaviour regression.
- ROADMAP Phase 4 task list is reorganised under the sub-phase
  headings; original task content unchanged.

**Non-decisions** (deferred):

- Whether Phase 4.4's Suggest button stays manual paste-flow or
  upgrades to a direct API call. Tied to the AI scale-up criteria
  in ROADMAP.

---

## ADR-013 — Phase 3 preview is a minimal Bun HTTP server, not TanStack Start

**Date**: 2026-05-14

**Context**: ARCHITECTURE.md, CLAUDE.md, and ROADMAP Phase 3 Task 1 all
name TanStack Start as the web framework for `apps/preview`. The
preview app's stated purpose (ADR-007 + ARCHITECTURE.md § "Public web
app (deferred)") is:

> raw entity display, basic spoiler filter, to validate the data model
> end-to-end

i.e. a sandbox, not a product surface. The full TanStack Start setup —
file-based routing, server functions, build pipeline, React 19, Vite,
Tailwind v4, Base UI — is significant scaffolding for an app that
exists to prove the SDK queries the right rows.

**Options**:

- A — Full TanStack Start + React + Tailwind v4 + Base UI in Phase 3.
  Matches the documented stack. Significant up-front cost; the
  resulting app's UI is throwaway because Phase 6 builds the real
  public app from scratch with proper SEO/SSG.
- B — Minimal Bun HTTP server in Phase 3. Server-rendered semantic
  HTML with a tiny inline stylesheet. Query-param-driven spoiler
  filter (`?chapter=N`) and locale switch (`?locale=fr`). No React,
  no Vite, no framework boilerplate. The dashboard (Phase 4) is where
  TanStack Start lands; the public web app (Phase 6) is where the
  Base-UI + Tailwind design system lands.
- C — TanStack Start without Tailwind / Base UI in Phase 3, then
  layer those on for Phase 4. Hybrid; gets the framework cost without
  the design-system payoff.

**Choice**: B.

**Rationale**: The preview's role is validation, not design. A
purpose-built HTTP server hits every Phase 3 exit criterion (route
`/preview/[type]/[slug]` renders an entity, chapter input filters
spoilers, locale switcher swaps EN/FR labels) in dramatically less
code. The data-model bugs the preview is supposed to surface are
already visible in pure-data rendering; running them through a React
tree adds no signal. The dashboard's TanStack Start setup in Phase 4
remains exactly as planned — that surface needs the type-safe server
functions and dynamic forms.

**Consequences**:

- `apps/preview` is ~200 lines of Bun + a small render module, not a
  Vite project. No React in the dependency tree until Phase 4.
- The Pagefind static index task moves from Phase 3 to Phase 6 (the
  real public app). The preview has no search bar; entity lookup is
  via URL.
- ROADMAP Phase 3 Task 1 stands; only the framework choice softens.
  Phase 3 exit criteria are unchanged.
- The Phase 4 dashboard task remains "TanStack Start setup". This
  ADR does not affect that decision.

**Non-decisions** (deferred):

- Whether the public web app in Phase 6 reuses the preview server or
  starts fresh from TanStack Start. Phase 6's design pass will pick.

---

## ADR-012 — Switch to `bun:sqlite` (better-sqlite3 unusable under Bun on Windows)

**Date**: 2026-05-14

**Context**: Phase 2 implementation of `packages/db-builder` required
opening a SQLite database. ADR-001 / the doc-consistency pass (fix 5)
committed to `better-sqlite3` as the only SQLite driver. On the project
maintainer's Windows machine with Bun 1.3.6, `new Database(path)` from
`better-sqlite3` 12.10 fails at load time:

```
ERR_DLOPEN_FAILED
at new Database (better-sqlite3/lib/database.js:48:29)
```

The error message itself suggests `bun:sqlite`. The native `.node`
binding is incompatible with Bun's Windows runtime; the only way to
keep `better-sqlite3` would be to run the build pipeline under Node
instead of Bun, which contradicts ARCHITECTURE.md's stated runtime.

**Options**:

- A — Keep `better-sqlite3`; run the build pipeline under Node only.
  Adds a runtime split (Bun for scripts, Node for the builder) and
  bifurcates the developer experience.
- B — Switch to `bun:sqlite`. Native to Bun, no compilation step, API
  compatible with `better-sqlite3` for the subset Phase 2 uses
  (Database, prepare, run, transaction, exec).
- C — Switch to a JS-only SQLite (sql.js, etc.). Loses the
  better-sqlite3 performance characteristics that motivated ADR-001.

**Choice**: B.

**Rationale**: The error message is explicit; the API is compatible;
keeping one runtime simplifies tooling. `bun:sqlite` is mature enough
for Phase 2's needs (build-time write, no online concurrency, no FTS5
yet). When Phase 3+ ships the public web app, it reads the artefact at
runtime; that reader can be `better-sqlite3` under Node (Vercel
serverless) without affecting the build pipeline — i.e. write-side and
read-side drivers may legitimately differ.

**Consequences**:

- `packages/db-builder` uses `import { Database } from 'bun:sqlite'`.
  `better-sqlite3` is removed from the package dependencies.
- ARCHITECTURE.md and CLAUDE.md soften the "better-sqlite3 only"
  language to: build-time uses `bun:sqlite`; read-time may use
  `better-sqlite3` under Node when serverless deployments require it.
- Phase 2 work flagged a real bug in fix 5 of the doc-consistency
  pass: the runtime was tested only on the docs layer, not against an
  actual install. The same risk applies to other native-binding
  dependencies; future ADRs should require a smoke test before
  committing to a specific binding.
- `bun:sqlite` requires **positional parameter binding** (`?` rather
  than `$name`) when an object key collides with a SQL reserved word
  like `type`. The Phase 2 writer uses `?` throughout for
  predictability.

**Non-decisions** (deferred):

- Whether to drop `better-sqlite3` from the project entirely. Phase 6
  may want it for the read-side serverless app; we'll decide then.

---

## ADR-011 — Images as first-class entities; in-universe documents deferred

**Date**: 2026-05-14

**Context**: The data model needs to represent visual content
(portraits, scenes, covers, wanted posters, …). Two design tensions:

1. **Images as illustrations vs. as data.** A simplistic
   "url-on-entity" approach treats images as decoration. The wiki
   needs more: licensing per file, spoiler-gating per image, reuse
   across multiple entities (group photos), and a clean R2 storage
   convention.
2. **Plain images vs. in-universe documents.** Wanted posters, vivre
   cards, newspapers, and similar diegetic objects could be modeled
   as their own entity type (`document`) with subtypes — enabling
   queries like "all wanted posters issued by the Marines" or "all
   vivre cards held by Luffy".

**Options**:

- A — Defer images entirely; revisit after the basic model ships.
- B — Add `image` as a first-class entity and `document` as a
  separate first-class entity in Phase 1.
- C — Add `image` as a first-class entity in Phase 1. Model
  in-universe documents as plain images for now; promote to a
  `document` entity type in a later phase via a non-destructive
  migration.

**Choice**: C.

**Rationale**:

- Images must be first-class — licensing, dedup, reuse, spoiler
  gating, and R2 storage all demand entity status. Option A blocks
  too much downstream work (preview app, dashboard upload form,
  bulk-import provenance).
- Document semantics are valuable but premature. The current
  contributor count is one. Most images don't need document
  semantics (a portrait is just a portrait). Validating the basic
  image flow first reduces the risk of designing `document` against
  unknown contributor patterns.
- The migration path is clean. Existing `image` entities representing
  diegetic objects stay as-is; new `document` entities are created
  later and carry their own `depicted-by` relations to those images.
  No data loss, no schema rewrites. Detailed in `/docs/IMAGES.md`
  § "Migration plan: images → documents" and `/IDEAS.md`
  § "In-universe documents as first-class entities".

**Consequences**:

- Phase 1 adds: `image` entity type; `depicted-by` and `sourced-from`
  relation types; `image-licenses`, `depiction-roles`, and
  `image-formats` vocabularies. Phase 4 adds the upload value-input
  component and R2 upload server function. See `/docs/ROADMAP.md`.
- Known limitation: bounty-change images cannot be queried as "all
  wanted posters issued by the Marines" until `document` lands. The
  workaround for Phase 1 is the `depicted-by` relation's `period` and
  `context` qualifiers, which carry free-form string metadata. Logged
  in `/IDEAS.md` as a forward-pointer.
- Storage is **flat** on R2: `images/<image-slug>.<format>`. The
  per-entity-directory layout was rejected because reused images
  (group photos) have no single "owner" to nest under. Detailed in
  `/docs/ARCHITECTURE.md` § "R2 storage key convention".
- Two filters apply to image display: `image.spoiler_since` (is the
  image itself safe?) and the `depicted-by` qualifier `since` (is
  this depiction contextually accurate?). The dual filter is
  intentional — it handles Gear-5 reveals and historisable wanted
  posters with the same mechanism. Detailed in `/docs/IMAGES.md`
  § "Spoiler handling".

**Non-decisions** (deferred):

- The exact `document` schema shape — its properties, subtypes, and
  qualifiers — stays unwritten until promotion. Speculating now would
  bias the design before contributor demand surfaces.
- Whether to also defer SVG support pending the `image-formats`
  vocabulary's first real-world use. Phase 1 ships all six formats;
  if any prove unused or problematic, the vocabulary entry can be
  removed in a vocabulary PR without entity-level migration.

---

## ADR-010 — AI-assisted data entry as a first-class concept

**Date**: 2026-05-14

**Context**: A growing share of structured data on the wiki will be
generated by AI agents — Claude Code instances editing JSON locally,
scripts that batch-call the Anthropic API to seed property values,
"Suggest" buttons in the dashboard that draft fields for editors.
Without a model-level distinction, AI output and human input become
indistinguishable, and human reviewers have no systematic way to find
unverified entries.

**Options**:

- A — Treat AI provenance as a git-history concern only (no model
  fields). Detect AI commits by author identity.
- B — Add structured per-value qualifiers: `assisted_by` for provenance,
  `review_status` for human attention. Make them first-class base
  qualifiers available on every historisable value and relation.
- C — Add a separate "review queue" data store outside the entity files.

**Choice**: B.

**Rationale**:

- Provenance lives next to the value it qualifies, so a single
  `getEntity(id)` call surfaces what's AI-generated and what isn't. A
  git-only signal (option A) would require correlating commits with
  entity diffs at read time, which doesn't fit the JSON-as-truth model.
- A separate review queue (option C) duplicates state and risks drift
  between the queue and the data. Per-value qualifiers stay in lockstep
  by construction.
- Two separate qualifiers (not one combined "trust" field) preserve
  orthogonality: `assisted_by` answers _who generated this_,
  `review_status` answers _has a human checked it_. They evolve
  independently — an AI-generated value can be reviewed; an
  auto-imported value can be flagged later by a different reviewer.

**Phase 1 entry surface**: Claude Code with the Max subscription, run
locally by the project maintainer. Writes JSON directly. `assisted_by`
is set to `claude-<family>-<version>-via-cc` on every value Claude
generates; `review_status` is `not_reviewed` until a follow-up commit
either confirms the value (drops both qualifiers) or flags it.

**Migration path at scale**: when entry volume exceeds what
human-supervised Claude Code can sustain, the same qualifiers cover a
script that calls the Anthropic API directly — likely in Batch mode
for cost — and writes JSON via PRs. The `assisted_by` format already
distinguishes surfaces (`via-cc`, `via-api`, `via-dashboard`); no
model change is required. The triggers for migration are documented
in `/docs/ROADMAP.md` § "AI scale-up criteria".

**Consequences**:

- New vocabulary `/data/schemas/vocabulary/review-statuses.json` lists
  the four review states (`reviewed`, `not_reviewed`, `flagged`,
  `auto_imported`).
- `assisted_by` and `review_status` are documented as base qualifiers
  in `/docs/SCHEMA_SPEC.md`, the provenance/review concept is
  documented in `/docs/DATA_MODEL.md`, and the epistemic-vs-review
  distinction is in `/docs/EPISTEMIC_MODEL.md`.
- CI gates will be able to refuse `main` merges that introduce entries
  with `review_status: "not_reviewed"` once the dashboard supports
  marking review.
- The dashboard's "needs attention" queue is a query over
  `review_status IN ("not_reviewed", "flagged", "auto_imported")`.

**Non-decisions** (deferred):

- Whether AI-assisted edits should open an automatic draft PR rather
  than be committed directly — punted until volume justifies the
  infrastructure.
- Whether AI-suggested narratives (Markdown) carry a parallel signal
  — out of scope for this ADR; covered when the narrative editor is
  built.

---

## ADR-009 — Doc-consistency pass before Phase 1 code

**Date**: 2026-05-14

**Context**: Before any code work began for Phase 1, an audit of the
full doc set (CLAUDE.md plus the twelve files under `/docs/`) surfaced
three genuine contradictions and several smaller ambiguities. The risk
of starting code on top of contradictory specs is that decisions get
silently locked in by whichever spec the implementer happened to read.

**Choice**: Apply eight targeted doc-only commits resolving each issue
discretely, with no code touched. Specifically:

1. **ADR-007** retitled and rewritten so it no longer claims the preview
   app belongs to Phase 1; ROADMAP (Phase 3) is the authority.
2. **DATA_MODEL.md** Gomu Gomu example: `revealed` → `revealed_to_reader`,
   matching the canonical enum in EPISTEMIC_MODEL.md.
3. **SCHEMA_SPEC.md** — introduce a _base qualifiers_ concept
   (`epistemic_status`, `actual_value`, `event`, `believed_by`,
   `known_truth_by` implicit on every historisable property) and clarify
   that `default_qualifiers` vs `allowed_qualifiers` is a UI distinction
   (shown by default vs behind "more options"). Drop `epistemic_status`
   from the bounty example's `allowed_qualifiers`.
4. **Localization terminology** section added to SCHEMA_SPEC.md and
   mirrored in I18N_STRATEGY.md, defining `i18n_key` (value type),
   `value_key` (entry field), `canonical_name_key` (entity field), and
   formally retiring the orphan term `name_key`.
5. **CLAUDE.md** — drop the `bun:sqlite` alternative; `better-sqlite3`
   is the only listed driver, matching ARCHITECTURE and BUILD_PIPELINE.
6. **CLAUDE.md + ARCHITECTURE.md** — replace the "oxfmt if stable, else
   dprint" conditional with "dprint (oxfmt under consideration when it
   stabilises)", since CONVENTIONS.md already names `dprint.json` as the
   config file.
7. **SCHEMA_SPEC.md** — document when relation `since` may be omitted
   (pre-canon events) and the alternative qualifier `during_period`
   anchored by a controlled vocabulary; add `eaten-by` as a worked
   example covering the Joy Boy / Void Century case.
8. **CONVENTIONS.md** — introduce the rule "omit fields equal to their
   schema default in entity JSON", enforced by `bun run format:data`.
   Apply across all worked examples in DATA_MODEL.md.

**Rationale**: Resolving these now means Phase 1 code is built against a
single, internally consistent specification. The eight changes are
small, additive, and reviewable; doing them as one bulk PR would have
hidden the _kind_ of issue each one addresses.

**Consequences**:

- The doc set is now self-consistent on phase placement, the epistemic
  enum, the qualifier model, localisation terminology, the SQLite
  driver, the formatter default, when `since` is required on relations,
  and the default-omission rule.
- A small number of in-scope follow-ups remain for later passes:
  - CONVENTIONS.md still phrases the formatter as "oxfmt (or dprint as
    fallback)" in the Formatting section — the wording was left
    untouched because it was out of scope for fix 6, but it should
    converge with CLAUDE.md and ARCHITECTURE.md in a future commit.
  - The Luffy bounty history disagrees between two DATA_MODEL.md
    examples (chapter 1053 vs 1058 for ₿3B). A simple fact-check, not
    architectural — flagged here so it isn't lost.
  - The `during-periods.json` vocabulary and the
    `MISSING_TEMPORAL_ANCHOR` build error were referenced by the
    eaten-by example but not yet authored under `/data/schemas/`. Both
    are Phase 1 deliverables.

**What we learned** (recorded so the next phase boundary repeats it):

- **Worked examples drift fastest.** DATA_MODEL.md held more
  contradictions than the formal spec layer. Whenever the data model
  changes, the examples must be revalidated, not just the spec.
- **Establish vocabulary before using it.** The four near-synonyms for
  the localisation key space (`i18n_key`, `value_key`,
  `canonical_name_key`, `name_key`) accreted across separate docs
  written at different times. Naming a concept is part of introducing
  it.
- **ADR titles outrun their bodies.** ADR-007's title contradicted its
  own body, and the title won every time the ADR was referenced
  elsewhere. Title and body must agree.
- **"Implicit on every X" rules need a formal home.** The five base
  qualifiers were used uniformly in examples but had no canonical
  declaration; editors who didn't read EPISTEMIC_MODEL would have
  redeclared them per property type.

**Process for future passes**: run a doc-consistency audit at the end of
every completed phase, before any code is written for the next phase.
Fix in small commits per concern, log the result as a new ADR.

---

## ADR-008 — Storage strategy for dashboard drafts and sessions

**Date**: 2026-05 (TBD on commit)

**Context**: The dashboard needs to persist in-progress edits (drafts) and
optionally session/lock state. Two options were considered.

**Options**:

- A — Filesystem/GitHub direct, drafts in IndexedDB/LocalStorage on the
  client. No server-side persistent state in phase 1.
- B — Dedicated database (Postgres or SQLite) for drafts, locks, sessions.

**Choice**: A.

**Rationale**: Phase 1 is admin-only with very low contention, deploying on
Vercel (serverless). A client-side IndexedDB draft store is sufficient,
keeps infrastructure minimal, and avoids a database to operate. When
community contribution opens (phase 7), we can move to B without affecting
the data model.

**Consequences**:

- Drafts are device-local; switching devices loses in-progress work
- Concurrent edits handled by SHA-based optimistic locking against GitHub
- Migration path to a server-side store is straightforward (server function
  signatures unchanged)

---

## ADR-007 — Preview app exists before the dashboard, not after

**Date**: 2026-05

**Context**: The initial intent was to build the dashboard first and defer
all read-side concerns until much later. The risk is that a write-only
system produces data unsuitable for actual reading, and that the build
pipeline is never exercised end-to-end. An early draft of this ADR
mistakenly placed the preview app in Phase 1; the ROADMAP correctly puts it
in Phase 3, before the dashboard work in Phase 4.

**Choice**: Build a minimal preview app in **Phase 3** (see `/docs/ROADMAP.md`),
before the dashboard. The preview is not part of Phase 1; Phase 1 stops at a
typed, validated data model.

**Rationale**: The preview app is the cheapest possible end-to-end test of
the data model. It can be unstyled and minimal, but it must exist **before
the Phase 4 dashboard work begins**, so the dashboard is built against a
data model that has been exercised by a real reader.

**Consequences**: ~1 week of additional work in Phase 3, repaid many times
over by avoiding model rework once the dashboard is in flight.

---

## ADR-006 — Single-language slugs (English)

**Date**: 2026-05

**Context**: URLs could be localized (`/personnages/monkey-d-luffy` in FR,
`/characters/monkey-d-luffy` in EN) or unified.

**Choice**: English slugs only. URLs are not localized; only content is.

**Rationale**: Canonical URLs simplify SEO, link sharing, and the
implementation. The English-speaking community uses well-established names
that are stable across years. URL segments for type are also English
(`/characters/...`).

**Consequences**: hreflang is still emitted for content; only the URL
structure is shared.

---

## ADR-005 — Sources are entities, not a separate concept

**Date**: 2026-05

**Context**: An earlier draft separated entities (characters, fruits, etc.)
from sources (chapters, episodes, films). This created a dichotomy in the
data layer and the code.

**Choice**: Everything is an entity. Chapters, episodes, films, SBS, and
databooks are entity types like any other.

**Rationale**: Uniform model. The SDK has one function `getEntity`. Forms
are generated identically. Relations work the same way. The build pipeline
treats them uniformly.

**Consequences**: Larger entity surface area, but each type is small. The
data model is simpler overall.

---

## ADR-004 — IDs are `type:slug`, distinct from slugs

**Date**: 2026-05

**Context**: Choice between slug-as-id, prefixed-id, and uuid.

**Choice**: Prefixed IDs of the form `type:slug` (e.g.
`character:luffy`). IDs are immutable. Slugs are public, mutable, with
redirect history.

**Rationale**:

- Prefixing avoids cross-type collisions (`character:arlong` vs
  `crew:arlong-pirates`)
- Self-documenting relations: `target: "devil-fruit:gomu-gomu"`
- Slug rename does not invalidate thousands of references
- Easier validation: type is parseable from the id

**Consequences**: Slightly more verbose JSON, mitigated by short slugs.
Dashboard forms hide the prefix from users.

---

## ADR-003 — JSON in Git as source of truth, SQLite as derived artifact

**Date**: 2026-05

**Context**: The data could live in a database, in JSON in Git, or hybrid.

**Choice**: JSON files in Git are the source of truth. SQLite is
regenerated from scratch on every build and is never written to at runtime.

**Rationale**:

- Auditability: every change is a Git commit with author and message
- Reviewability: diffs are reviewable in PRs
- Forkability: third parties can consume the data
- Performance: SQLite gives fast read-side queries
- Simplicity: no migrations on the read DB (it's regenerated)

**Consequences**: A build step is required between data change and visible
update. Editing must happen via a UI that opens PRs (the dashboard).

---

## ADR-002 — Schema-driven dashboard (no hardcoded property names)

**Date**: 2026-05

**Context**: The dashboard could be coded type-by-type (a form per
character, a form per fruit) or driven by schema.

**Choice**: Schema-driven. The dashboard reads schema files and generates
forms dynamically. Application code knows nothing about specific properties
or types.

**Rationale**: Adding a new property must not require code changes.
Maintainability of the dashboard depends on this discipline.

**Consequences**: Higher upfront cost for the schema engine and form
generator. Massive reduction in long-term maintenance.

---

## ADR-001 — Stack: Bun + Turborepo + TanStack Start + Base UI + Tailwind v4

**Date**: 2026-05

**Context**: Numerous combinations are viable for a TypeScript monorepo
producing a dashboard and a future public app.

**Choice**: Bun (package manager, scripts, tests), Turborepo (orchestration),
TanStack Start (web framework for dashboard and preview), Base UI (headless
UI primitives), Tailwind CSS v4 (styling).

**Rationale**:

- Bun gives fast install and script execution; Node fallback where needed
- Turborepo's caching is best-in-class and integrates with Vercel
- TanStack Start gives end-to-end typed server functions, file-based
  routing, and TanStack Query out of the box
- Base UI is unstyled, accessible, and composes well with any styling
  layer
- Tailwind v4's CSS-first config (`@theme`) supports proper design tokens

**Consequences**: Some packages may need Node fallback (`better-sqlite3`,
heavy Octokit ecosystem). The team must be comfortable with TanStack
Start's relative novelty.

---

## Template for new entries

```
## ADR-XXX — Title

**Date**: YYYY-MM-DD

**Context**: What's the situation that requires a decision?

**Options**:
- A — Description
- B — Description

**Choice**: A.

**Rationale**: Why A?

**Consequences**: What follows from this choice?
```
