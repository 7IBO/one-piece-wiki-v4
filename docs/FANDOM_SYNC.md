# Fandom continuous sync (ADR-092)

How the wiki keeps up with onepiece.fandom.com after the one-shot
importers of ADR-079 and the sync registry of ADR-081. Two CLIs in
`packages/importers` make "keeping up with Fandom" a scheduled,
reviewable loop instead of ad-hoc re-imports:

1. **`fandom:analyze`** — full-wiki STRUCTURAL sweep: what categories
   and infobox templates exist over there, which fields they carry,
   and how all of it maps onto our schema catalogue and mappers.
2. **`fandom:updates`** — DATA delta detection: which already-imported
   pages changed, were renamed, or vanished since our last import.

Neither CLI writes wiki content. Both emit reports into
`packages/importers/reports/` (gitignored build artifacts). All
changes to `/data` still flow through the existing import → PR →
admin-queue path (ADR-079 §4).

## The loop

```
        STRUCTURE                              DATA
┌──────────────────────────┐      ┌────────────────────────────────┐
│ fandom:analyze           │      │ fandom:updates                 │
│  → fandom-analyze.json   │      │  → fandom-updates.json         │
│  → fandom-analyze.md     │      │    (the update queue)          │
└────────────┬─────────────┘      └───────────────┬────────────────┘
             │ diff vs. previous run              │ per queue entry
             ▼                                    ▼
  adjust schemas (DATA_MODEL first)     re-import via the existing
  and/or mappers; extend the            `import:fandom <kind> <page>`
  category/handled-param tables         flow → PR → admin queue
```

- **Structure**: run `fandom:analyze` periodically and diff the JSON
  report against the previous run. New infobox fields, new templates,
  or renamed categories on Fandom's side show up as report diffs. Act
  on gaps in schema-first order: new concepts go into
  `/docs/DATA_MODEL.md` and the schema catalogue before any mapper
  learns the field (CLAUDE.md rule).
- **Data**: run `fandom:updates` (e.g. on a CI schedule). Every
  `changed` entry is re-imported page-by-page through the existing
  `bun run import:fandom` flow, which ends in a labelled PR reviewed
  in the dashboard admin queue. `redirected` entries additionally
  need the ledger (`data/import/fandom-pages.json`) refreshed with the
  new canonical title + alias. `missing` entries are human calls
  (page deleted? renamed outside redirects?). **Nothing merges
  automatically.**

## `fandom:analyze`

```sh
bun run -F @onepiece-wiki/importers fandom:analyze \
  [--full]             # schema-campaign preset: 40 samples, no cap
  [--samples N]        # pages sampled per infobox (default 5)
  [--max-infoboxes N]  # cap for bounded/partial runs
  [--out DIR]          # default packages/importers/reports/
```

**Two depths, two purposes.** The default (5 samples) answers _does
this field still exist_ — enough to diff run-to-run and catch
Fandom-side drift. `--full` answers _what should the schema look like_:
40 samples per infobox, no template cap, which is what makes the value
profiles below statistically worth anything. Run `--full` once per
schema campaign, not on a schedule.

What it does, all through the polite rate-limited `FandomClient`
(1 req/s, UA-identified, response cache in `.cache/fandom/`):

1. `list=allcategories&acprop=size` (with continuation) — every
   category + member counts.
2. `list=allpages&apnamespace=10` (with continuation) — the whole
   Template namespace, filtered by name to infoboxes. **Why not
   `apprefix=Infobox`:** this wiki names its infoboxes with the local
   "* Box" convention (`Char Box`, `Chapter Box`, …), not MediaWiki's
   "Infobox *" convention, so a prefix query would miss every one of
   them. Both shapes are matched (`^Infobox…` or `…Box$`); `/doc`
   subpages are skipped.
3. Per infobox: one `list=embeddedin` batch (≤500 titles) as a capped
   popularity signal, then `action=parse` on the first N titles to
   inventory the infobox's fields with the existing wikitext parser —
   both their NAMES and their **value shapes** (`src/fandom/
   field-shape.ts`): fill rate, cardinality, max length, whether values
   are lists, and up to five real examples. The inferred shape
   (`number` / `date` / `wikilink` / `wikilink_list` / `template` /
   `enum_like` / `prose` / `text`) is what decides whether a field
   wants a property, a vocabulary or a relation — a name-only
   inventory cannot tell those apart. **Structure is read from the raw
   wikitext**, because `cleanValue` strips exactly the three signals
   that matter: `[[links]]`, `{{templates}}` and `<br>` separators.
4. Per infobox, the same sampled pages are surveyed OUTSIDE the
   infobox (`src/fandom/page-structure.ts`): section headings by
   frequency, **wikitable column signatures with row counts**, and
   `{{Qref}}` citation density. This is where most of the wiki's data
   actually lives — chapter and episode lists, cast tables,
   anime/manga differences, and the per-source anchors that fill the
   `since` axis and the appearance edges. An infobox-only inventory
   reports none of it.
5. Catalogue diff: entity types are loaded from
   `data/schemas/entity-types` + `data/universes/one-piece/schemas/
   entity-types`; each infobox field is marked `mapped` / `ignored` /
   `unmapped` against the mapper's exported handled-param list
   (`CHARACTER_HANDLED_PARAMS`, `CHAPTER_HANDLED_PARAMS`,
   `EPISODE_HANDLED_PARAMS` + `EPISODE_IGNORED_PARAMS`,
   `VOLUME_HANDLED_PARAMS`); each category is matched to an entity
   type via the maintained slug table (`CATEGORY_ENTITY_TYPES` in
   `src/fandom/analyze.ts`) with a singularised-slug fallback.

Output: `fandom-analyze.json` (machine-readable, diffable) and
`fandom-analyze.md` (summary — overview, field inventory with shapes
and examples, page structure, then gaps), each ending in an explicit
**gaps** section:

- unmapped infobox fields, sorted by occurrence (→ mapper backlog);
- categories with no entity type (→ modelling backlog / noise);
- entity types with no Fandom source found in this sweep (→ areas
  Fandom cannot feed; note a type whose infobox wasn't swept — e.g. a
  `--max-infoboxes` run — also lands here).

Exit codes: `0` on success, `1` on bad flags or any error (including
"Fandom unreachable").

### Running it from CI (the report loop)

The report is a gitignored build artifact, so a CI run would produce it
and throw it away — and a cloud Claude session cannot reach Fandom at
all (the sandbox proxy answers 403 CONNECT; CI runners have normal
egress). `.github/workflows/fandom-analyze.yml` closes that loop: on
`workflow_dispatch` it runs the `--full` sweep, writes into
`docs/audits/`, and **commits the report to an `audit/fandom-structure-
<run>` branch**. The runner does the looking; the commit is how it
reports back. Nothing is merged, and the workflow never touches
`/data`.

## `fandom:updates`

```sh
bun run -F @onepiece-wiki/importers fandom:updates [--out DIR]
```

Reads the ADR-081 ledger `data/import/fandom-pages.json`, queries
`action=query&prop=revisions&rvprop=ids|timestamp&redirects=1` in
batches of 50 titles, and emits `fandom-updates.json`:

```json
{
  "generatedAt": "…",
  "counts": { "unchanged": 0, "changed": 0, "redirected": 0, "missing": 0 },
  "entries": [
    {
      "pageTitle": "Monkey D. Luffy",
      "entityId": "character:luffy",
      "lastImportedRev": 100,
      "lastImportedAt": "…",
      "currentRev": 150,
      "currentAt": "…",
      "status": "changed"
    }
  ]
}
```

Statuses: `unchanged` (live revid ≤ imported revid), `changed` (moved
past it, or never imported), `redirected` (canonical title now
redirects — `redirectTarget` carries the new title), `missing` (page
gone). A human summary of every non-unchanged entry prints to stdout.

Exit codes: this is a reporting tool — a **successful run exits 0
regardless of the statuses found** (changed pages are work to queue,
not a failure). Bad flags or errors (e.g. no egress) exit `1`.

## Network / egress caveat

Both CLIs need egress to `onepiece.fandom.com`. **The cloud Claude
sandbox proxy denies it (CONNECT 403)**, so live runs happen locally
or on a CI runner with egress (ADR-079 §6). Without egress the CLIs
fail fast with a clear `Fandom unreachable: …` message instead of a
stack trace. All tests run on recorded/hand-crafted fixtures — zero
network.

## Licensing rules (ADR-079 §5 recap)

Fandom text is CC-BY-SA. We ingest **facts** (not copyrightable) into
structured JSON: infobox metadata, numbers, titles, source refs.
We do **not** commit Fandom prose (narratives are written fresh) and
we do **not** import Fandom image files (rights unclear — images go
through the upload flow with per-file licensing). The analyze/updates
reports contain only structural metadata (template/field/category
names, revision ids) and are gitignored build artifacts anyway.

## Extending

- **New mapper**: export its `*_INFOBOX_NAMES` + `*_HANDLED_PARAMS`
  (and `*_IGNORED_PARAMS` if it deliberately skips fields) and add it
  to `INFOBOX_MAPPERS` in `src/fandom/analyze.ts` and `BOX_TO_KIND`
  in `src/fandom/crawl.ts`. Keep the handled list in sync with the
  mapper's `get(...)` calls.
- **New category correspondence**: add a row to
  `CATEGORY_ENTITY_TYPES` in `src/fandom/analyze.ts` (data maintained
  in code — the report tells you which categories need it).
