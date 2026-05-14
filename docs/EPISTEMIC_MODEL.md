# Epistemic Model

This deep dive explains how the wiki represents "what's true vs what
characters or the world believe is true" at any point in the story. It is
the mechanism that lets the wiki model false deaths (Sabo), hidden
identities (Lucy/Luffy, Mr. Prince/Sanji), reveals (Nika), retcons, and
disputed facts.

## The four axes

Every historisable value carries up to four axes of metadata beyond the
value itself:

1. **When** the value applies (`since`, optional `until`)
2. **Who believes it** — implicit in `epistemic_status` or explicit in
   `believed_by` / `known_truth_by`
3. **Whether it's true** — `epistemic_status`, optionally with
   `actual_value` for the real truth
4. **What event triggered it** — optional `event` reference

## Epistemic statuses

The enum lives in `/data/schemas/vocabulary/epistemic-statuses.json`. Full
semantics:

### `true`

The plain in-universe reality. Default for stable facts. No `actual_value`.

Example: Luffy's status is `alive` (since chapter 1, `epistemic_status: true`).

### `confirmed`

Explicitly stated and verified in-universe at this point. Used when an
earlier value was `believed` or `implied` and now becomes settled.

Example: Gomu Gomu's classification becomes `mythical-zoan` (since
chapter 1044, `epistemic_status: confirmed`, `event: nika-reveal`).

### `believed_by_world`

The general public, press, government, etc. believe this. The value may be
false; `actual_value` carries the real truth when known.

Example: Sabo's status is `presumed_dead` after the Mariejois incident
(since chapter 956, `epistemic_status: believed_by_world`,
`actual_value: alive`).

### `believed_by_characters`

Specific named characters believe this. Requires `believed_by` listing
their ids. Optionally `known_truth_by` lists characters who know the truth.

Example: Sabo's status is `presumed_dead` after the canon incident (since
chapter 585, `epistemic_status: believed_by_characters`,
`believed_by: [character:luffy, character:ace, character:dragon]`,
`known_truth_by: [character:dragon, character:ivankov]`,
`actual_value: alive`).

### `revealed_to_reader`

The reader now knows, but in-universe knowledge is not yet uniform. Used
for revelations to the audience that have not yet propagated in-universe.

Example: Sabo's survival is `revealed_to_reader` in chapter 731. Some
characters still don't know.

### `rumored`

In-universe rumor, not verified.

Example: "Pluton is at Wano" was rumored for years before becoming
confirmed.

### `implied`

Strongly suggested by the narrative but not made explicit.

Example: Luffy's identification as Joy Boy in chapter 1043 is `implied`
(via Zunesha's statement); becomes `confirmed` later by Vegapunk.

### `retconned`

An earlier value that has been replaced by a later reveal or correction.
Kept in the historical record for completeness. Always paired with
`superseded_by` pointing to the replacement.

Example: An early SBS giving Luffy's birthplace as `foosha-village` is
retconned by a later Vivre Card giving `goa-kingdom`.

### `disputed`

Multiple canon sources give contradictory values; no resolution yet.

Example: A character's age disagreeing between two SBS volumes.

## When to use which

```
Decision tree:

Is the value the in-universe reality, with no nuance?
  └── true

Was the value explicitly verified at this moment (after being uncertain)?
  └── confirmed

Is the value false, but believed by the general public?
  └── believed_by_world (with actual_value)

Is the value false, but believed by specific named characters?
  └── believed_by_characters (with believed_by, optional known_truth_by, actual_value)

Has the audience just been told something the characters don't fully know?
  └── revealed_to_reader

Is it just gossip in-universe?
  └── rumored

Is it strongly suggested but not stated?
  └── implied

Is it superseded by a later reveal?
  └── retconned (with superseded_by)

Do canon sources contradict each other?
  └── disputed
```

## Epistemic status vs review status

These are independent concepts. Conflating them is a frequent mistake.

| Concept            | Tracks                            | Lives in                 |
| ------------------ | --------------------------------- | ------------------------ |
| `epistemic_status` | In-universe truth of the value    | The fiction              |
| `review_status`    | Whether a human checked the entry | The contributor workflow |

`review_status` is **not an epistemic concept**. It does not affect what
the wiki claims to be true in-universe; it only tracks human attention
to the entry. A value can simultaneously be:

- `epistemic_status: "confirmed"` (in-universe truth: settled) and
  `review_status: "not_reviewed"` (no human has yet checked the data
  entry). The wiki asserts the truth; no editor has verified the
  assertion.
- `epistemic_status: "disputed"` (canon disagrees) and
  `review_status: "reviewed"` (a human has checked that the entry
  correctly reflects the canon dispute).

Spoiler filtering, narrative rendering, and inference rules read
`epistemic_status` and ignore `review_status` entirely. `review_status`
is read only by the dashboard's "needs attention" queue and by CI
gates.

See `/docs/DATA_MODEL.md` § "Provenance and review status" for the full
definition of `review_status` and its sibling qualifier `assisted_by`.

## Common patterns

### False death and reveal

```json
"status": [
  { "value": "alive", "since": "manga-chapter:1", "epistemic_status": "true" },
  {
    "value": "presumed_dead",
    "since": "manga-chapter:585",
    "epistemic_status": "believed_by_characters",
    "believed_by": ["character:luffy", "character:ace"],
    "known_truth_by": ["character:dragon", "character:ivankov"],
    "actual_value": "alive",
    "event": "event:sabo-canon-incident"
  },
  {
    "value": "alive",
    "since": "manga-chapter:731",
    "epistemic_status": "revealed_to_reader",
    "event": "event:sabo-reveals-self-to-luffy"
  }
]
```

### Reclassification by reveal

```json
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
```

### Retcon

```json
"birthplace": [
  { "value": "location:goa-kingdom", "since": "manga-chapter:1", "epistemic_status": "true" },
  {
    "value": "location:foosha-village",
    "since": "manga-chapter:1",
    "epistemic_status": "retconned",
    "superseded_by": "location:goa-kingdom",
    "source": "sbs:volume-4",
    "note_key": "retcon.luffy-birthplace"
  }
]
```

## Filtering for spoilers

The spoiler-aware read path evaluates each historisable value as follows:

```
For each property entry (sorted by `since` ascending):
  If user.progression >= entry.since:
    candidate := entry
  else:
    break

Return candidate (or the property's default if none qualifies)
```

For non-`true` statuses, the application chooses what to display based on
the user's mode:

- **strict mode**: show `value` as-is, do not surface `actual_value`
- **revealed mode**: when `epistemic_status` is `revealed_to_reader` or
  later confirmed, switch to the truth
- **show all**: ignore epistemic filtering, show everything with badges

## Filtering and POV (phase 2+)

When the knowledge graph is introduced, an additional axis is available:
"what does character X know at chapter Y?". This is computed from each
character's `knowledge` list intersected with the user's progression.

For now (phase 1), only the global epistemic axis is implemented.

## Inference rules

The build pipeline applies a small set of inferences:

1. **Public events propagate facts**: when an event is marked
   `public: true`, all participants and witnesses learn the facts the
   event reveals, unless the event is also marked `secret_from`.
2. **Death implies status change**: a `death` event subtype on an entity
   creates a `status: dead` entry on that entity at the event's source,
   unless the entry already exists.
3. **Reclassification by reveal**: a `revelation` event with a
   `reclassifies` qualifier updates the relevant property automatically.

These rules are best-effort and can always be overridden by explicit data
in the entity file (explicit always wins over inferred).

## Edge cases

### A character believes false information about themselves

Example: Brook believes he is the only Yomi Yomi user; he doesn't know
there are others. This is modeled at the property level on the knowledge
graph (phase 2+), not on the status of the fruit.

### A reveal is partial

Example: chapter 1043 _implies_ Luffy is Nika; chapter 1044 _confirms_ it
via the Gorosei. Two separate entries: `implied` then `confirmed`.

### A reveal in-universe that the reader already knew

Example: the reader knows Luffy = Joy Boy long before some characters do.
The reader-facing entry stays `revealed_to_reader`; in-universe knowledge
is tracked separately (phase 2+).

### Conflicting canon sources

Use `disputed`. Optionally add a `controversy` entity to surface the issue
on a dedicated page.

## Anti-patterns

- Using `true` for something that should be `confirmed` (loses the
  before/after distinction)
- Using `believed_by_world` without an `actual_value` (loses the real
  truth from the record)
- Inlining reveal logic in narrative prose only (loses queryability)
- Modeling a single character's incorrect belief as `believed_by_world`
  (overstates the scope)

## Operational guidance for editors

When a new chapter introduces a reveal, the editing workflow is:

1. Create the `event` entity for the reveal (`type: event`, appropriate
   `event_subtype`)
2. For each property of each entity affected:
   - Add a new historical entry with the post-reveal value and
     `epistemic_status: confirmed` or `revealed_to_reader`
   - If the previous entry was `believed_by_*`, set its `actual_value`
3. The build pipeline propagates the rest

The dashboard provides a "publish a reveal" wizard that scripts these
steps from a single form.
