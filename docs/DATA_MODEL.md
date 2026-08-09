# Data Model

This document defines the conceptual model. The formal schema specification
is in `/docs/SCHEMA_SPEC.md`; the deep dives on specific aspects are in
`/docs/EPISTEMIC_MODEL.md` and `/docs/CANON_MODEL.md`.

## The three primitives

Everything in the data layer reduces to three primitives. Every concept in
the wiki — characters, devil fruits, chapters, battles, locations — is
modeled with these three building blocks. There is no special case in the
data layer.

### 1. Entity types

A **declaration** of what kinds of things can exist. Examples: `character`,
`devil-fruit`, `crew`, `manga-chapter`, `event`, `arc`. Each entity type
declares which properties it accepts and which relations it can participate in.

Entity types live in `/data/schemas/entity-types/`.

#### Field importance tiers (ADR-083)

Every property declaration carries a three-level importance tier, in the
spirit of Wikipedia's infobox guidance:

- **`required: true`** — the entity is invalid without it. Enforced by the
  generated Zod schemas at every boundary.
- **`recommended: true`** — a _complete_ article of this type is expected to
  carry it, but its absence is never a validation error. Example: a
  `manga-chapter` without `released_at` is valid (the Chapter Box on the
  source wiki has no date) but incomplete.
- Neither flag — genuinely optional trivia (`blood_type`, `weight`).

`required` implies recommended; the two flags are never set together.
Entity types may also declare **`recommended_relations`** — the subset of
`allowed_relations` a complete article is expected to carry (e.g. a
`manga-chapter` should have `part-of-arc`, `part-of-volume` and at least one
`features`). `schema:check` rejects a `recommended_relations` entry that is
not in `allowed_relations`.

Consumers: the dashboard's completeness meter, the "recommended, still
empty" field state, and per-row completeness in entity lists. The tier is
advisory metadata — the validation pipeline never blocks on it.

#### Declarative coherence rules (ADR-085)

Beyond per-field validity, the schema layer carries **rules** —
declarative "this combination is usually wrong" knowledge, stored in
`/data/schemas/rules/` (core) and `/data/universes/<u>/schemas/rules/`
(universe-scoped):

- an ACTIVE Marine with a `bounty` (exception: Cross Guild bounties —
  set `issued_by`; or end the membership with `until`);
- two concurrent `ate-fruit` relations (exception: Blackbeard);
- `believed_by_world` without `actual_value`, `believed_by_characters`
  without `believed_by` (the EPISTEMIC_MODEL anti-patterns);
- `status: dead` without a `since` anchor (unspoilerable death);
- `until` preceding `since` on one entry.

A rule declares conditions (`when`, all must hold) and expectations
(`expect`, each violation is one finding) at entity scope, or
qualifier-level checks at entry scope. Findings are **advisory by
default** (`info`/`warning`) — One Piece canon is built on
exceptions, so a finding means "double-check or add the
distinguishing qualifier", never "invalid". The same engine
(`schema-engine/src/rules.ts`, browser-safe) runs in `check:coherence`
(CI, `RULE_FINDING` warnings) and live in the dashboard form (amber
advisory panel). Formal shape in `/docs/SCHEMA_SPEC.md` § Rules.

A rule may opt into `enforcement: "blocking"` (ADR-088) — reserved
for **structural impossibilities** where no canon exception can exist
(shipped example: `until` preceding `since` on the same numeric
source axis). Blocking findings render red in the dashboard, the
save/create endpoints refuse them (422 with the rule's localized
messages), and `check:coherence` reports them as errors. Canon
knowledge ("a Marine has no bounty") must never be blocking.

### 2. Entities

Instances of entity types. An entity has:

- A stable internal `id` (`type:slug`)
- A public `slug` (English, kebab-case)
- A bag of `properties` (each potentially historisable)
- A list of `relations` to other entities

Entities live in `/data/universes/<universe>/entities/<type>/<id>.json`.

### 3. Relations

Typed, qualified links between two entities. A relation has:

- A `type` (defined in `/data/schemas/relation-types/`)
- A `target` (the other entity)
- Optional `qualifiers` (role, since, until, epistemic_status, …)
- Optional historisation (the relation itself can change over time)

Relations are stored on the entity where they are most natural to edit (e.g.
`appears_in` on a chapter rather than on every character), and the build
pipeline generates the inverse automatically.

## Core concepts

The three primitives are bare. The richness of the model comes from a set of
cross-cutting concepts that any historisable value can carry.

### Historisation

Most properties are not single values but **arrays of timestamped values**.
The current value is implied by the latest entry whose `since` predates the
query date.

```json
"bounty": [
  { "value": 30000000,   "since": "manga-chapter:119"  },
  { "value": 100000000,  "since": "manga-chapter:432"  },
  { "value": 3000000000, "since": "manga-chapter:1053" }
]
```

Whether a property is historisable is declared in its property type definition
(`historical: true`).

### Epistemic status

Every value can be qualified by **what kind of truth it is** at the moment it
was published. This is the core mechanism that lets the wiki model false
beliefs, hidden identities, retcons, and reveals.

The full enum and its semantics are in `/docs/EPISTEMIC_MODEL.md`. Summary:

| Status                   | Meaning                                                |
| ------------------------ | ------------------------------------------------------ |
| `true`                   | This is the in-universe reality, plain and known       |
| `confirmed`              | Explicitly stated in canon at this point               |
| `believed_by_world`      | Public belief, possibly false; uses `actual_value`     |
| `believed_by_characters` | Specific characters believe this; uses `believed_by`   |
| `revealed_to_reader`     | The reader now knows; in-universe knowledge varies     |
| `rumored`                | Unverified in-universe rumor                           |
| `implied`                | Strongly suggested but not explicit                    |
| `retconned`              | Replaced by a later reveal; kept for historical record |
| `disputed`               | Sources disagree (e.g. SBS vs manga)                   |

When an entry has a non-`true` status that diverges from reality, it carries
an `actual_value` field referencing the real value.

### Epistemic status on relations

Links between entities can be just as epistemically loaded as property
values: a secret alliance, a double agent, a concealed parentage, a
disguise. Relations therefore carry the **same epistemic axis** as
historisable values, as a fixed set of **base qualifiers** the schema
engine provides on every relation (never declared per relation type):

| Qualifier          | Type         | Meaning                                               |
| ------------------ | ------------ | ----------------------------------------------------- |
| `epistemic_status` | enum         | What kind of truth this link is. Defaults to `true`.  |
| `believed_by`      | entity_ref[] | Characters who believe the link holds                 |
| `known_truth_by`   | entity_ref[] | Characters who know its real nature                   |
| `revealed_since`   | source_ref   | Source at which the link (or its truth) becomes known |

`revealed_since` is the relation counterpart of the reveal mechanism on
properties. It is distinct from `since` (when the link holds _in-universe_):
`since` anchors the relationship to the moment it begins; `revealed_since`
anchors the moment the reader/world learns of it.

A secret alliance formed off-page and exposed much later:

```json
{
  "type": "ally-of",
  "target": "organization:revolutionary-army",
  "qualifiers": {
    "since": "manga-chapter:1",
    "epistemic_status": "believed_by_characters",
    "known_truth_by": ["character:dragon", "character:ivankov"],
    "revealed_since": "manga-chapter:593"
  }
}
```

Because these are base qualifiers, a relation type MUST NOT declare them
in its own `qualifiers` (mirroring the property rule); `check:coherence`
flags a violation (`RELATION_DECLARES_BASE_QUALIFIER`). The build pipeline
exposes them as first-class columns on the `relations` table — and
propagates them to the generated inverse edge, since a hidden link is
equally hidden in both directions — so the read side can answer "who is
secretly allied with whom, as known at chapter N" without re-parsing the
qualifier blob. See `/docs/SCHEMA_SPEC.md` § "Relation base qualifiers".

### Sources and in-universe progression

Every dated value points to a **source entity**: a manga chapter, anime
episode, film, SBS volume, databook, etc. Sources are first-class entities,
not metadata.

Sources can be **nested for precision**: an `sbs` column (one per tankōbon,
linked to its `volume` via `part-of-volume`) contains atomic **`sbs-qa`**
entries — one question/answer pair each (`question_key` / `answer_key`,
optional `asker_pen_name` and `page`), attached to their column via `qa-of`.
An SBS-revealed fact (a birthday, a blood type) should cite the `sbs-qa`
entry when known, or the `sbs` column as the coarser fallback; both carry
`canon_scope` (typically `semi_canon`, see `/docs/CANON_MODEL.md`) and the
`clarifies-fact` relation (with its `property_name` qualifier) points from
the Q&A to the entity/property it settles. The same pattern covers databooks
(`databook` → `databook-card` via `card-of`).

The user's progression is a multi-dimensional cursor over sources:

```json
{
  "manga_chapter": 1043,
  "anime_episode": 1070,
  "films_seen": ["strong-world", "red"],
  "sbs_read_up_to": "sbs:volume-105"
}
```

Filtering for spoilers means evaluating, for each historisable value:
"is the `since` source reachable from the user's progression?" Sources have
cross-medium relations (`adapted_by`, `references`) so reaching `episode:1071`
implicitly reaches `chapter:1044` (and vice versa).

### Events

Significant in-universe occurrences are modeled as **entities of type
`event`**, not as ad-hoc fields. Examples: Battle of Marineford, Death of Ace,
Nika reveal, Luffy's bounty raise after Enies Lobby.

Events have:

- A subtype (`battle`, `death`, `presumed_death`, `recruitment`,
  `revelation`, `bounty_change`, `alliance_formed`, `awakening`, …)
- A span (`first_source`, `last_source`)
- A primary location (relation)
- Participants (relations, with role and outcome qualifiers)
- Optional **phases**: a long event decomposes into sub-events via
  `part-of-event` (child → parent, ordered by the `phase_order`
  qualifier), each phase carrying its own participants/location/outcome
  (ADR-076 — e.g. the Battle of Marineford's ordered phases)
- Effects (caused_death_of, set_up_event, …)
- An optional narrative key for prose summary

Properties on other entities can reference an event:

```json
"status": [
  {
    "value": "presumed_dead",
    "since": "manga-chapter:585",
    "epistemic_status": "believed_by_world",
    "actual_value": "alive",
    "event": "event:sabo-canon-incident"
  }
]
```

This binds the property change to the in-universe cause, making the data
self-documenting and queryable.

### Arcs and sagas

`arc` and `saga` are entity types representing **narrative containers** (not
in-universe occurrences). They are the primary navigation axis for users, as
on Fandom. Events occur within arcs; arcs belong to sagas.

### Canon scope

Every source declares its canon scope (`manga`, `anime`, `anime_filler`,
`film_canon`, `film_non_canon`, `sbs`, `databook`, `live_action`,
`crossover`, `video_game`). Every derived fact inherits a canon scope from
its source(s). Users configure which
scopes they accept.

Full detail in `/docs/CANON_MODEL.md`.

### Provenance and review status

The data model anticipates that not every value is hand-typed by a
human editor. A growing share is generated by AI agents (Claude Code,
scripts using the API, dashboard "Suggest" buttons) and reviewed
afterwards. Two orthogonal qualifiers track this.

**`assisted_by`** — optional string identifying the AI agent that
generated or last edited the value. Absent means the value was entered
by a human. When present, the format is
`"<model-family>-<version>-via-<surface>"`, e.g.
`"claude-opus-4.7-via-cc"`, `"claude-sonnet-4.6-via-api"`,
`"claude-opus-4.7-via-dashboard"`. Once a human reviews and confirms
the value, the `assisted_by` field is removed; subsequent provenance
lives in git history via the reviewing commit.

**`review_status`** — optional enum tracking human attention. Values
are defined in `/data/schemas/vocabulary/review-statuses.json`:

| Value           | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| `reviewed`      | A human has confirmed this value. Default for human edits. |
| `not_reviewed`  | Generated by AI; awaits human verification.                |
| `flagged`       | A human marked this as suspect; needs attention.           |
| `auto_imported` | Bulk-imported; not yet reviewed even cursorily.            |

These two qualifiers are **independent of `epistemic_status`**. A value
can carry `epistemic_status: "confirmed"` and
`review_status: "not_reviewed"` simultaneously — the data asserts an
in-universe truth that no human has verified the assertion of. Spoiler
filtering ignores both qualifiers; they exist for the contributor
workflow, not the reader.

See `/docs/EPISTEMIC_MODEL.md` § "Epistemic status vs review status"
for how the two axes differ.

### Per-item provenance on epistemic lists (ADR-096)

`believed_by` and `known_truth_by` list WHO holds a belief; sometimes
each holder's belief has its own on-page evidence. Items of these two
qualifiers therefore accept two forms:

```json
"believed_by": [
  "character:ace",
  { "target": "character:luffy", "source": "manga-chapter:585" }
]
```

The plain string is canonical when the item carries no provenance
(existing data unchanged); the object form cites the source depicting
THAT holder's belief. This mirrors the `since` string-or-list
authoring convenience. Consumers normalize through one shared helper
(`entityRefItems`), and the coherence layer counts both the targets
and the per-item sources. `attested_by` stays plain (its targets are
references — per-item sourcing is meaningless there).

### External attestation references (ADR-093)

Some facts don't come from a canonical source (chapter / episode /
SBS / databook) but from OUTSIDE the work: an Oda interview, the
official site, a social-media post, a printed-material scan. These are
modeled as **`reference` entities** (core type): `name`, `url`
(required), `reference_kind` (vocabulary `reference-kinds`:
interview, social_post, official_site, article, video, scan,
fan_database, other), optional `accessed_at` date.

Any historisable value can cite them through the **`attested_by`**
base qualifier (entity_ref list constrained to `reference:*`,
available on every entry like `believed_by`). `attested_by` is
orthogonal to `source`: `source` stays reserved for canonical
entities; a value attested only externally carries `attested_by`
without pretending an in-universe source exists. Spoiler filtering
ignores `attested_by` (external facts carry no in-universe
progression).

### In-universe documents (ADR-094)

Objects that exist as documents INSIDE the world — wanted posters,
vivre cards, newspapers, letters, maps, photographs, flags,
manuscripts — are first-class **`document` entities** (one-piece
scope): `name`, `document_kind` (vocabulary `document-kinds`),
optional `first_source` and `narrative_key`. Relations: `profiles`
(what/whom the document is about — a wanted poster profiles its
outlaw), `issued-by` (organization/crew/character that produced it),
`held-by` (current holder — a vivre card in someone's pocket), and
`depicted-by` (its image entities). The pre-existing images of such
objects stay `image` entities; the document entity carries the
in-universe identity and the images depict it (migration path per
IDEAS — non-destructive, rewire `depicted-by` when the depiction is
of the document rather than the person).

### Knowledge graph (deferred to phase 2+)

In addition to historisable property values, entities can carry an explicit
`knowledge` list: facts they have learned, with when, from whom, and how
certain they are. This enables the "perspective of character X at chapter Y"
mode.

```json
"knowledge": [
  { "fact": "fact:dragon-is-luffy-father", "learned_at": "manga-chapter:432", "learned_from": "character:garp" }
]
```

Facts are entities themselves. The knowledge graph is **not implemented in
phase 1** — `epistemic_status` is enough for now. It is documented here so
the model is anticipated and nothing forecloses it.

### Narratives

Prose summaries (1–3 paragraphs) describing events, arcs, and character
trajectories. They live in `/data/universes/<u>/narratives/<locale>/...`
and are referenced by key from entities and events.

Three levels:

1. **Entity overview**: 1 paragraph per entity per locale
2. **Event narrative**: 1–3 paragraphs per event per locale
3. **Entity-in-event narrative**: optional, per major participant of an event

Narratives use light Markdown and may include typed entity links via
`[[character:zoro]]` syntax, which the build pipeline turns into hyperlinks
and uses for cross-reference indexing and spoiler-on-prose filtering.

**File layout (normative).** One file per entity per locale:

```
/data/universes/<u>/narratives/<locale>/<entityType>/<fileBase>.md
```

where `<fileBase>` is the entity id's slug part — i.e. exactly the
basename of the entity's JSON file (`character:ace` → `entities/
character/ace.json` → `narratives/en/character/ace.md`). Narrative and
entity files therefore always pair up, including when the display slug
differs from the file base. Events and arcs are entities like any
other, so event narratives live at `narratives/<locale>/event/…` and
arc narratives at `narratives/<locale>/arc/…`; entity-in-event
narratives (level 3) have no file convention yet and will be specified
when implemented. An absent file simply means "no narrative yet for
this locale" — never commit empty `.md` files (the dashboard's
narrative editor deletes the file when the text is cleared).

Narratives are **content, not structure**: editing one never touches
entity JSON, and prose never lives inside entity files (see the
anti-patterns list in `/CLAUDE.md`). Keep them SHORT — one to three
paragraphs, far lighter than a Fandom article (maintainer guideline;
the dashboard enforces a hard 10k-character cap per locale).

Detailed in `/docs/I18N_STRATEGY.md`.

### Images

Images are **first-class entities of type `image`**, not strings on
other entities. This makes them reusable, individually spoiler-gated,
and tracked for licensing.

Other entities link to images via the `depicted-by` relation; the
build pipeline generates the inverse `depicts` direction automatically.
Each `depicted-by` instance carries qualifiers describing the
depiction — `role` (e.g. `primary_portrait`, `cover`,
`ability_illustration`), `period` (free-form, e.g. `east_blue`),
`context`, and an optional `since` source ref binding the depiction
to a specific in-universe moment.

```json
{
  "type": "depicted-by",
  "target": "image:luffy-bounty-3b",
  "qualifiers": {
    "role": "primary_portrait",
    "period": "post_wano",
    "since": "manga-chapter:1053"
  }
}
```

**Multiple images per entity.** Because `depicted-by` has
`allow_multiple_concurrent: true`, an entity carries as many image
relations as needed. A character's evolving wanted posters are
modelled as one `depicted-by` relation per poster, each with its own
`since` source ref. The current poster at any progression is the
latest `depicted-by` whose qualifier `since` is reachable.

**Reuse.** A single image can be linked from multiple entities — a
group photo of the Straw Hats depicts nine characters via nine
separate `depicted-by` relations, all pointing at the same image
entity.

**Spoiler gating.** Each image carries a required `spoiler_since`
property (a source ref) defining when the image itself becomes safe
to display. Combined with the relation's optional `since`, this gives
two filters:

1. `image.spoiler_since` — "is this image safe to show at all?"
2. relation `since` — "is this depiction contextually relevant?"

The read path applies both before rendering. A Gear 5 image
(`spoiler_since: "manga-chapter:1044"`) is hidden from anyone before
chapter 1044 regardless of which entity it appears on.

**Sources.** Every image carries a `sourced-from` relation to the
canonical source (chapter, episode, film, SBS, databook) it was
extracted from. This drives the spoiler reachability calculation and
preserves provenance for licensing review.

**Storage.** Image files live in **Cloudflare R2** under a flat
namespace: `images/<image-slug>.<format>`. The flat layout handles
reuse cleanly — an image with multiple depicted-by targets has no
single "owner" entity. The key convention is detailed in
`/docs/ARCHITECTURE.md` § "Deployment".

**Licensing.** Every image carries a `license` property
(`image-licenses` vocabulary) and a required `attribution` string. An
optional `source_origin` records where the image was obtained beyond
the canonical source — useful for permissioned fan art or licensor
attribution.

The full image-handling guide (upload workflow, accessibility,
captions, migration plan to documents) is in `/docs/IMAGES.md`.

**Deferred: in-universe documents.** Wanted posters, vivre cards,
newspapers, letters, maps, flags, and similar diegetic objects will
eventually become their own entity type (`document`) with subtypes,
enabling queries like "all wanted posters issued by the Marines" or
"all vivre cards held by Luffy". In Phase 1 they are modelled as
plain images (the wanted poster is an `image` entity, not a `document`
entity). The migration path is non-destructive — existing images that
depict such documents become `depicted-by` targets of the future
`document` entities. See `/IDEAS.md` for the detailed thinking and
ADR-011 for the deferral decision.

### Availability links

Source entities (`anime-episode`, `manga-chapter`, `volume`, `film`,
`live-action-series`, `live-action-episode`, `anime-special`) link to
where a real-world viewer can legally watch, read, or buy them via the
**`available-on` relation** to a reusable **`streaming-platform`**
entity (ADR-052 — the platform is a first-class node: "everything on
Crunchyroll" is a query). Despite its historical id,
`streaming-platform` is the **generic provider type** (ADR-087): its
labels are simply "Platform"/"Plateforme" and its `platform_kind`
(`platform-kinds` vocabulary: `streaming` / `reader` / `store`) covers
video streaming, online manga readers, and purchase storefronts alike —
Amazon, Crunchyroll, MANGA Plus and Netflix are all the same shape.
There is no separate "provider" entity type, and no new relation per
access mode: watching an episode, reading a chapter online, and buying
a volume are all `available-on` edges. This is **real-world presentation metadata,
not in-universe data** — it is exempt from spoiler filtering (a
streaming link reveals nothing about the story), though the source
page it lives on is still reachability-gated as usual.

Availability is **id-first** (ADR-084). Each `available-on` edge
preferably carries the platform's **stable external id** for the
product — an Amazon ASIN, a Crunchyroll episode id, a MANGA Plus title
id — via the `external_id` qualifier, plus the usual optional
`region` / `requires_subscription` / `subtitle_langs` / `dub_langs` /
`verified_at` qualifiers. The full URL is **generated, never stored
per edge**: the `streaming-platform` entity carries a `link_template`
property containing the literal placeholder `{id}` (e.g.
`https://www.amazon.fr/dp/{id}`), and the build pipeline / public app
produces the link with `template.replace('{id}', external_id)`.
Platform URL formats can change without touching thousands of edges —
one template edit regenerates every link.

The `url` qualifier remains for platforms without a usable template
(no predictable URL scheme). An edge may carry `external_id`, `url`,
or both (a stored `url` wins over generation when both are present);
at least one is expected — enforcing that is a `check:coherence`
follow-up (see ADR-084).

Distinct from `external_refs` (ADR-026), which holds stable
cross-_database_ identifiers (`tmdb_id`, `mal_id`) for data
reconciliation. `external_id` on `available-on` is a per-platform
_catalog/product_ id whose purpose is link generation and commerce.
Original rationale and platform vocabulary in ADR-028/ADR-052.

### Succession over time

Some links are not a single fact but a **succession**: the holder changes over
time, often when the previous one dies. A Devil Fruit reincarnates on its user's
death (the Mera Mera no Mi passed from Ace to Sabo; the Gomu Gomu / Hito Hito no
Mi, Model: Nika from Joy Boy to Luffy); weapons, titles, ships and leadership
move the same way. The model expresses this as **N historised relation entries**
(e.g. one `ate-fruit` per eater) each carrying `since` and `until` plus a
`succession_reason` qualifier; the **current holder is the latest entry whose
interval is still open**. Hidden successions (a secret heir) use the relation
epistemic axis (ADR-037). See ADR-039 and `/docs/DATA_EXPANSION_PLAN.md` § 1.3.

Devil fruits additionally carry a `zoan_model` (the open-ended model name, e.g.
"Nika", revealed independently of `classification`) and a `canonicity`
property (canon / anime-only / film-only / game-only / SBS / non-canon — a canon
tier orthogonal to spoiler progression). Awakened forms live in the
transformation model (a `transformation` entity with
`transformation_kind: awakening`, linked `form-of` → the fruit); the
former `awakening-of` relation was removed by ADR-099. The Nika reveal (ch.1044) flips a
fruit's `classification`, true `name` and `zoan_model` together — see
`/docs/EPISTEMIC_MODEL.md` § "Reclassification by reveal — the Nika case".

## Worked examples

### Character: Monkey D. Luffy (excerpt)

```json
{
  "$schema": "../../../../schemas/zod/entity-character.schema.json",
  "id": "character:luffy",
  "type": "character",
  "schema_version": 1,
  "slug": "monkey-d-luffy",
  "canonical_name_key": "character.luffy.name.canonical",
  "properties": {
    "name": [
      {
        "value_key": "character.luffy.name.short",
        "since": "manga-chapter:1",
        "name_type": "common"
      },
      {
        "value_key": "character.luffy.name.full",
        "since": "manga-chapter:100",
        "name_type": "full_name"
      }
    ],
    "epithet": [
      {
        "value_key": "character.luffy.epithet.straw-hat",
        "since": "manga-chapter:98",
        "given_by": "context:newspapers"
      }
    ],
    "bounty": [
      {
        "value": 30000000,
        "since": "manga-chapter:119",
        "source": "manga-chapter:119"
      },
      {
        "value": 100000000,
        "since": "manga-chapter:432",
        "source": "manga-chapter:432"
      },
      {
        "value": 300000000,
        "since": "manga-chapter:601",
        "source": "manga-chapter:601"
      },
      {
        "value": 400000000,
        "since": "manga-chapter:801",
        "source": "manga-chapter:801"
      },
      {
        "value": 500000000,
        "since": "manga-chapter:801",
        "source": "manga-chapter:801"
      },
      {
        "value": 1500000000,
        "since": "manga-chapter:903",
        "source": "manga-chapter:903"
      },
      {
        "value": 3000000000,
        "since": "manga-chapter:1053",
        "source": "manga-chapter:1053"
      }
    ],
    "status": [
      { "value": "alive", "since": "manga-chapter:1" }
    ]
  },
  "relations": [
    {
      "type": "member-of",
      "target": "crew:straw-hat-pirates",
      "qualifiers": {
        "role": "captain",
        "since": "manga-chapter:1",
        "loyalty_status": "founder"
      }
    },
    {
      "type": "ate-fruit",
      "target": "devil-fruit:gomu-gomu",
      "qualifiers": {
        "since": "manga-chapter:1"
      }
    },
    {
      "type": "family-of",
      "target": "character:dragon",
      "qualifiers": {
        "relation_kind": "father",
        "known_publicly_since": "manga-chapter:432"
      }
    },
    {
      "type": "bears-title",
      "target": "title:joy-boy",
      "qualifiers": {
        "since": "manga-chapter:1043",
        "epistemic_status": "implied"
      }
    }
  ]
}
```

### Devil Fruit: Gomu Gomu no Mi

```json
{
  "$schema": "../../../../schemas/zod/entity-devil-fruit.schema.json",
  "id": "devil-fruit:gomu-gomu",
  "type": "devil-fruit",
  "schema_version": 1,
  "slug": "gomu-gomu-no-mi",
  "properties": {
    "name": [
      {
        "value_key": "devil-fruit.gomu-gomu.name.common",
        "since": "manga-chapter:1",
        "name_type": "common"
      },
      {
        "value_key": "devil-fruit.gomu-gomu.name.true",
        "since": "manga-chapter:1044",
        "name_type": "true_name",
        "epistemic_status": "revealed_to_reader",
        "event": "event:nika-reveal"
      }
    ],
    "classification": [
      {
        "value": "paramecia",
        "since": "manga-chapter:1",
        "epistemic_status": "believed_by_world",
        "actual_value": "mythical-zoan"
      },
      {
        "value": "mythical-zoan",
        "since": "manga-chapter:1044",
        "epistemic_status": "confirmed",
        "event": "event:nika-reveal"
      }
    ]
  },
  "relations": [
    {
      "type": "eaten-by",
      "target": "character:joy-boy-original",
      "qualifiers": {
        "during_period": "void_century",
        "epistemic_status": "confirmed"
      }
    },
    {
      "type": "eaten-by",
      "target": "character:luffy",
      "qualifiers": {
        "since": "manga-chapter:1"
      }
    }
  ]
}
```

### Manga chapter: 1044 (excerpt)

```json
{
  "id": "manga-chapter:1044",
  "type": "manga-chapter",
  "schema_version": 1,
  "slug": "chapter-1044",
  "properties": {
    "number": [{ "value": 1044, "since": "manga-chapter:1044" }],
    "title_key": [
      { "value": "manga-chapter.1044.title", "since": "manga-chapter:1044" }
    ],
    "released_at": [
      {
        "value": "2022-03-07",
        "territory": "jp",
        "since": "manga-chapter:1044"
      }
    ],
    "canon_scope": [{ "value": "manga", "since": "manga-chapter:1044" }]
  },
  "relations": [
    { "type": "part-of-arc", "target": "arc:wano" },
    { "type": "part-of-volume", "target": "volume:104" },
    {
      "type": "adapted-by",
      "target": "anime-episode:1071",
      "qualifiers": { "coverage": "full" }
    },
    {
      "type": "features",
      "target": "character:luffy",
      "qualifiers": { "appearance_type": "full" }
    },
    {
      "type": "features",
      "target": "devil-fruit:gomu-gomu",
      "qualifiers": {
        "appearance_type": "revelation",
        "event": "event:nika-reveal"
      }
    }
  ]
}
```

### Event: Battle of Marineford (excerpt)

```json
{
  "id": "event:battle-of-marineford",
  "type": "event",
  "schema_version": 1,
  "slug": "battle-of-marineford",
  "properties": {
    "event_subtype": [{ "value": "battle", "since": "manga-chapter:550" }],
    "narrative_key": [
      {
        "value": "event.battle-of-marineford.summary",
        "since": "manga-chapter:550"
      }
    ],
    "first_source": { "value": "manga-chapter:550" },
    "last_source": { "value": "manga-chapter:580" }
  },
  "relations": [
    { "type": "occurs-during-arc", "target": "arc:marineford" },
    { "type": "set-in", "target": "location:marineford" },
    {
      "type": "participant",
      "target": "character:luffy",
      "qualifiers": {
        "side": "whitebeard-allies",
        "role": "rescuer",
        "outcome": "survived"
      }
    },
    {
      "type": "participant",
      "target": "character:ace",
      "qualifiers": { "side": "captive", "outcome": "killed" }
    },
    {
      "type": "participant",
      "target": "character:whitebeard",
      "qualifiers": {
        "side": "whitebeard-allies",
        "role": "leader",
        "outcome": "killed"
      }
    },
    {
      "type": "participant",
      "target": "character:akainu",
      "qualifiers": {
        "side": "marines",
        "role": "admiral",
        "notable_action": "killed-ace"
      }
    }
  ]
}
```

## Appearance types

Relations of type `features` (chapter → entity) and `appears_in` (entity →
chapter, generated as the inverse) carry an `appearance_type` qualifier. Full
enumeration:

| Value           | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| `full`          | The entity appears identifiable and present            |
| `silhouette`    | Visible but unidentifiable on purpose                  |
| `partial`       | A hand, an eye, a back of the head                     |
| `mentioned`     | Named but not visually present                         |
| `named_only`    | Name spoken without visual                             |
| `flashback`     | Appears in a flashback                                 |
| `cover_story`   | Appears in the volume cover story (parallel narrative) |
| `recap`         | Appears in a recap page                                |
| `vision`        | Hallucination, prophecy, dream sequence                |
| `photograph`    | On a wanted poster, vivre card, news clipping          |
| `portrait`      | Painting, statue                                       |
| `corpse`        | Already dead in the appearance                         |
| `imagined`      | Someone imagining them                                 |
| `narrator_only` | Mentioned by the narrator without character or visual  |

Plus orthogonal flags:

- `is_first_appearance: true` — first appearance of any kind
- `is_first_full: true` — first identifiable appearance
- `identity_revealed: false` — visual present but not yet known to be them

## Name types

Names are historisable with a `name_type` qualifier:

| Value             | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `common`          | Everyday name used by most                          |
| `full_name`       | Full legal name                                     |
| `true_name`       | Original/hidden name revealed late                  |
| `epithet`         | Press/world title ("Straw Hat", "Pirate Hunter")    |
| `nickname`        | Used by close ones                                  |
| `alias`           | Active disguise / pseudonym                         |
| `codename`        | Used inside an organisation                         |
| `title`           | Held title ("Fifth Emperor")                        |
| `insult`          | Used by enemies                                     |
| `honorific`       | Cultural address ("Luffy-Taro", "Luffy-Sama")       |
| `mistranslation`  | Variant from a specific translation edition         |
| `native_script`   | Original Japanese (kanji/kana), e.g. `ゴムゴムの実` |
| `romanized`       | Hepburn romanization, e.g. `Gomu Gomu no Mi`        |
| `literal_meaning` | English/French gloss, e.g. "Gum-Gum"                |

Each name entry can carry `given_by` (who calls them this) and `context`
(where, e.g. `dressrosa-coliseum`).

## Slugs and IDs

- **ID**: `type:slug` form. Internal, immutable, never in URLs.
  Example: `character:luffy`, `manga-chapter:1044`.
- **Slug**: kebab-case, English, public, mutable. Used in URLs.
  Example: `monkey-d-luffy`, `chapter-1044`.
- **slug_history**: list of previous slugs that map to the current entity,
  used to generate 301 redirects in the public app.

The two are distinct because:

- IDs are referenced from thousands of other files; changing them is
  catastrophic.
- Slugs are user-facing; corrections, disambiguations and renames happen.

## Entity types (phase 1 inventory)

These are the entity types in scope for phase 1. New types are added by
creating a schema file; no code changes.

- `character`
- `devil-fruit`
- `crew`
- `organization`
- `location`
- `technique`
- `weapon`
- `ship`
- `race`
- `manga-chapter`
- `anime-episode`
- `film`
- `arc`
- `saga`
- `event`
- `sbs`
- `databook`
- `title` (for inherited identities like Joy Boy)
- `concept` (for mythological figures like Nika)
- `image`

Each type's properties and relations are declared in its
`/data/schemas/entity-types/<type>.json` file. See `/docs/SCHEMA_SPEC.md`.

## What lives where

| Content                        | Location                                            |
| ------------------------------ | --------------------------------------------------- |
| Entity definitions             | `/data/universes/<u>/entities/<type>/<id>.json`     |
| Property values, dates, status | Inside entity files                                 |
| Localized names, descriptions  | `/data/universes/<u>/translations/<locale>/...json` |
| Prose summaries                | `/data/universes/<u>/narratives/<locale>/...md`     |
| What types exist               | `/data/schemas/entity-types/`                       |
| What properties exist          | `/data/schemas/property-types/`                     |
| What relations exist           | `/data/schemas/relation-types/`                     |
| Enum values (haki types, etc.) | `/data/schemas/vocabulary/`                         |

## What the data model intentionally does not capture

- **Reader emotion and authorial intent**: these belong in narratives, not
  in structured fields.
- **Fan theories and speculation**: out of scope in phase 1; may be added
  with strict separation under a `theory` entity type later.
- **Real-world publication metadata beyond essentials**: editor, artist
  assistants, sales numbers. Possibly added later.

## Migration to new entity types

Adding a new entity type or property is a pure data operation:

1. Create or edit the schema file
2. Generate updated Zod (`bun run schema:generate`)
3. If existing entities need new fields, write a migration in
   `/data/migrations/` (one PR, scripted)
4. Commit, PR, review, merge

No application code changes for these operations. This is the test of
maintainability and the invariant the codebase must preserve.
