# api-onepiece.com candidate import (ADR-101)

How the wiki bulk-seeds candidate data from
`https://api.api-onepiece.com/v2/<resource>/<locale>` (locales `en` /
`fr`). One CLI in `packages/importers` sweeps the API, maps every
record onto OUR entity shapes, and emits **candidate files** a
maintainer reviews before anything reaches `/data`:

```sh
bun run -F @onepiece-wiki/importers onepiece-api:import \
  [--resources characters,fruits,…]  # default: all supported
  [--locales en,fr]                  # default: both
  [--out DIR]                        # default packages/importers/candidates/
  [--dry-run]                        # print planned files, write nothing
```

The API is a **candidate pool**, never a source of truth (ADR-101):
its quality varies, its facts carry no chapter anchors, and records
matching an existing entity are **diffed in the report, never
overwritten**. All ADR-079 ingest rails apply — candidate data lands
via PRs only, `review_status: auto_imported`, nothing merges
automatically.

## What one run does

1. **Sweep** every requested resource in every requested locale
   through the polite client (~1 req/s, UA-identified, response cache
   in `.cache/onepiece-api/`).
2. **Pair** the EN and FR sweeps by API record id — one record pair
   becomes ONE entity plus per-locale translation sidecars.
3. **Map** defensively (dirty data expected: bounties like
   `"3.000.000.000"`, blank names, unparseable ordinals). Every API
   field is either handled by the mapper or listed in the report's
   **gaps** section — nothing is silently dropped.
4. **Match** each candidate against the existing corpus by normalized
   name/slug heuristics (slug, id slug, every EN/FR translated name;
   devil fruits also match without the "no Mi" suffix, crews without a
   leading "The"). Matches (Luffy, Gomu Gomu, Straw Hats…) produce a
   property-level **diff** in the report; only genuinely new records
   become candidate files.
5. **Write** candidates in the EXACT repo layout, plus the report:

```
packages/importers/candidates/            (gitignored)
├── data/universes/one-piece/
│   ├── entities/<type>/<slug>.json
│   └── translations/{en,fr}/<type>/<slug>.json
├── onepiece-api-import.report.json
└── onepiece-api-import.report.md
```

## Resource → entity mapping

| API resource | Our entity type           | Properties                                                                              | Relations                                                                                    |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `characters` | `character`               | name, status, bounty, age, height (`size`), occupation (`job`, exact vocabulary match)  | `member-of` (crew — leadership is `member-of{role}` only, ADR-099), `ate-fruit`              |
| `fruits`     | `devil-fruit` (+ `image`) | name (+ romanized), classification (`type`)                                             | `depicted-by` (from `filename` URL)                                                          |
| `crews`      | `crew`                    | name (+ romanized)                                                                      | — (`total_prime`, member `number`, `is_yonko` are derived/relational → report only, ADR-099) |
| `boats`      | `ship`                    | name (+ romanized), ship_type (vocabulary match)                                        | `crewed-by`                                                                                  |
| `chapters`   | `manga-chapter`           | number, title_key (EN+FR titles), released_at, page_count                               | `part-of-volume` (from `tome`)                                                               |
| `episodes`   | `anime-episode`           | number, title_key (EN+FR), released_at                                                  | `part-of-arc` (saga stays informational — it flows through the arc)                          |
| `tomes`      | `volume`                  | number, title_key (EN+FR), released_at (JP; FR release → report)                        | —                                                                                            |
| `sagas`      | `saga`                    | name, saga_number (chapter/volume/episode ranges → report; membership is edge-modelled) | —                                                                                            |
| `arcs`       | `arc`                     | name                                                                                    | `part-of-saga`                                                                               |
| `locates`    | `location`                | name, region (`sea`, vocabulary match)                                                  | — (`affiliation` stays a warning for the human pass)                                         |

Resources are swept in dependency order (fruits/crews/sagas… before
characters/boats/arcs…), so relation targets resolve against existing
entities **and** candidates created earlier in the same run (Bonney's
`member-of` finds the `crew:heart-pirates` candidate from the same
sweep).

**Anchors**: the API knows no chapters/episodes, so historisable
entries (bounty, status, edges) are emitted **without `since`** and
listed in the report's _unanchored_ section — `member-of.since` is
even schema-required, so those edges cannot merge until a human
anchors them. Nothing is guessed.

## Images: URL only (ADR-101 §2 — licensing note)

The maintainer's explicit experiment: image URLs from the API
(currently the fruit `filename`) become `image` **entities** that
hotlink the external URL — **no binary is ever downloaded or
re-hosted**:

- `url` — the external URL exactly as served;
- `license` — `unverified-external` (added to the `image-licenses`
  vocabulary for this purpose: externally hosted, licensing NOT
  verified);
- `attribution` — `api-onepiece.com`;
- `source_origin` — `other`;
- `spoiler_since` — the subject's earliest known anchor, else
  `manga-chapter:1` (flagged in the report — tighten during review);
- a `depicted-by{role: primary_portrait}` edge on the subject.

If the URL's format cannot be inferred from its extension the image is
skipped with a warning — required enums are never guessed. The
hotlink experiment is re-evaluated once rendering is seen; the R2
upload pipeline (`/docs/IMAGES.md`) remains the durable path. When a
matched EXISTING entity has an API image, the URL is reported as a
note on the diff — the corpus file is never touched.

## The report

`onepiece-api-import.report.json` (machine-readable) +
`…report.md` (human summary), with sections:

- **created** — new candidate ids + their files;
- **matchedDiff** — existing entity vs API candidate, property by
  property (nothing overwritten);
- **skipped** — unmappable/duplicate records with reasons;
- **gaps** — every unmapped API field with occurrence counts and an
  example value (mapper backlog — never silently dropped);
- **unanchored** — entries emitted without `since`;
- **informational** — facts deliberately not stored (crew
  `total_prime`/member counts, saga ranges, FR release dates…);
- **warnings** — everything else needing a human.

## Review → PR flow

1. Run the import (locally — see the egress caveat below).
2. Read `onepiece-api-import.report.md`; prune candidate files you
   don't want; fix unanchored entries you do want.
3. Move the keepers into the repo: `cp -r packages/importers/candidates/data/. data/`
4. Run the gauntlet: `bun run schema:check && bun run validate && bun run check:references && bun run check:coherence`
5. Commit on a branch and open a PR (label `import`) — the admin
   queue reviews it. **Nothing merges automatically.**

Exit codes: `0` on success (whatever the counts), `1` on bad flags or
any error (including "api-onepiece unreachable").

## Network / egress caveat

The CLI needs egress to `api.api-onepiece.com`. **The cloud Claude
sandbox proxy denies it (CONNECT 403, like Fandom)**, so live sweeps
run locally or on a CI runner with egress. Without egress the CLI
fails fast with a clear `api-onepiece unreachable: …` message instead
of a stack trace. All tests run on hand-crafted fixtures
(`packages/importers/__tests__/fixtures/onepiece-api/`) — zero
network.

## Extending

- **New resource**: add a mapper in
  `packages/importers/src/onepiece-api/` exporting its
  `*_HANDLED_FIELDS` list (every field you read — the gap report keys
  off it) and register it in `RESOURCE_MAPPERS` + `RESOURCE_ORDER`
  (dependency position matters) in `src/onepiece-api/import.ts`.
- **New vocabulary match**: load the index in
  `src/cli/import-onepiece-api.ts` and pass it under
  `vocabularies` — mappers resolve enum values by exact
  (case-insensitive) label/id match only.
- Schema-version constants (`*_SCHEMA_VERSION`) live next to each
  mapper — keep them in sync with the entity-type files.
