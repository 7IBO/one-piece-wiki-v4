# Schema-catalogue semantic-redundancy audit

**Scope**: every schema under `data/schemas/` and `data/universes/one-piece/schemas/`
(38 entity types, 105 property types, 71 relation types, 65 vocabularies, 28 qualifier
types), cross-checked against the 37 entities in `data/universes/one-piece/entities/`,
`docs/DATA_MODEL.md`, `docs/INVENTORY.md`, and ADR-033/034 (prefer-inferred inverse
cleanup), ADR-056/057/066/069 (prior dedup passes), ADR-045/077 (deliberate near-pairs),
ADR-085/088/090 (rule DSL), ADR-086 (materialized inverses), ADR-097 (incoming-edge
manager). Trigger example from the maintainer: `captained-by` on a crew duplicates the
members' `member-of{role: captain}` edges.

**Method**: for each entity type, its `allowed_relations` + properties were compared
against (1) other relations + qualifier values, (2) declared opposite-direction
relations, (3) properties whose value a relation (or aggregation of relations) already
expresses, (4) vocabularies encoding the same concept. Every finding lists the real
data on each side today (out of the 37 seed entities).

**Corpus usage baseline** (all relation edges in `/data` today):
`part-of-arc` 8 (all from manga-chapters), `member-of` 5 (all with `role`; 1 ×
`role: captain` — Luffy → Straw Hats), `depicted-by` 5, `participant` 3 (outcomes:
killed, survived, awakened), `family-of` 3, `occurs-during-arc` 2 (both from events),
`available-on` 2, `caused-death-of` 1, `ate-fruit` 1, `profiles` 1, `part-of-volume` 1.
Every other relation type: **0 edges**. Property side: `bounty` 9 entries,
`epithet` 9, `status` 10 (1 × dead, with `event`), `total_bounty` 0, `occupation` 0,
`held_rank` 0, `loyalty_status` 0, `first_source` 1 (document), `awakened` /
`awakening_outcome` 0, `person_roles` 0.

---

## Findings table (ordered by confidence)

| #   | Category                      | Overlap                                                                                                                                 | Real data today (per side)                                    | Recommendation                                                                       |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| R1  | rel ↔ rel+qualifier           | `captained-by` (crew→character) ≡ `member-of{role: captain}` inverse                                                                    | member-of side: 1 (Luffy); captained-by: 0                    | **(a) REMOVE** `captained-by`                                                        |
| R2  | rel ↔ rel+qualifier           | `caused-death-of` (event→character) ≡ `participant{outcome: killed}`                                                                    | **both sides live for the same fact** (Marineford/Ace: 1 + 1) | **(a) REMOVE** `caused-death-of`                                                     |
| R3  | overlapping from-types        | `part-of-arc` accepts `event` in `valid_from_types`, fully shadowing `occurs-during-arc` (event→arc)                                    | occurs-during-arc: 2; part-of-arc-from-event: 0               | **(a) REMOVE** `event` from `part-of-arc.valid_from_types`                           |
| V1  | prop ↔ vocab value            | `epithet` property ≡ `name{name_type: epithet}` (and `title` value in `name-types` ≡ `bears-title`)                                     | epithet property: 9; name_type epithet/title: 0               | **(a) REMOVE** `epithet` (and `title`) from `name-types` vocab                       |
| R4  | rel ↔ rel+qualifier           | `pilots` (character→ship) ≡ `member-of{role: helmsman}` + `crewed-by`; twin of `captains`                                               | 0 / 0                                                         | **(a) REMOVE** `pilots`                                                              |
| V2  | vocab value ↔ qualifier axis  | `loyalty-statuses.allied` ≡ an `ally-of` edge; `loyalty-statuses.former_member` ≡ `until` present                                       | 0 uses of either value                                        | **(a) REMOVE** `allied`; **(b)** rule for `former_member`⇒`until`                    |
| R5  | opposite-direction pair       | `held-by` (fruit→char/org/crew) vs `ate-fruit` (char→fruit) — possession vs consumption                                                 | ate-fruit: 1; held-by: 0                                      | **(c→b) KEEP** (ADR-077 semantics) + advisory rule (needs incoming-edge condition)   |
| V3  | vocab ↔ vocab on one relation | `crew-roles.captain` vs `marine-ranks.captain` — both reachable on the SAME `member-of` edge (`role` vs `held_rank`)                    | role: 5, held_rank: 0                                         | **(b) KEEP** + relation-scope rule: org membership uses `held_rank`, not crew `role` |
| R6  | rel ↔ rel+qualifier           | `led-by` (crew/org→character) vs `member-of{role/held_rank}`; also overlaps R1 for crews                                                | 0 / (member-of 5)                                             | **(b/a) maintainer taste** — keep for orgs + rule, or unify vocab and remove         |
| R7  | rel ↔ rel ordering            | `introduces-character` ≡ earliest `features` edge per character                                                                         | 0 / 0                                                         | **(a-lean) taste** — remove, derive at build (ADR-056 deferred this once)            |
| P1  | prop ↔ relation aggregation   | `total_bounty` (crew) ≡ Σ active members' `bounty` at each progression point                                                            | total_bounty: 0; bounty: 9                                    | **(a-lean) taste** — remove + derive in build, or keep + advisory                    |
| R8  | rel ↔ rel (vestigial)         | `awakening-of` (technique→fruit) superseded by ADR-058 `transformation{transformation_kind: awakening}` + `form-of`                     | 0 / 0                                                         | **(a-lean) taste** — remove (overturns ADR-058's "stays")                            |
| R9  | rel ↔ derivable union         | `features-characters` (arc→character) — bare edge ≡ ∪ `features` over the arc's chapters; only `role` (arc-roles) is non-derivable      | 0 / 0                                                         | **(c) KEEP**, make `role` required                                                   |
| P2  | prop ↔ relation               | `person_roles` ≡ aggregate of `role` qualifiers on `staffed-by`/`voiced-by`/`portrayed-by` edges                                        | 0 / 0                                                         | **(c) KEEP** (roles exist before credits do)                                         |
| P3  | prop ↔ relation               | `first_source`/`last_source` (event) vs earliest/latest `features`→event inverse                                                        | first_source: 1 (document), 0 events; features→event: 0       | **(c) KEEP** (spoiler anchor; corpus incomplete) — fix DATA_MODEL `spans` drift      |
| P4  | prop ↔ prop                   | `awakened` (bool) vs `awakening_outcome` (enum) on devil-fruit                                                                          | 0 / 0                                                         | **(b) KEEP** + advisory rule (outcome ⇒ awakened)                                    |
| V4  | vocab ↔ vocab                 | `loyalty-statuses` (member-of) vs `membership-statuses` (member-state-of) — two vocabularies for membership state                       | 0 / 0                                                         | **taste** — consolidate or document                                                  |
| V5  | vocab ↔ vocab ↔ prop          | `occupations` shares 7+ values with `crew-roles`; `occupation: pirate/marine` ≡ active `member-of`                                      | occupation: 0; roles: 5                                       | **(b) KEEP** + advisory rule                                                         |
| P5  | prop ↔ prop                   | `homepage_url` vs `url` (both string URLs)                                                                                              | 4 / 4                                                         | **(c) KEEP** (different semantics + historicity)                                     |
| P6  | structural echo               | wanted-poster `document` (`first_source`, `profiles`, `issued-by`) vs `bounty{issued_by, since}` entry                                  | both live for Luffy (bounty ch.96 + poster ch.96)             | **(c) KEEP** (fact vs artifact) + optional linking rule later                        |
| R10 | rel ↔ rel                     | `ruled-by` vs `controls-territory` (location↔org, opposite directions)                                                                  | 0 / 0                                                         | **(c) KEEP** — ADR-045 explicitly distinguishes rulership vs control                 |
| R11 | rel ↔ rel                     | `flies-flag` (crew/ship→image) vs `depicted-by` (crew/ship→image)                                                                       | 0 / 5                                                         | **(c) KEEP** — no `flag` value in depiction-roles, so no strict overlap (ADR-057)    |
| Q1  | qualifier registry            | one `role` qualifier id bound to **five** different enums (event/crew/arc/person/company-roles); registry entry hardcodes `event-roles` | role used on member-of (5), depicted-by (5), participant (2)  | **fix registry** — per-relation enum resolution, not a schema removal                |

---

## Detailed findings

### R1 — `captained-by` ≡ `member-of{role: captain}` (the trigger case) — REMOVE

`captained-by` (crew→character, since/until, `inverse_inferred: false`) says exactly what
a member's `member-of → crew` edge with `role: captain` says, on the other side of the
same edge. Today the only captaincy in the corpus is stored on the member side (Luffy →
`crew:straw-hat-pirates`, `role: captain`, since ch.1); `captained-by` has **zero**
edges. Every argument that once justified the dedicated relation has since been closed
by other ADRs:

- ADR-086: the artifact materializes the inverse of _every_ edge, so the crew page
  gets its incoming `member-of` members (with qualifiers, incl. `role`) for free.
- ADR-097: the incoming-edge manager lets the maintainer edit members _and their
  roles_ directly from the crew page — the editing-ergonomics argument is gone.
- ADR-057 already amputated `captained-by`'s ship leg for exactly this reason
  (duplicate of `captains.inverse`); the crew leg is the same disease.
- ADR-033/034 explicitly left `captained-by` "pending a call" — this is that call.

Divergence risk is real, not theoretical: a crew stating `captained-by → X` while its
members' edges say `role: captain` is Y is representable today and nothing flags it.
Note the rule DSL (entity scope `has_active_relation {type, target}`) **cannot** express
"captained-by target must equal some member's role=captain" — condition matching has no
qualifier predicate on the _other_ entity — so option (b) is not even implementable
without engine work. Removal is the only clean fix.

**Migration sketch** (beta directive, 0 users): `removeRelationType('captained-by')`
(same pattern as `0001-relation-dedup.ts`), drop from `crew.allowed_relations`, bump
`crew` schema_version. **No data rewrite** (0 edges). Log ADR; regenerate snapshot
(breaking diff accepted under beta). Crew captain rendering = incoming `member-of`
filtered on `role: captain` — the exception-tolerant ADR-091 web layer may bind that id.

### R2 — `caused-death-of` ≡ `participant{outcome: killed}` — REMOVE (both sides have live data)

`caused-death-of` (event→character, **no qualifiers at all** in the schema —
INVENTORY's "cause" qualifier is doc lag) is a strict subset of `participant`
(event→character/crew) with `outcome: killed` (`event-outcomes` has `killed`). This is
the **only finding where the same fact is stored on both sides today**:
`event:battle-of-marineford` carries `participant → ace {outcome: killed}` **and**
`caused-death-of → ace`, while `character:ace` carries the third copy —
`status: dead {since: 574, event: battle-of-marineford}`. Three encodings of one death;
if a wiki editor ever retcons one (One Piece fake-deaths make this likely), the others
silently diverge, and the DSL cannot cross-check two edges of the same entity.

The `status` property copy is **not** redundant — it is the epistemic/spoiler surface
(EPISTEMIC_MODEL; `death-needs-source-anchor` rule guards it) and a property, not a
relation. The redundancy is purely between the two event-side edges.

**Migration sketch**: rewrite each `caused-death-of → X` edge into
`participant → X {outcome: killed}` — merging qualifiers into an existing participant
edge for the same target if present (the Marineford case reduces to a pure deletion).
1 edge touched in the corpus. Remove type + `event.allowed_relations` entry, bump
`event` schema_version, ADR, snapshot. Optionally add an advisory entity-scope rule on
`character` later: `status: dead` entry with `event: E` expects E to hold a
`participant{outcome: killed}` edge (needs the incoming-edge condition — see R5).

### R3 — `part-of-arc` (from `event`) shadows `occurs-during-arc` — NARROW the from-list

`part-of-arc.valid_from_types = [manga-chapter, event, anime-episode]` and
`occurs-during-arc` = event→arc. An event→arc link is therefore expressible through
**two different relation types with different inverse labels** ("Chapters" vs
"Contains event"). ADR-033 deferred this as "genuinely two relations", but the fix is
not choosing one relation — it is removing the overlap in the from-lists. Data is
already disciplined: both events use `occurs-during-arc`, all 8 `part-of-arc` edges
come from chapters, zero from events.

**Migration sketch**: drop `"event"` from `part-of-arc.valid_from_types` (v bump);
`event.allowed_relations` already lists only `occurs-during-arc`, so no entity-type
change; no data rewrite (verified 0 event-sourced `part-of-arc` edges). Compat diff is
breaking-by-narrowing but touches nothing real.

### V1 — `epithet` property vs `name{name_type: epithet}` — REMOVE the vocab value

`name-types` (ADR-038 naming axes) contains `epithet` and `title`, so "Fire Fist" can
be stored either as an `epithet` entry (dedicated, recommended property — 9 real
entries incl. Luffy's attested "Straw Hat") or as a `name` entry with
`name_type: epithet` (0 real entries). Same for `title` vs the `title` entity +
`bears-title` relation. Two homes, no divergence guard, and the public layer would have
to check both. Since all real data sits on the dedicated property/relation side, the
cheap fix is removing the two vocab values (`epithet`, `title`) from `name-types`
(vocab-value removal, breaking in compat terms, zero data touched). Alternative —
migrating `epithet` into the name axes — is defensible but destroys a recommended
property with 9 live entries for no gain.

### R4 — `captains` vs `pilots` (character→ship twins) — REMOVE `pilots`

Two relation types with byte-identical shape (character→ship, since/until, historical).
`pilots` ("helms the ship") duplicates `member-of{role: helmsman}` (crew-roles has
`helmsman`) composed with `crewed-by` (ship→crew) — Jinbe is a Straw Hat helmsman, not
the holder of a parallel ship edge. `captains` has marginally more standing (a lone
character can captain a ship with no crew entity), but it too is `member-of{role:
captain}` + `crewed-by` in every real case. Both are 0-usage. Remove `pilots` now
(clear); `captains` can go in the same pass if the maintainer accepts that ship⇄people
always routes through the crew (my lean: remove both; keep `crewed-by` as the single
ship⇄group edge). Migration: `removeRelationType` ×1–2, drop from
`character.allowed_relations`, no data rewrite.

### V2 — `loyalty-statuses` values that re-encode other axes — TRIM

On `member-of`: `loyalty_status: allied` ≡ an `ally-of` edge (an ally is by definition
_not_ a member — the value invites encoding non-membership as membership);
`loyalty_status: former_member` ≡ `until` being set; `presumed_dead_member` ≡ the
member's `status: presumed_dead` (epistemic model's job). Zero uses of any of these
today. Recommend: remove `allied` (clear-cut); for `former_member`, keep the value but
add the divergence rule — expressible in the ADR-090 relation-scope DSL **today**:

```json
{
  "id": "former-member-needs-until",
  "schema_version": 1,
  "severity": "warning",
  "scope": "relation",
  "relation_type": "member-of",
  "relation_when": [
    {
      "qualifier_equals": {
        "qualifier": "loyalty_status",
        "value": "former_member"
      }
    }
  ],
  "relation_expect": [
    { "qualifier_present": { "qualifier": "until" } }
  ],
  "labels": {
    "en": "Former member without an end anchor",
    "fr": "Ancien membre sans borne de fin"
  },
  "messages": {
    "en": "`loyalty_status: former_member` says the membership ended, but `until` is missing — the edge still reads as ACTIVE to every consumer. Set `until` (the status value alone changes nothing).",
    "fr": "`loyalty_status: former_member` indique une adhésion terminée, mais `until` est absent — l'arête reste ACTIVE pour tous les consommateurs. Renseignez `until`."
  }
}
```

### R5 — `held-by` vs `ate-fruit` (held ≠ eaten) — KEEP, add a contradiction rule

These are opposite-direction relations over the same type pair (character⇄devil-fruit),
but ADR-077 created `held-by` deliberately: **possession of the physical fruit ≠ eating
it** (the Mera Mera: Ace's fruit regrows, is held as a Dressrosa prize, then eaten by
Sabo). The overlap is only apparent — _until_ someone records both an ACTIVE `held-by →
luffy` and an ACTIVE `ate-fruit → gomu-gomu`, which is a genuine contradiction (an
eaten fruit no longer exists as an object). Data today: `ate-fruit` 1, `held-by` 0.

Recommendation (b): keep both; add the advisory rule. **Caveat**: the two edges live on
different entities (`held-by` on the fruit, `ate-fruit` on the character), and the
entity-scope DSL has no incoming-edge condition. Either evaluate it in
`check:coherence` (which already reverse-scans) or add a small
`has_active_incoming_relation` condition — sketch, flagged as needing that extension:

```json
{
  "id": "eaten-fruit-not-concurrently-held",
  "universes": ["one-piece"],
  "severity": "warning",
  "applies_to_entity_types": ["devil-fruit"],
  "scope": "entity",
  "when": [{ "has_active_relation": { "type": "held-by" } }],
  "expect": [{ "no_active_incoming_relation": { "type": "ate-fruit" } }],
  "messages": {
    "en": "This fruit is HELD (active `held-by`) while someone actively ATE it — an eaten fruit no longer exists as an object. Close the `held-by` with `until` at the eating, or fix whichever edge is wrong."
  }
}
```

### V3 — `crew-roles.captain` vs `marine-ranks.captain` on the same `member-of` edge — KEEP + rule

`member-of` carries **both** `role` (enum `crew-roles`) and `held_rank` (enum
`marine-ranks`), and both vocabularies contain `captain`. A Marine captain (Smoker,
early) can be encoded as `role: captain` (wrong — that's the pirate-crew function
vocabulary: cook, sniper, shipwright…) or `held_rank: captain` (right, per ADR-044).
Nothing steers the editor. Also note `held_rank`'s enum is _Marines_-specific while
`member-of` targets any organization — Baroque Works numbers or Revolutionary Army
ranks have no home (future vocab work, out of scope here). Rule, expressible today
except for one missing expectation primitive (`qualifier_absent`, the relation-scope
mirror of the existing `property_absent` — trivial engine addition):

```json
{
  "id": "org-membership-uses-rank-not-crew-role",
  "universes": ["one-piece"],
  "severity": "warning",
  "scope": "relation",
  "relation_type": "member-of",
  "relation_when": [{ "target_type_is": { "type": "organization" } }],
  "relation_expect": [{ "qualifier_absent": { "qualifier": "role" } }],
  "messages": {
    "en": "`role` holds pirate-crew functions (cook, sniper…). For an organization membership, the position belongs in `held_rank`. Use `role` on organizations only when no rank applies."
  }
}
```

### R6 — `led-by` vs `member-of{role/held_rank}` (and vs R1) — maintainer taste

`led-by` (crew/org → character) is the organization-flavoured `captained-by`. The
catalogue currently splits one concept ("this group is led by X") three ways: crews
declare `captained-by` (R1), organizations declare `led-by`, and the member side says
it via `role: captain` / `held_rank: fleet_admiral`. Unlike R1, `led-by` covers a case
`member-of` cannot express today: `crew-roles` has no `leader` value and `marine-ranks`
fits only the Marines, so Dragon-leads-the-Revolutionary-Army has no member-side
encoding. Two coherent endgames — pick one:

- **(a) unify**: generalize `crew-roles` → `group-roles` (add `leader`), remove
  `led-by` _and_ `captained-by`; leadership is always a membership qualifier. Cleanest
  single-source-of-truth; requires accepting "a leader is always a member".
- **(b) keep** `led-by` as the leadership edge for organizations, remove only
  `captained-by` (R1), and add an advisory rule flagging a `led-by → X` whose X lacks
  an active `member-of` toward the group (needs the same incoming-edge condition as R5).

Zero `led-by` data today, so both are free. I lean (a) for one mechanism, but the "can
a non-member lead?" question (Im and the Gorosei?) is canon taste — the maintainer's call.

### R7 — `introduces-character` vs earliest `features` edge — taste, lean REMOVE

"Chapter 1 introduces Luffy" is derivable: the earliest source (by chapter/episode
order, per canon scope) holding a `features → luffy` edge _is_ the introduction.
ADR-069 already collapsed `references` into `features` on the argument that manner-of-
occurrence is a qualifier, not a relation kind; first-occurrence is not even a
qualifier — it is an ordering fact the build pipeline can compute. Zero usage on both
sides. Counter-argument (why ADR-056 deferred it): while the corpus is sparse, the
derived "first appearance" is wrong whenever earlier chapters simply have no data —
an explicit edge is robust to incompleteness. Decision rides on ingest confidence
(ADR-079/092 Fandom sync should make `features` coverage dense). If kept, at minimum
add the coherence check "introduces-character source must also hold (or imply) a
features edge for the same character".

### P1 — `total_bounty` (crew) vs Σ members' `bounty` — taste, lean REMOVE + derive

A crew's total bounty is, at every point of progression, the sum of the latest `bounty`
of its then-active members (via `member-of` inverse). All 9 bounty entries live on
characters; `total_bounty` has 0. Deriving it in the build (the ADR-034 backlog #5
inference engine is the natural home; the spoiler machinery already knows which bounty
entry is visible at chapter N) removes a value that would otherwise be perpetually
stale — the classic aggregate-cache smell. Counterpoint for keeping it: the derivation
needs per-progression-point evaluation (non-trivial), and official materials sometimes
_state_ a total (a citable fact, not a computation). If kept, it must at least gain an
advisory divergence rule — which the current DSL cannot express (cross-entity
aggregation), so "keep" really means "keep, unchecked". Hence the lean to remove.

### R8 — `awakening-of` (technique→devil-fruit) — vestigial after ADR-058, taste

Awakening now lives in the transformation model: Gear 5 is a `transformation`
(`transformation_kind: awakening`) linked `form-of → devil-fruit`, and the fruit carries
`awakened` / `awakening_outcome`. `awakening-of` predates that split (ADR-039) and
encodes the same fact as a _technique_-side edge; ADR-058 kept it explicitly, but with
`transformation`+`awakening` removed from `technique-types`, a technique that IS an
awakening is no longer even a modelable concept — the relation's domain evaporated.
Zero usage everywhere. Removing it needs the maintainer to overturn ADR-058's "stays",
hence taste; migration is a zero-touch `removeRelationType`.

### R9 — `features-characters` (arc→character) — KEEP, require `role`

The bare edge duplicates the union of `features` over the arc's chapters (derivable via
`part-of-arc` inverse). What is NOT derivable is the `role` qualifier (arc-roles:
protagonist/antagonist per arc — chapter-level `features` has no such axis). Keep the
relation but make `role` required, so the relation can only carry its non-redundant
payload; a role-less `features-characters` edge is pure duplication. One-line schema
change (`"required": true`), 0 data touched.

### P2 / P3 / P4 — property-vs-relation denormalizations — KEEP (with one rule)

- **`person_roles`** (P2): aggregates what `staffed-by{role}` / `voiced-by` /
  `portrayed-by` edges imply, but a person is a "composer" before any credited edge
  exists, and the property is the browse/filter surface. Keep; revisit when person data
  lands.
- **`first_source`/`last_source` on `event`** (P3): the span is in principle the
  min/max of chapters `features`-ing the event, but the property is the cheap spoiler
  anchor and robust to sparse `features` coverage. Keep. **Doc bug found**: DATA_MODEL's
  Marineford example shows a top-level `"spans": {...}` block including
  `primary_location` — a shape that matches no schema (and `primary_location` was
  removed by ADR-056). Fix the doc.
- **`awakened` vs `awakening_outcome`** (P4): the boolean is derivable-ish from the
  outcome (`successful`/`partial` ⇒ awakened). ADR-077 kept both deliberately (the
  boolean is the simple flag; outcome adds the Zoan-berserk mode). Keep + entry-scope
  advisory: an `awakening_outcome` entry on a fruit whose `awakened` is absent/false is
  divergent. (Expressible today as an entity-scope rule with `when:
  property_present(awakening_outcome)` / `expect: property_present(awakened)` if those
  primitives exist; else the entry-scope pattern of `death-needs-source-anchor`.)

### V4 — `loyalty-statuses` vs `membership-statuses` — taste, lean consolidate

Two vocabularies for "state of a membership": `loyalty-statuses` on `member-of`
(founder, member, former_member, traitor, undercover, allied, presumed_dead_member,
honorary) and `membership-statuses` on `member-state-of` (member, founding_member,
former_member, defected, erased, observer). Same concept, overlapping values with
_different spellings_ (`founder` vs `founding_member`), plus each duplicates the
`until`/`departure_reason` axes (`former_member`, `defected` ≈
`departure_reason: resigned/expelled`). Zero data on both. Options: merge into one
`membership-statuses` vocabulary shared by both relations (pick one spelling per
concept; keep genuinely domain-specific values like `undercover` vs `erased` in the
merged set), or keep both and accept the drift. Consolidation is a rename-values
migration with 0 data touched — cheap now, expensive after ingest.

### V5 — `occupations` vs `crew-roles` (and vs `member-of` itself) — KEEP + rule

Seven values are duplicated verbatim (navigator, cook, doctor, archaeologist,
shipwright, musician, sniper), so Nami can be `occupation: navigator` AND
`member-of{role: navigator}`; and `occupation: pirate` / `marine` restate the existence
of an active `member-of` toward a pirate crew / the Marines. The vocabularies still
earn their separation — occupation is crew-independent (a freelance doctor) and the
`active-marine-with-bounty` rule already leans on `member-of`, not occupation. Keep
both; add an advisory in the spirit of that rule, e.g. `occupation: marine` on a
character with no active `member-of → organization:marines` (and vice versa). Zero
occupation data today, so this is purely preventive.

### P5 / P6 / R10 / R11 — apparent overlaps that are fine (KEEP as-is)

- **`homepage_url` vs `url`** (P5): both string URLs, but `url` is the subject content
  itself (image binary, reference target — historised, required) while `homepage_url`
  is descriptive metadata on platforms/companies. Merging would force `historical` and
  requiredness compromises for zero gain.
- **Wanted-poster documents vs `bounty` entries** (P6): `document:luffy-first-wanted-poster`
  (first_source ch.96, profiles Luffy) structurally echoes Luffy's `bounty: 30M since
  ch.96`. Different layers: the bounty is the fact, the poster is an in-universe
  artifact (ADR-094) — a poster can exist for a wrong/outdated bounty (that's canon).
  A future advisory linking `issued-by` on the poster to the bounty's `issued_by`
  qualifier is a nice-to-have, not a dedup.
- **`ruled-by` vs `controls-territory`** (R10): opposite-direction location↔org pairs,
  but ADR-045 keeps them deliberately — Wano is _ruled by_ Orochi while _controlled by_
  the Beasts Pirates. Documented, distinct, keep. (Also not DSL-checkable across
  entities anyway.)
- **`flies-flag` vs `depicted-by`** (R11): both crew/ship→image, but `depiction-roles`
  has no flag value, so there is exactly one way to store a jolly roger (ADR-057 chose
  the relation over a `jolly_roger` property). No action — just never add a
  `flag`/`jolly_roger` value to `depiction-roles`.
- Checked clean, no meaningful overlap: `subordinate-to` vs `member-of` (group→group vs
  person→group, ADR-043), `crewed-by` vs `member-of` (ship⇄crew is its own domain),
  `member-state-of` vs `member-of` (location member ≠ person member), `born-in` /
  `resides-in` / `based-in` / `originates-from` (parallel by domain), `derived-from` vs
  `variant-of` (ADR-77 kept lineage vs sub-form), `granted-by` vs `issued-by`
  (title-institution vs document-issuer), `figurehead` (free-string carving
  description — no relation counterpart), `founded_at`/`disbanded_at` vs member `since`/
  `until` extrema (founding is a fact, not an aggregate), `caused-by-event` vs
  `part-of-event` (causality vs phase), `spoiler_since` vs `sourced-from` on image
  (anchor vs provenance; a derivation default at most).

### Q1 — the `role` qualifier id is five vocabularies wearing one trench coat

Not a redundancy but a catalogue inconsistency this audit must flag: the qualifier id
`role` resolves to `event-roles` on `participant`, `crew-roles` on `member-of`,
`arc-roles` on `features-characters`, `person-roles` on `staffed-by`, `company-roles`
on `produced-by`, `depiction-roles` on `depicted-by` — while the ADR-078 qualifier
registry entry (`data/schemas/qualifier-types/role.json`) hardcodes
`enum_ref: event-roles` and describes it as "the part played in the linked event".
Any consumer that trusts the registry over the per-relation declaration will render or
validate the wrong vocabulary for five of the six uses. Fix the registry (per-relation
enum resolution, or per-use registry entries); do not rename the relations' qualifiers.

---

## Prioritized action list

### Clear-cut — implement now (beta directive: 0 users, zero-or-one-edge migrations)

1. **Remove `captained-by`** (R1) — 0 edges; crew captains = `member-of{role: captain}`
   inverse; ADR-086/097 already deliver the read/edit surface. This closes the
   ADR-033/034 "pending a call" item the maintainer's trigger example reopened.
2. **Remove `caused-death-of`** (R2) — rewrite its 1 edge into the already-present
   `participant{outcome: killed}`; the only redundancy with live data on both sides.
3. **Drop `event` from `part-of-arc.valid_from_types`** (R3) — 0 event edges use it;
   `occurs-during-arc` is the single event→arc relation.
4. **Remove `pilots`** (R4) — 0 edges; ≡ `member-of{role: helmsman}` + `crewed-by`.
5. **Remove `epithet` + `title` from `name-types`** (V1) — 0 uses; the dedicated
   `epithet` property (9 entries) and `bears-title` are the single homes.
6. **Remove `allied` from `loyalty-statuses`** (V2) — an ally is an `ally-of` edge.
7. **Add the two DSL-expressible advisory rules**: `former-member-needs-until` (V2)
   and — after adding the trivial `qualifier_absent` expectation —
   `org-membership-uses-rank-not-crew-role` (V3).
8. **Fix the `role` qualifier registry entry** (Q1) and the DATA_MODEL `spans` doc
   drift (P3). Make `features-characters.role` required (R9).

All removals are `removeRelationType`/vocab-value migrations in the numbered runner
(ADR-070), one ADR covering the pass, snapshot regenerated (`check:compat` breaking
diffs accepted under beta), INVENTORY/DATA_MODEL updated in the same PR.

### Needs maintainer taste — propose, don't implement unilaterally

1. **`led-by` endgame** (R6): unify leadership into a widened `group-roles` vocabulary
   (and delete `led-by`), or keep it as the org-leadership edge with an advisory rule.
   Depends on "can a non-member lead a group?".
2. **`captains`** (R4bis): remove along with `pilots` (leadership routes through the
   crew) or keep for crew-less ship ownership.
3. **`introduces-character`** (R7): remove and derive from earliest `features` edge —
   gated on trusting ingest density (ADR-079/092); ADR-056 deferred it once already.
4. **`total_bounty`** (P1): remove + derive in the build inference engine (backlog #5)
   vs keep as a citable stated value. Note: "keep" is currently uncheckable by the DSL.
5. **`awakening-of`** (R8): vestigial after ADR-058's transformation model, but
   removing it overturns that ADR's explicit "stays".
6. **`loyalty-statuses` / `membership-statuses` merge** (V4): one membership-state
   vocabulary vs two drifting ones; also decide `vice_captain` vs `first_mate` inside
   `crew-roles` (near-synonyms in most crews — merge or document the distinction).
7. **Held-vs-eaten contradiction rule** (R5) and the other cross-entity advisories
   (occupation↔membership V5, status-dead↔participant-killed R2 companion): all want a
   `has_active_incoming_relation`-style condition — a small, general DSL extension
   worth one design decision rather than three ad-hoc checks in `check:coherence`.

**Net effect if the clear-cut list lands**: relation catalogue 71 → 68, two vocabularies
trimmed, one from-list narrowed, two new advisory rules, zero entity files rewritten
beyond one `caused-death-of` edge merge — and every remaining deliberate near-pair
(`held-by`/`ate-fruit`, `ruled-by`/`controls-territory`, `features-characters`,
denormalized properties) is either rule-guarded or documented here as intentionally kept.
