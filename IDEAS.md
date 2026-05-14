# Ideas

This file is a parking lot. Entries here are **NOT planned** for the
current roadmap. They are recorded so we don't lose the thinking, and
so we can promote them when scope and capacity allow.

**Do not implement anything from this file without first:**

1. Moving the entry into `/docs/ROADMAP.md` (a real phase, real tasks,
   real exit criteria), AND
2. Logging the decision in `/docs/DECISIONS.md` as a new ADR.

A reference from another doc to an entry here is a forward-pointer
("we'll do this someday"), not a green light.

---

## In-universe documents as first-class entities

Wanted posters, vivre cards, newspapers, letters, maps, photographs,
flags, manuscripts. Would become a new entity type `document` with
subtypes (`wanted-poster`, `vivre-card`, `newspaper`, …).

Enables queries like:

- "all wanted posters issued by the Marines"
- "all vivre cards currently held by Luffy"
- "the front page of the World Economic News Paper at chapter N"

**Migration path** (non-destructive): existing images depicting such
objects stay as `image` entities. A `document` entity is created per
object (e.g. `document:luffy-wanted-poster-30m`) and carries a
`depicted-by` relation to its image. Existing `depicted-by` relations
from people to the poster-image are rewired to the document entity
when they're "depicting the document" rather than "depicting the
person".

See ADR-011 for the deferral rationale. Detailed image-to-document
walkthrough at the bottom of `/docs/IMAGES.md`.

## Knowledge graph (per-character knowledge)

Already documented in `/docs/DATA_MODEL.md` § "Knowledge graph" as a
deferred concept. Each character carries a list of facts they have
learned, with when, from whom, and how. Enables a "perspective of
character X at chapter Y" reader mode — for example, what does Zoro
know about Sabo's survival at chapter 730?

Out of Phase 1 scope. Promote when the basic spoiler filter is
shipped and contributors are asking for finer-grained POV filtering.

## External attestation references

Wikipedia-style references to external evidence (Oda interview
transcripts, vivre card scans, fan databases) for facts that wouldn't
fit cleanly into the canonical-source model (chapters / episodes /
SBS / databooks).

Would add:

- a `reference` entity type (with url, accessed_at, type, …)
- an `attested_by` qualifier on historisable values pointing at a
  `reference`

Distinct from in-universe `source` (which always points at a
canonical entity). Useful for trivia like "Oda confirmed on Twitter
that character X is Y years old."

## Fan theories

A `theory` entity type with strict separation from confirmed facts.
Includes:

- `status` (active, debunked, partially_confirmed, abandoned)
- `proponent_attribution` (the original poster, the YouTuber, the
  reddit thread)
- `posits_relation` (the relation the theory asserts, in the same
  vocabulary as confirmed relations, but never folded into the main
  graph)

The risk is contamination — theories drifting into the canonical
graph. The separation must be enforced at the schema level, not just
in UI.

## Cross-media voice / live-action cast

`voice-cast` and `live-action-cast` entity types linking in-universe
characters to real-world performers and the productions they appear
in. Distinct from in-universe entities — they're meta-canon.

Phase considerations: when the live-action Netflix run becomes a
significant content stream and users want to read about
casting/production, this stops being trivia.

## Real-time collaborative editing

Yjs (or similar CRDT) for concurrent dashboard editing. The current
optimistic-locking-via-SHA approach (Phase 4) suffices while the
contributor count is small. Relevant when active editors exceed ~10
or when conflicts on the same entity become frequent.

Not architectural — the data model doesn't need to change. It's a UX
investment in `apps/dashboard`.
