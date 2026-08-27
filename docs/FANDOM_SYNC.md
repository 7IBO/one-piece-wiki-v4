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
   `src/fandom/analyze.ts`) with a singularised-slug fallback. Since
   ADR-109 ten templates are marked: Chapter / Char / Episode / Volume
   Box plus Devil Fruit / Crew / Ship / Organization / Weapon / Arc
   Box.

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

## L'ordre d'import : les sources avant les sujets

**Constat du premier passage live** (2026-08-27, catégorie `Devil Fruits`,
60 pages). Le crawl a réussi en 75 secondes et les six mappers d'ADR-109
ont produit des entités correctes — `name`, `classification`,
`zoan_model`, chacune avec son ancre `since`. C'est `check:references`
qui a arrêté le run : **138 erreurs de référence**, toutes de la même
forme :

```
[ENTITY_REFERENCE_NOT_FOUND] devil-fruit:hie-hie-no-mi → manga-chapter:303
  at properties.name[0].since
```

Rien n'est cassé dans les mappers. Le corpus ne contenait que 34
chapitres, et chaque `since` produit pointe un chapitre qui n'existe pas
encore.

**La règle qui en découle**, et qui n'était écrite nulle part :

> Les **sources** — chapitres, épisodes, volumes, films — doivent être
> importées **avant** les entités qui s'y ancrent. Tout l'axe `since`
> repose sur elles ; importer un sujet avant ses sources produit un
> corpus qui ne valide pas.

Un fruit apparu dans un épisode filler (`devil-fruit:hiso-hiso-no-mi →
anime-episode:54`) exige donc aussi les épisodes, pas seulement les
chapitres.

### Les noms de catégories ne se devinent pas

**Deuxième constat du 2026-08-27.** Un run sur `Chapters` a rendu
`category "Chapters": 0 page(s)` en zéro seconde, sans erreur. La
catégorie **n'existe pas** : MediaWiki répond une liste vide pour une
catégorie inexistante, exactement comme pour une catégorie vide. L'échec
est donc **silencieux**, et l'exemple donné par le workflow lui-même
(`e.g. Chapters, Humans`) était faux depuis le début.

Le relevé de structure (`docs/audits/fandom-structure-*.json`, 2 641
catégories réelles) fait autorité. Les noms utiles :

| Type visé       | Catégorie réelle         | Pages | Sous-cat. |
| --------------- | ------------------------ | ----: | --------: |
| `manga-chapter` | **`One Piece Chapters`** |     0 |         5 |
| `anime-episode` | **`Episodes`**           |     0 |         8 |
| `character`     | **`Characters`**         |     0 |        12 |
| `character`     | `Humans`                 |  1051 |         4 |
| `devil-fruit`   | `Devil Fruits`           |     6 |         7 |
| `crew`          | `Pirate Crews`           |     8 |         4 |
| `arc`           | `Story Arcs`             |    34 |         1 |
| `volume`        | `One Piece Volumes`      |   116 |         1 |
| `location`      | `Locations`              |     4 |        21 |

**La colonne « Pages » explique la profondeur.** La plupart des
catégories utiles ne contiennent **aucune page en direct** : tout est
dans les sous-catégories. `One Piece Chapters` en a cinq, `Episodes`
huit, `Locations` vingt et une. Sous la profondeur nécessaire, le crawl
renvoie 0 sans rien dire — d'où `depth` par défaut à 3.

Trois types n'ont **aucune catégorie rattachée** dans le relevé :
`saga`, `organization`, `technique`. Ils devront être peuplés autrement
(depuis les pages qui les référencent, ou à la main).

### Ordre recommandé

1. `Chapters` — l'ancre de presque tout
2. `Episodes` — pour les entités anime-only
3. `Volumes`, `Movies` si nécessaires
4. puis les sujets : `Devil Fruits`, `Humans`, `Crews`, …

### La frontière : `--skip-known` et le registre

`skip_known` s'appuie sur `data/import/fandom-pages.json`, **commité par
la PR d'import**.

Jusqu'au 2026-08-27 ce registre était **lu et jamais écrit** : trois
entrées face à 881 entités importées. `--skip-known` ne sautait donc
rien, et chaque run borné refetchait les mêmes `limit` premières pages
de la catégorie — la frontière était un no-op, et l'intention (« deux
runs successifs avancent ») n'était vraie que dans le commentaire du
code. Tout run qui **stage** réécrit désormais le registre
(`recordImports`), avec le `revid` de la révision effectivement lue.

Deux conséquences opérationnelles :

- **Une PR à la fois.** Le registre n'avance qu'une fois la PR d'import
  mergée. Deux runs lancés avant repartent du même point et se marchent
  dessus.
- **Le premier run d'une catégorie déjà partiellement importée se
  lance SANS `skip_known`.** Les 406 chapitres et 400 épisodes déjà au
  corpus ne sont pas au registre : un premier passage les remappe (les
  fichiers d'entité existants ne sont jamais écrasés, cf. `emit.ts`) et
  les **inscrit**, ce qui donne au registre de vraies `pageId` et
  `lastRevId` plutôt qu'une provenance reconstituée. Les runs suivants
  passent `skip_known` et avancent.

Une entrée est écrite même quand le fichier d'entité a été **sauté
parce qu'il existait déjà** : c'est exactement ce que ce saut veut dire
— « cette page est importée » — et le registre est la seule mémoire de
ce fait (aucun fichier d'entité ne porte sa provenance Fandom).

## Le pont arc → chapitres n'existe pas dans le wikitext

Relevé du 2026-08-27 (`docs/audits/fandom-structure-2026-08-27.json`,
25 pages échantillonnées par gabarit — la profondeur des formes, pas le
nombre de transclusions).

J'avais lancé l'import des arcs en annonçant qu'il débloquerait le
dialogue de progression. Il ne l'a pas fait : 5 `since` sur 51, 0
`arc_number`, 0 relation. Le relevé dit **pourquoi**, et ce n'est pas
un défaut du mapper.

`Arc Box` porte bien les trois champs qu'il faudrait :

| champ     | remplissage | valeurs distinctes / 25 |
| --------- | ----------- | ----------------------- |
| `episode` | 0,92        | **3**                   |
| `chapter` | 0,72        | **4**                   |
| `vol`     | 0,72        | **3**                   |

Trois valeurs distinctes sur vingt-cinq arcs, et les exemples les
nomment : `64-67, 4 episodes`, `-, episodes`, **`auto`**. Comparaison
qui tranche : `Volume Box.chapters` affiche **25 distinctes sur 25**
(`100 - 108`, `109 - 117`). Quand une plage est réellement écrite dans
le wikitext, chaque page a la sienne.

Autrement dit les plages d'arcs sont **calculées par un module Lua à
l'expansion du gabarit**. Elles n'existent pas dans le wikitext brut,
donc `action=parse&prop=wikitext` ne les verra jamais, quel que soit le
mapper.

Les deux autres portes sont fermées aussi :

- **`Chapter Box` n'a aucun champ d'arc.** Ni `Episode Box`. Le pont
  n'existe pas non plus du côté source.
- **Les pages d'arc n'ont aucune wikitable** (`structure.tables` est
  vide sur les 25 pages) : les titres de section sont `Arc Navigation`,
  `Summary`, `Story Impact`… Il n'y a pas de liste de chapitres à lire.

### Ce qui EST disponible

- **L'ordre des arcs.** `prev` / `next` sont des wikiliens littéraux
  (18-19 distincts sur 25), et `prev anime` / `next anime` donnent la
  chaîne côté anime, filler compris. De quoi établir `arc_number` sans
  aucune plage.
- **Le pont volume → chapitres**, littéral et complet
  (`Volume Box.chapters`, 100 % rempli). 115 volumes.
- **`Episode Box.chapter`** (`Chapter 432 (p. 2-19)`) : le pont
  épisode → chapitre, mais rempli à **0,16** seulement.

### La seule voie vers les plages : l'HTML rendu

`action=parse&prop=text` renvoie le gabarit **expansé** — les plages y
sont écrites. C'est faisable, mais ça change le substrat d'extraction
(HTML rendu au lieu de wikitext) pour ce mapper. **Décision du
mainteneur requise** avant de l'ouvrir : cf. `docs/STATE.md`.

## Mapper coverage (ADR-079 + ADR-109)

`import:fandom <kind> "<Page>" [--stage]` runs one mapper on one page;
`import:fandom crawl --category "<Category>"` auto-detects the box.

| Kind           | Infobox          | Entity type     | Fields mapped/ignored/unmapped |
| -------------- | ---------------- | --------------- | ------------------------------ |
| `chapter`      | Chapter Box      | `manga-chapter` | 5/0/7                          |
| `character`    | Char Box         | `character`     | 18/0/12                        |
| `episode`      | Episode Box      | `anime-episode` | 6/1/36                         |
| `volume`       | Volume Box       | `volume`        | 4/0/1                          |
| `devil-fruit`  | Devil Fruit Box  | `devil-fruit`   | 9/4/0                          |
| `crew`         | Crew Box         | `crew`          | 10/3/0                         |
| `ship`         | Ship Box         | `ship`          | 11/4/0                         |
| `organization` | Organization Box | `organization`  | 16/2/0                         |
| `weapon`       | Weapon Box       | `weapon`        | 10/2/0                         |
| `arc`          | Arc Box          | `arc`           | 15/3/0                         |

Counts are against the 2026-08-27 survey's field inventory
(`docs/audits/fandom-structure-2026-08-27.json`). "ignored" means
DELIBERATELY not mapped — Fandom presentation params (`colorscheme`,
`backcolor`, `switchAM`, infobox header overrides) and image params,
which ADR-107 forbids ingesting. A field the schema has no home for is
neither mapped nor ignored in the entity: it is emitted as a **warning**
naming the gap, so nothing is silently invented.

Categories to feed the `fandom-import` workflow (all nest their
articles one or two levels down, hence `depth: 2`):

| Kind                                   | Category input           | Pages + subcats                  |
| -------------------------------------- | ------------------------ | -------------------------------- |
| `devil-fruit`                          | `Devil Fruits`           | 6 + 7 subcats                    |
| `crew`                                 | `Pirate Crews`           | 8 + 4 subcats                    |
| `ship`                                 | `Ships`                  | 21 + 7 subcats                   |
| `organization`                         | `Groups`                 | 13 + 15 subcats (there is **no** |
| "Organizations" category on this wiki) |                          |                                  |
| `weapon`                               | `Swords`, then `Weapons` | 47 + 1, 12 + 12 subcats          |
| `arc`                                  | `Story Arcs`             | 34 + 1 subcat                    |

**Islands are the remaining big gap** — Island Box, 414 pages. It needs
a location-modelling ADR first (ADR-109 §scope) and is not a mapper
task.

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
  to `INFOBOX_MAPPERS` in `src/fandom/analyze.ts`, `BOX_TO_KIND` +
  `MapperKind` in `src/fandom/crawl.ts`, and `MAPPER_KINDS` in
  `src/cli/import-fandom.ts`. Keep the handled list in sync with the
  mapper's `get(...)` calls. Shared "* Box" decoding (the `jname`/
  `rname` locale pair, `first` source refs, `<br>`/`;`/`----`
  splitting, vocabulary matching, wikilink → relation resolution)
  lives in `src/fandom/box.ts` — reuse it rather than re-deriving it.
- **New category correspondence**: add a row to
  `CATEGORY_ENTITY_TYPES` in `src/fandom/analyze.ts` (data maintained
  in code — the report tells you which categories need it).

## Un crawl n'est jamais jeté

L'ordre des étapes du workflow est **stage → push → validate → PR**, et
c'est délibéré (ADR-116). Le crawl est l'artefact cher : dix minutes de
requêtes throttlées à 1 req/s qu'on ne rejoue pas pour rien. Il atteint
donc une branche **avant** que quoi que ce soit ait le droit de le juger.

La validation tourne ensuite avec `continue-on-error: true` : son verdict
est écrit dans le résumé du run et dans le corps de la PR, mais il ne
fait pas échouer le job.

**Si la validation échoue, corrige le fichier fautif sur la branche
d'import — ne relance pas le crawl.** Le relancer dépenserait dix
minutes de plus pour retomber exactement sur le même fichier.

Historique de la règle : le run 8 a mappé 398 chapitres et les a tous
perdus parce que `manga-chapter/0.json` violait `number` min 1 (le
chapitre 0 existe : one-shot prologue de _Strong World_). Les runs 3-5
étaient morts de la même façon, sur une permission de PR. Quatre runs
perdus avant que l'ordre des étapes soit corrigé plutôt que ses symptômes.
