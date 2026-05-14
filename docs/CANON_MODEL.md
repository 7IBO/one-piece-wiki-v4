# Canon Model

One Piece spans manga, anime, films, SBS, databooks, and live-action. Each
medium has different canonicity, and users want different levels of
inclusion. This document defines how the wiki represents canon scope and
filters by it.

## Canon scopes

Every source declares a `canon_scope` from the enum in
`/data/schemas/vocabulary/canon-scopes.json`:

| Value            | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `manga`          | Manga, Oda's hand. The hardest canon.                            |
| `anime`          | Anime adapting the manga; canon within its medium                |
| `anime_filler`   | Filler episodes; non-canon                                       |
| `film_canon`     | Films supervised by Oda (e.g. Strong World, Z, Stampede credits) |
| `film_non_canon` | Standalone films with no enforced canon link                     |
| `sbs`            | Question corners in volumes; canon for facts but non-narrative   |
| `databook`       | Vivre Card, One Piece Magazine, official guides                  |
| `live_action`    | Netflix adaptation and follow-ups; alternate canon               |
| `crossover`      | Toriko x One Piece etc.; explicitly non-canon                    |
| `video_game`     | Game-specific characters and events; non-canon by default        |

## How sources declare scope

A source entity carries `canon_scope` as a regular property:

```json
{
  "id": "film:one-piece-stampede",
  "type": "film",
  "properties": {
    "canon_scope": [
      { "value": "film_non_canon", "since": "film:one-piece-stampede" }
    ],
    "oda_supervised": [{ "value": true, "since": "film:one-piece-stampede" }],
    "canonical_elements": [{
      "value": ["bullet-character-design"],
      "since": "film:one-piece-stampede",
      "note": "Oda designed Bullet specifically for this film"
    }]
  }
}
```

## How derived facts inherit scope

When a value's `since` points to a source, the build pipeline tags the
value with that source's `canon_scope`. A value can have multiple scopes
if its sources span media.

Example: a character first appears in manga chapter 100, then in anime
episode 60. Both add to the appearance list with different scopes. If a
detail only exists in the anime version of a scene, it's tagged
`anime`.

For per-medium divergences (e.g. an anime-only scene), the entry carries
an explicit `canon_scope` qualifier overriding the source default. This is
rare and should be flagged in narratives.

## User configuration

Users opt into canon scopes via a preference (defaults: `manga`, `anime`,
`sbs`, `databook`).

The read path filters facts whose canon scope is not in the user's set.
Counter-intuitively, this is **additive**: a fact existing in `manga` is
always shown if `manga` is enabled, even if the user disabled `anime`,
unless the fact exists _only_ in anime.

## Anime-manga adaptation

Each `manga-chapter` carries an `adapted-by` relation to one or more
`anime-episode`s. Episodes carry `adapts` (the inverse).

When computing user progression, reachability is bidirectional:

- A user at `anime-episode:N` reaches every `manga-chapter:M` where
  `adapted-by(M) ⊆ {episodes 1..N}`
- A user at `manga-chapter:M` reaches every `anime-episode:N` that adapts
  only chapters `≤ M`

This is encoded in the build pipeline as a reachability graph
precomputed per checkpoint.

Important nuance: a single chapter is often split across multiple
episodes (and vice versa). The relation's `coverage` qualifier
distinguishes `full` from `partial`. Only `full`-covered chapters count
as "reached" through their episodes.

## Mixed canon entities

Some entities exist primarily in non-canon media but interact with the
canon. Modeling rules:

- Their primary entity file is in the canon universe with
  `primary_canon_scope` set to the strongest scope they have
- Properties specific to a non-canon scope carry a `canon_scope` qualifier
- A `concept_only_in: [...]` field can mark entities that exist only in
  certain scopes (filters them out when those scopes are disabled)

Example: Shiki (the Lion) is a `film_canon` character. His entity has
`primary_canon_scope: film_canon`. He won't appear in manga-only mode.

## Live-action

The Netflix adaptation is treated as its own canon timeline. Differences
from the manga (different events, different relationships, characters
who behave differently) are stored as their own historical entries with
`canon_scope: live_action`.

In practice, phase 1 does not aggressively model live-action divergences.
Sufficient to mark the live-action sources and let users filter them in
later phases.

## SBS and databook handling

SBS and databooks are sources of factual answers that don't fit into a
narrative slot. They're modeled as entities with a `published_at` and
attached to volumes/issues. Facts they reveal point to them as `source`.

Example: Luffy's blood type comes from SBS, not from a chapter. The
property entry has `source: "sbs:volume-46"`.

When a user filters out SBS, these facts disappear from their view; the
property may revert to "unknown" or to the next-best source.

## Retcons across canon

If a Vivre Card contradicts a manga fact, the manga wins (`retconned`
flag on the Vivre Card entry, kept for historical record). The build
pipeline does not auto-resolve; the editor makes the call.

If two SBS contradict each other, both entries are marked `disputed`
until Oda clarifies.

## Default user mode

Phase 1 ships with default scopes `[manga, anime, sbs, databook]` and a
visible toggle. Power users can switch to manga-only ("hardcore canon")
or include films.

## Reporting

The build pipeline can output a report of facts per canon scope, used in
the dashboard to show, e.g. "12 facts about Luffy come only from
databooks." This helps editors and curious readers.
