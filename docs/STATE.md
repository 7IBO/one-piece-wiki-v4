# Project state & handoff

The living "where things stand and what to resume" snapshot, so a fresh
session can pick up mid-stream. Architectural _rationale_ lives in
`/docs/DECISIONS.md` (ADRs); the build order in `/docs/ROADMAP.md`;
this file is the current status + the open threads.

> **DIRECTIVE MAINTENEUR (2026-08-08, valable jusqu'à révocation
> explicite)** : le projet est en BÊTA avec 0 utilisateur. Aucune
> dépendance externe à préserver — la priorité absolue est la base la
> plus solide possible, même au prix de très grosses migrations,
> refontes ou refactors complets. Ne pas ajouter de couches de
> compatibilité/dépréciation pour protéger des usages inexistants ;
> `check:compat` sert à DÉTECTER les breaking changes pour les faire
> consciemment, pas à les interdire. Casser + migrer le corpus d'un
> coup est le mode normal.

**Last updated**: 2026-08-08 (ADR-096 : provenance par item sur believed_by)

**2026-08-08 — ADR-095 livré sur main (PR #116) ; ADR-096 en
cours.** Les locales de données `ja`/`ja-latn` sont éditables au
dashboard (popover de traductions : 日本語 partout, Rōmaji gated par
`romanizable` sur name/epithet/title_key ; `translationLocalesFor`
est l'unique siège de la règle), seed Luffy en kana/rōmaji, 353
tests. **ADR-096** (dernier item noté→code) : items de
`believed_by`/`known_truth_by` en `EntityId | { target, source? }`
(pas de migration — la chaîne nue reste canonique sans provenance),
normaliseur unique `entityRefItems`, coherence compte cibles + sources
par item, diff d'historique rend « Cible (since …) », affordance
source par item dans le formulaire ; démo sur l'entrée
`presumed_dead` de Sabo. Après ça, l'inventaire « noté mais pas dans
le code » est SOLDÉ : tout est livré, fixé par ADR (affiliation
089), ou explicitement gated (knowledge graph → filtre spoiler ;
runs Fandom live → egress mainteneur).

**2026-08-08 — One Piece Wiki v1 + sync Fandom livrés sur main (PR
#115, ADR-091/092/093/094).** `apps/web` est devenu le wiki public
(layout wiki, curseur anti-spoil SSR `web_progress`, layouts par type
avec dégradation générique, contexte `?scope=`, strip contribution →
dashboard, footer GitHub + Buy Me a Coffee) — 31 tests + 35 checks
Playwright ; captures envoyées au mainteneur. `packages/importers` a
gagné `fandom:analyze` (sweep structurel complet, rapport
JSON+MD + GAPS) et `fandom:updates` (file de deltas par révisions vs
registre ADR-081) — 68 tests fixtures ; l'egress Fandom reste bloqué
ici (CONNECT 403), exécution live côté mainteneur. Références
externes + documents in-universe promus d'IDEAS (voir entrée
précédente). **ADR-095 en cours** : locales de données `ja` +
`ja-latn` éditables au dashboard uniquement (Rōmaji restreint aux
propriétés `romanizable: true` — name/epithet/title_key), jamais en
UI ni sur le wiki v1, narratifs en/fr inchangés. **Wave 3 toujours en
file** : provenance par item sur `believed_by` (séquencée après
ADR-095 — même surface EntityForm).

**2026-08-08 — promotions IDEAS : références externes (ADR-093) +
documents in-universe (ADR-094).** Both parked entries promoted per
the IDEAS contract (ROADMAP follow-up 6 + ADRs + DATA_MODEL sections
first). ADR-093: core `reference` entity type (`url` required,
`reference_kind` vocab, `accessed_at`) + `attested_by` BASE qualifier
(entity_ref→reference, multi, order 8) available on every entry via
the ADR-078 registry; `BaseQualifierBag` types it; the coherence
UNREFERENCED scan counts it; seeded
`reference:onepiece-com-character-log` attesting Luffy's epithet.
ADR-094: one-piece `document` entity type (`document_kind` vocab,
`first_source`, `narrative_key`) + new `issued-by` relation +
`profiles`/`held-by`/`depicted-by` extended to document; seeded
`document:luffy-first-wanted-poster` (profiles character:luffy since
manga-chapter:96). 37 entities, all additive (compat snapshot
updated). Wave 3 (per-item provenance on `believed_by`) stays queued
— big cross-cutting migration, own ADR needed.

**2026-08-08 — inventaire "tout ce qui est noté mais pas dans le
code", vague 1 (ADR-089 + ADR-090).** Sweep of every deferred note
(IDEAS.md, ADR-087 leftovers, ADR-009 follow-ups): (a) **ADR-089**
fixes the affiliate-links architecture (canonical URLs only in
`/data`, render-time decoration from deploy config, `rel="sponsored
nofollow"` + mandatory disclosure) — design-only, implementation
gated on a real signed program; the IDEAS.md bullet now points at
it. (b) **ADR-090**: the rule DSL gains `scope: 'relation'`
(`relation_type` selector, edge conditions `qualifier_equals` /
`target_type_is`, expectations `qualifier_present` /
`qualifier_present_one_of`; findings anchor `relationType` /
`relationIndex`) — shipped rule
`available-on-needs-target-anchor` (advisory: an `available-on`
edge needs `external_id` OR `url`); and `link_template` became
multi-entry with a `region` qualifier per the `publications`
precedent (entry without region = worldwide default; migration
`0006-link-template-per-region`, streaming-platform v2→3, amazon
seed shows `.com` default + `.fr` FR). (c) ADR-009 leftovers
closed: CONVENTIONS.md formatter section now states the real dprint
setup (npm-pinned plugins, `bun run format` only), DATA_MODEL.md
Luffy ₿3B example unified on `manga-chapter:1053`. **Still blocked
on environment (egress to onepiece.fandom.com)**: live validation
of the volume-mapper fixture and any arc-mapper work. **Kept
parked deliberately**: knowledge graph (gated on the spoiler
filter, per IDEAS.md), public-app feature parking lot (ADR-027
list), AI ingest / schema admin / Yjs / mobile-app entries.

**2026-08-08 — public reader app skeleton (`apps/web`, Phase 6.0
foundation).** New workspace `@onepiece-wiki/web` (TanStack Start +
Base UI + Tailwind v4, dev port 4200): the read-only public site over
the SQLite artifact, first consumer of the ADR-086 additions
(materialized inverse relations with per-direction `label`, plus the
`translations` / `narratives` tables). Structure: `server/db.ts`
(prepared `bun:sqlite` statements, lazy singleton, walk-up artifact
discovery + `ONEPIECE_DB_PATH` override), `server/catalogue.ts`
(schema-engine catalogue, fs in dev / glob bundle in prod — dashboard
recipe), `server/views.ts` (display-ready view models: localized
names, schema/vocab labels, epistemic badges + `actual_value`, both
relation directions from `source_entity_id` alone), `src/api.ts`
(server functions). Routes `/`, `/t/<type>`, `/e/<type>/<slug>`;
`web_locale` cookie FR/EN with SSR-correct first paint; dark-first
editorial theme (Fraunces/Inter display/body), tiny built-in markdown
renderer (no new render dep). Turbo: `web#build` depends on
`db-builder#build:db`; dev auto-builds the artifact when missing
(`scripts/ensure-db.ts`). Verified: Playwright run over home /
characters / Luffy (properties, both relation directions, FR toggle,
404), `vite build` + `.output` smoke test under Bun, 9 new bun tests
(markdown parser + real-artifact view models incl. Sabo epistemic
history — suite skips when the artifact is absent). Gotcha logged in
`server/views.ts`: a mixed `import { type X, fn }` from the
bun:sqlite-backed module lost its value specifiers in the dev SSR
transform — namespace import instead. Not yet (later 6.x): spoiler
cursor, search, per-type templates, SEO/SSG, locale routes, images.
Vercel deploy config for this app is intentionally untouched
(dashboard-only `vercel.json`; deploy wiring is a flagged follow-up
per CLAUDE.md §7).

**2026-08-08 — rules gain opt-in `enforcement: 'blocking'`
(ADR-088).** Maintainer's "custom rules between entities in the Zod
verification": `RuleSchema` grew an optional
`enforcement: 'advisory' | 'blocking'` (default advisory — the
ADR-085 principle is untouched, all five canon-knowledge rules stay
advisory). Blocking = the dashboard save/create endpoints re-run
`evaluateRules` on the save payload and refuse with
`422 { code: 'rule_blocked', findings }` (server gate in
`apps/dashboard/server/rule-block.ts`, wired in handleSaveEntity +
handleCreateEntity BEFORE any GitHub call); the form shows blocking
findings red live (entity-level panel + per-property, error styling;
save button stays enabled, the server refuses) and maps the 422 onto
the same red field/top-level surfaces as Zod issues
(`ruleBlockedFindings` guard in src/api.ts); `check:coherence`
reports blocking RULE_FINDINGs as errors (non-zero exit). Exactly one
rule shipped blocking as the structural example:
`until-not-before-since` (incomparable refs already yield no finding,
so no canon false-positive is possible). Tests: rules.test.ts
(enforcement default/blocking), coherence.test.ts (severity mapping),
server rule-block.test.ts (422 payload). Docs: DATA_MODEL /
SCHEMA_SPEC § Rules + ADR-088.

**2026-08-08 — providers generalised (ADR-087).** Maintainer's
"structure providers" (Amazon/Crunchyroll/…): NO new entity type —
`streaming-platform` is already the generic provider node (generic
labels + `platform-kinds` streaming/reader/store). Additive widening
only: `available-on` v3 (`valid_from_types` += `volume`), `volume` v2
(`allowed_relations` += `available-on`), `store` label broadened to
"Store (purchase)"/"Boutique (achat)". Corpus seeds: 4 providers with
`link_template` (`amazon` `…/dp/{id}`, `crunchyroll` `…/watch/{id}`,
`manga-plus` `…/viewer/{id}`, `netflix` `…/title/{id}`), `volume:1`
(→ amazon, `external_id` ISBN-10) and `manga-chapter:1` (→ manga-plus,
`external_id` 1000486, + factual `part-of-volume`). Qualifier registry
completed for `available-on` (ADR-078 follow-up: `external_id`,
`verified_at`, `url`, `region`, `requires_subscription`,
`subtitle_langs`, `dub_langs` — 27 qualifier types; the edge editor no
longer shows humanized English ids in FR). Compat snapshot
regenerated (purely additive). Crunchyroll/netflix are seed-only for
now (advisory UNREFERENCED warnings) — they get edges when
anime-episode availability data lands. Per-region templates +
"external_id-or-url" coherence rule still parked (ADR-084/087).

**2026-08-08 — build pipeline: materialized inverses + translations/
narratives in the artifact (ADR-086).** `packages/db-builder` extended
(NOT a new package — BUILD_PIPELINE/ARCHITECTURE already name it as the
pipeline): every stored edge now gets its inverse row materialized
(`is_inferred=1`, `<type>.inverse`, new `label` column carrying the
direction's localized labels; ADR-037 axes mirrored), deduplicated
against the 3 known double-stored `family-of` pairs; new `translations`

- `narratives` tables loaded from the corpus trees (narratives error on
  unknown entity ids; tree currently empty). CLI `bun run build:db` (root
  script + uncached turbo task; `build:data` kept as alias). Real-corpus
  build: 30 entities / 110 properties / 56 relations (25 inferred = 31
  stored − 6 double-stored) / 86 translations / 0 narratives;
  byte-identical sha256 across runs. 13 new tests (in-memory DB round
  trip, dedup, labels, axes, content loaders). Docs: BUILD_PIPELINE §5 +
  §10 rewritten, SCHEMA_SPEC `inverse_inferred` reinterpreted as
  editorial-only.

**2026-08-08 — history quiet lines + explore entry links + property
info (maintainer feedback batch).** (1) History pages toned down: the
change-line wire format went from `string` to
`{ text, details? }` (`server/history-diff.ts` `HistoryChangeLine` —
`text` = value · compact since, `details` = the other qualifiers
`Label : Valeur`-joined); the shared renderer shows only `text` in the
normal foreground with the −/+ sign alone tinted (emerald/red at 70%),
and `details` unfolds behind a per-line "voir plus" — nothing open by
default. (2) /explore stays read-only but every value line (both
modes) is now a discreet link to the entity page with
`?edit=<propertyId>.<entryIndex>`, opening that entry's editor there
(Back closes it, per the existing URL-mirror). (3) With ≥1 chosen
property, /explore shows one info line per property (declaring entity
types from the catalogue + filled-entity count from the audit rows)
and a "types concernés uniquement" toggle (default ON) restricting the
list to entities whose type declares a chosen property. New UI_STRINGS
keys appended (historySeeMore/Less, exploreOpenEntry,
exploreDeclaredBy, exploreFilledCount, exploreRelevantTypesOnly).
Verified: 258 bun tests (history-diff tests adapted), typecheck, lint,
format, dashboard build, Playwright pass (mocked history API,
explore→editor deep link, Âge info line + filter).

**2026-08-08 — Narrative editor v1 (the missing content brick).**
Path convention settled and documented in DATA_MODEL § Narratives:
`data/universes/<u>/narratives/<locale>/<entityType>/<fileBase>.md`,
`<fileBase>` = the entity JSON's basename (pairs 1:1 with the entity
file). Server: `GET/POST /api/entities/:type/:slug/narrative`
(server/narrative.ts pure helpers, unit-tested; POST reuses the
entity-save PR flow via the new `submitNarrativeEdit` in
github-client — resume-PR routing included; emptied text deletes the
file, `commitMultipleFiles` now supports `content: null` deletions).
Dashboard: collapsed "Narratif" section on the entity page
(`NarrativeEditor.tsx`, EN/FR tabs + word counter + concision hint,
read-only until signed in). Prod data source now bundles
`data/**/*.md`. No optimistic locking on narratives in v1 (cast-flow
trade-off). Open thread: `[[type:slug]]` link validation + build
pipeline parsing of narratives still unimplemented (phase later).

**2026-06-14 (evening) — C8 closed + C9/C5 additive waves.** Catalogue **36
entities / 101 properties / 70 relations / 63 vocabularies**. ADR-073
(contract phase: legacy `volume` string dropped; migration `0005`, no-op on
corpus), ADR-074 (`sbs-qa` + `qa-of`), ADR-075 (`is_color_spread` +
`has-cover-story`), ADR-076 (C9 wave 1: `part-of-event` phases, race
`slave_price`/`danger_classification`/`hybrid-of`, location `log_pose_time`,
ship `figurehead`, bounty `reason`), ADR-077 (C5 wave: fruit
`weakness`/`awakening_outcome`/`interacts-with-fruit`/`held-by`, technique
`is_secret`/`requires_haki`/`variant-of`). `adapted-by` was already the
non-linear many-to-many — no change needed. **C8 complete; C9/C5 additive
halves complete.** All shipped on PR #91. **The rest of the data campaign is
blocked on the maintainer `[D]` calls** (DATA_EXPANSION_PLAN §4): #1 C1
edition-variant qualifier, #3 era/temporal value, #5 fighting-style
modelling, #6 ancient-weapon/artifact, #7 event breaking changes. **Also on
PR #91**: W-F closed (shared `useApiResource` + `LoadFailed`, ADR-032) and
W-A closed (qualifier-type registry, ADR-078 — catalogue is now 36 / 101 /
70 / 63 / **15 qualifier types**). NB: **ADR-072 is reserved by PR #90**
(dashboard image display, open at the time of writing — disjoint files,
merge order safe either way).

**2026-06-14 (late) — maintainer vision drop, recorded.** Direction
received in the maintainer's own words: (1) **Fandom-assisted ingestion**
via the MediaWiki content API → **ADR-079** (importers v1 programme;
BLOCKER for cloud runs: `onepiece.fandom.com` is denied by the session
network policy — allowlist it in the Claude environment settings, or run
imports locally/CI); (2) **public-API additions** → **ADR-080**
(field-lifecycle registry generated from compat snapshots, official npm
SDK, per-entity history endpoint; Stripe-style pinning confirmed as the
existing URL-MAJOR + `X-API-Version` design; all still design-only,
pre-freeze gate ADR-029 unchanged); (3) **dashboard UX coherence pass 2** and the SEO / partnerships /
"incontournable" polish → parked in IDEAS.md pending their own ADRs
(affiliate links explicitly need the dedicated ADR). **Importers v1 foundation
shipped (same evening, PR #91)**: `packages/importers/src/fandom/` —
`FandomClient` (action=parse, injectable fetch, response cache, rate
limit), the wikitext utilities (nesting-aware template parser,
`findTemplate`, `cleanValue`, `parseQrefs` → source ids,
loose number/date parsing) and the first deterministic mapper
(`mapChapter`: Chapter Box → corpus-shaped `manga-chapter` JSON +
EN-title sidecar + warnings; validated against the generated Zod in
tests — 10 tests, fixtures only). **Sync registry shipped
(ADR-081)**: `data/import/fandom-pages.json` ledger + registry module
(title normalization, redirect aliases, `detectEntityLinks`,
`staleEntries`) + client `queryInfo`/`recentChangesSince` + real
redirect fixture. Real fixtures from the maintainer replaced the
hand-written ones (Qref params are `chap`/`ep`/`sbs`/`vol`; Chapter Box
has no number/date params — ordinal from the page title; Episode Box
ordinal is `#`). **Character mapper shipped** (real Hyougoro Char Box fixture):
deterministic scalars with per-value provenance — Qref parsing is now
recursive with named-backref resolution (`{{Qref|name=vivre card}}` →
`databook-card:1329`), `{{Nihongo}}` alias/epithet parsing, MM-DD
birthdays; affiliation/occupation/VAs surface as warnings for the AI
pass. New Qref variants covered: `cover=`, `card=`, `ep2=`, long
`chapter=`/`episode=`. **Emit adapter + CLI + sync workflow shipped**:
`emit.ts` (corpus-layout file building; translation merge where
existing keys win; entity files conflict-safe unless `--overwrite`),
`bun run import:fandom <chapter|episode|character> <page…> [--stage]`
end-to-end CLI (dry-run default; response cache under `.cache/fandom`),
`import:fandom check-updates` (ledger vs live revisions, exit 2 =
stale), and `.github/workflows/fandom-sync.yml` — **manual-only**
(`workflow_dispatch`; the daily cron line is committed commented-out —
enabling unattended runs is the maintainer's call). First live run
needs only: local/CI execution (CI runners have egress) or the sandbox
allowlist (ADR-079 §6). **Full-auto crawl shipped**:
`crawl()` orchestrator (category seeding via `categoryMembers` with
continuation, infobox **auto-detection** routing to the right mapper,
one-hop redirect following, frontier of most-linked unknown pages,
ranked report of unmapped infobox kinds = which mapper to build next),
`import:fandom crawl --category X --depth N --limit N [--stage]` CLI,
batch-PR plan/emit (`emit-pr.ts` → labels `via-dashboard`+`import` →
admin queue), and `.github/workflows/fandom-import.yml` (**manual
dispatch** with category/depth/limit inputs: crawl → stage → gauntlet →
draft PR via `gh`; nothing merges without a human). Live lesson from
runs 1–2 (2026-08-07): Fandom's chapter/episode categories hold **no
direct articles** — only subcategories (One Piece Chapters → Chapters
by Volume → Volume N) — so `categoryMembers` now descends `depth`
subcategory levels (default 2, dedup + 300-category cap) and **throws
on MediaWiki error envelopes** instead of returning an empty list.
Run 3 then hit the required-`released_at` gate (Chapter Box has no
date → ADR-082 made it optional, v7); run 4 crawled/validated/pushed
**24 chapters** but `gh pr create` died on the missing `import` label —
PR #94 (Chapters 2–25) was opened + labelled manually, and the
workflow now creates both labels idempotently before opening the PR.
**First live import PRs: #94 (24 chapters) and #96 (8 episodes,
run 5 — data+labels green).** One admin toggle still blocks full
autonomy: the repo setting **"Allow GitHub Actions to create and
approve pull requests"** (Settings → Actions → General → Workflow
permissions) is off, so the workflow's final `gh pr create` is denied
and the PR must be opened by hand from the pushed `import/fandom-*`
branch until it is flipped. Remaining importer work:
volume/databook-card + remaining infobox mappers (the crawl report
ranks them by frequency), the AI prose-extraction pass. Next:
W-B detail view, W-F2 UX conventions.

**2026-08-08 — dashboard redesign (UX audit → ADR-083 → W-F2 layout
system → read-first form).** Grounded in a 9-agent code audit (124
file-anchored findings) + real Playwright screenshots (9 routes × 3
viewports, before/after). Shipped: **ADR-083** `recommended` property
tier + `recommended_relations` (schema-checked, flagged on
character/manga-chapter/anime-episode); **layout tokens** `--header-h`
/ `--page-px` + `bleed` utility (mobile full-bleed surfaces, `<Card
bleed>`); unified radii/focus/invalid recipes; ≥16px mobile form
controls (no iOS focus-zoom); single mobile nav (hamburger removed,
BottomNav Rules-of-Hooks crash fixed); **read-first entity form**
(filled rows collapse to value+provenance+×N summaries — Luffy mobile
page 3100px → ~1500px; recommended-empty rows visible with amber tag;
**live client Zod** via the browser-safe `entity-schema.ts` extraction
— same validator at form/server/CLI); **completeness meters**
(PropertyNav "x/y of a complete article", per-row list meters via
`server/completeness.ts`, content-based fill semantics); richer lists
(two-line rows + meters, grouped home with empty types collapsed,
localized plurals, actionable empty states); admin queue
(primary+overflow, confirm dialogs, `reloading` guard against
double-approve); drafts undo toasts; LoadFailed retry;
stale-while-refetch `useApiResource`; apparitions display names +
fallback "Other" group + pending badges. New W-F2 §layout/borders/
responsive + §field-states conventions in CONVENTIONS.md. Follow-ups
tracked in ROADMAP §4 task 5 (narratives editor, cross-field rules
ADR, microcopy sweep, external-images licensing decision).

**2026-08-08 (b) — UX v2 feedback batch (live mobile test) + ADR-084.**
All 20 tester points fixed on main: draft-tier hold-back (incomplete
entries stay out of diff/PR, amber "brouillon" badge — no more instant
red errors), humanized validation lines ("Entrée 2 · Depuis : valeur
manquante"), stacked per-entry summaries with C/E provenance, vocab
labels resolved everywhere (no raw "scientist"), multi-enum as a
stay-open select, source-type select trigger localized, relation
registry labels (relation_kind/known_publicly_since added → 17
qualifier types), multi-target relation add fixed (no more dead empty
chip), qualifier sheet lists ALL options with "—", locale switch
hydration bug fixed (SSR mismatch) + switcher is a Select, popups
full-width on mobile, drawer padding/footer responsive, save bar
responsive, sections-sheet reveal+scroll fixed, entity header History
link → GitHub file history. **ADR-084**: availability by stable
`external_id` + platform `link_template` (url now optional) — product
ids (ASIN, episode ids) stored once, links generated later.

**2026-08-08 (c) — ADR-085 rules + links panel + explorer + fix batch.**
Sixth catalogue group `rules` (declarative, ADVISORY — never blocking):
engine `schema-engine/src/rules.ts` (browser-safe, 6 tests) shared by
`check:coherence` (`RULE_FINDING`) and the form's amber advisory panel;
6 v1 rules (marine+bounty w/ Cross-Guild escape, single concurrent
devil fruit, 2 epistemic anti-patterns, unanchored death, until<since);
builtin `SYMMETRIC_RELATION_STORED_TWICE` — which found 3 REAL
double-stored family-of edges in the corpus (ace↔luffy, ace↔sabo,
luffy↔sabo), matching the dashboard's new conflicts detection.
**Links panel** (`GET /api/entities/:type/:slug/links` + panel on the
entity page): outgoing + reverse-scanned incoming edges with inverse
labels, deep links, and conflict detection (duplicate-symmetric,
duplicate-edge, qualifier-mismatch), 12 tests. **/explore** cross-type
audit grid (`GET /api/audit`, 9 tests): every entity × values with
resolved displays, per-row completeness, missing-recommended +
missing-translation badges, type/search/toggle filters, inline edit via
the drawer, virtualized. Plus the tester's 11-point fix batch: drawer
z-index (pencil dead behind the sheet), nested-<li> hydration bug,
multi-select scroll jump, locale-select compact popup, toolbar heights,
source-type trigger label (Base UI Select.Value ignores plain
children), picker slugs desktop-only, MultiEntityRef restyled (dashed
add, popup consistent), mobile bottom-sheet picker retired (anchored
autocomplete everywhere), empty-target relation entries render an
inline target picker. Per-item provenance on believed_by parked in
IDEAS.

**2026-08-08 (d) — UX v3 batch (17-point mobile test).** **/explore v2**:
type filter as the shared stay-open multi-select (no ids, harmonized
heights), rows always expanded without entity ids or edit buttons,
maintainer-chosen property columns with INLINE editing (no extra
dialog; reuses the drawer save endpoint), completeness hidden when
columns are chosen (amber missing-value warnings instead), audit
`since` refs rendered compact (`C1`, not `manga-chapter:1`). **In-app
history page** `/types/:type/:slug/history` (Octokit commit list per
file path; the entity-header History link is now internal). **Form
fixes**: schema-details badges moved to their own row (they overlapped
the value summary on mobile), sections sheet reveal+scroll fixed (the
Dialog scroll-lock was undoing the scroll — the retry now waits for
lock release), remove-✕ on the last entry deletes the property key
(phantom `{}` entry made it look dead), login autofocus removed
(mobile keyboard hid the GitHub button). **Links panel v2**: qualifier
keys resolve via the qualifier registry and enum values via
vocabularies (`side: whitebeard_allies` → « Camp : Alliés de Barbe
Blanche »), per-row edit affordance (outgoing → scrolls to the
relation editor; incoming → jumps to the storing entity), and
**double-stored symmetric edges reframed as an INFO note** (maintainer
call: both-sides storage is informative, never an error — the pipeline
generates inverses, so a missing opposite is by design). Registry
gained `role`/`side`/`outcome` (20 qualifier types). Popovers/selects
switched to `positionMethod='fixed'` (bottom-anchored popups grew the
document — phantom gap + stray scroll). Combobox chrome i18n'd.
Follow-up (same day): the UI locale now persists in a COOKIE
(`dashboard_locale`) read by the root loader during SSR (with
Accept-Language fallback for first visits), so the first paint is
already in the user's language — no EN→FR flash, `<html lang>` correct
server-side, and locale-dependent fetches (`/api/audit?locale=`) fire
once instead of EN-then-FR. localStorage kept as legacy fallback,
reconciled post-hydration. Also: /explore filters no longer sticky
(maintainer call), inline editing extended to the DEFAULT explore mode
(tap a value in the always-expanded rows — same CellEditor as columns
mode, booleans toggle in place), and the history page shows each
commit's changed lines inline (server fetches per-commit patches for
the newest 25 commits, `+`/`-` lines capped at 30 with a truncation
count — what changed is visible without clicking through to GitHub).

## 2026-08-08 (e) — Fandom character mapper v2

Two real defects fixed and two deterministic-resolution passes added
(`packages/importers/src/fandom/character.ts`, 224 tests green):

- **status vocab bug**: the mapper emitted the raw Fandom word
  `deceased`, which the `character-statuses` enum (`dead`,
  `presumed_dead`, `missing`, …) rejects at validation. Now mapped
  through longest-match patterns (incl. "Presumed Deceased"), with the
  status line's own Qref as `since` when cited.
- **bounty was not mapped at all**: `parseBountyEntries` parses the
  newest-first `<br>`-separated history into chronological entries
  with per-value `since` from each line's {{Qref}} (manga chapter
  preferred), skipping numberless lines and flagging unsourced ones.
- **registry-resolved relations**: affiliation/origin/residence/devil
  fruit `[[wikilinks]]` now resolve through the committed sync
  registry (exact title/redirect matches only) → `member-of` /
  `originates-from` / `resides-in` / `ate-fruit` relations with
  per-line `since`; "former"-annotated lines, unknown pages, and
  wrong-type targets stay warnings.
- **occupation matching**: exact case-insensitive matches against the
  `occupations` vocabulary labels (en/fr/id) become the multi_enum
  value; fuzzy strings stay warnings.

The CLI + crawl orchestrator thread the context (registry title index

- occupations index) automatically; calling the mapper without a
  context degrades to v1 warnings-only behaviour.

## 2026-08-08 (f) — entity form: value list + per-entry side sheet

Maintainer-requested rework of the property rows: the inline accordion
(EntryCards expanding in place) is gone. Each property now shows its
label + a FULL-WIDTH read list of value lines (summary + compact
provenance, one line per entry); tapping a line opens a right-side
sheet that groups the value input, the `since` anchor and EVERY other
qualifier in one surface (the "More options" list-all pattern, no
second hop). Remove lives in the sheet footer; adding an entry (or
revealing a property from the Sections nav) opens the new entry's
sheet immediately. `QualifierSheet.tsx` was split into reusable
`SideSheet` (controlled panel) + `QualifierRowList` (list-all body) +
the original trigger-owned `QualifierSheet` (still used by the
relations editor). Hotfix (same day): the SSR locale read broke
in the PRODUCTION bundle only — Rollup rewrote the loader's dynamic
`import('@tanstack/react-start/server')` into a self-import of the
SSR chunk, whose exports don't carry the h3 helpers ("getCookie is
not a function" on Vercel; dev was fine). Fixed by moving the read
into a `createServerFn` with static imports — the server-fn compiler
extracts the handler cleanly from both bundles. Verified on the built
nitro server (curl: cookie→fr, Accept-Language→fr, default→en) plus a
full Playwright pass against the prod build (form sheet, links panel,
explore locale=fr single fetch, history banner).

## 2026-08-08 (g) — history page: semantic property/value changes

Maintainer feedback: "afficher sous forme de changements de propriétés
et valeurs, pas en mode json". The per-commit raw `+`/`-` patch lines
are gone. `server/history-diff.ts` diffs the entity JSON at each
commit against its predecessor (file contents fetched per version —
listCommits is path-filtered so consecutive rows are consecutive
versions; the oldest commit of a complete history diffs against
nothing = creation) and reports grouped changes per property /
relation type. Values resolve through the audit display machinery
(vocab labels, translated keys, number+unit, ref display names,
compact `C96` provenance) in the requested `?locale=`. Multiset
semantics: an in-place edit reads as one removal + one addition. The
page renders label + red `−` / green `+` lines, groups kept whole
under a 20-line per-commit budget with a truncation note. 6 new
tests (230 total).

## 2026-08-08 (h) — quiet-by-default sweep + relations redesigned

Maintainer feedback batch: (1) /explore is READ-ONLY again — inline
editing (both modes), the drafts store and the bulk save bar are
deleted (−540 lines); the amber chip walls collapsed to ONE muted
gap line per row, the completeness meter is the only visual signal.
(2) The prod "phantom popups on reload" bug (draft auto-apply
tripping every PropertyRow's open-on-count-grow adjust) is structurally
fixed by the lifted single-editor state — verified by seeding an
IndexedDB draft (3 grown properties → 0 editors open after reload).
(3) "Par défaut, rien d'ouvert": the links panel no longer auto-opens
at ≥sm. (4) RelationsEditor rewritten to the property pattern —
full-width edge lines per relation type (target name + resolved
qualifier summary + C96 since), click → SideSheet (mobile) / inline
sticky panel (desktop), all qualifiers via QualifierRowList, remove in
footer, add-opens-editor, close-without-target deletes. (5) Inverse
relations VISIBLE without double storage: read-only `InferredRelations`
section (incoming edges from the links API, grouped by inverse label,
"auto" badge, pencil to the storing entity). (6) History lines carry
every qualifier ("Mort · C574 · Statut épistémique : Confirmé") and a
GLOBAL /history page lists recent data commits with per-entity change
groups (sidebar link under Explorer). Follow-up: the open entry editor
mirrors into `?edit=<propertyId>.<index>` on the entity route —
opening pushes a history entry, browser Back CLOSES the editor (and
still discards never-filled entries) instead of leaving the page;
explicit close pops the pushed entry so the stack stays balanced;
deep-linked `?edit` restores the editor. Drawer/new-entity forms keep
local-only state (`syncEditorToUrl` opt-in).

## 2026-08-08 (i) — Fandom volume mapper

`mapVolume` (`packages/importers/src/fandom/volume.ts`): Volume Box →
`volume` entity (number from the "Volume N" page title, EN title →
`volume.<n>.title` sidecar, JP release → `released_at` territory jp).
Schema gaps stay warnings: isbn/pages (no property), EN release
(`released_at` single-valued), chapters range (belongs on the chapter
side as `part-of-volume` — the warning lists the ordinal range).
Wired into `detectKind`/crawl + the CLI (`import:fandom volume …`).
**Fixture `volume-12.json` is SYNTHETIC** (network policy still denies
onepiece.fandom.com) — validate against a live capture on the first
CI run and replace, like chapter-1044/episode-1071 were. **Arc mapper
deliberately NOT built**: corpus arc ids are editorial shorthand
(`arc:wano` ↔ "Wano Country Arc"), so deterministic slugify would mint
diverging duplicates, and the required historical `name` needs a
human-chosen `since` anchor — arc pages keep ranking via
`unknownBoxes` until a live Arc Box capture proves a clean path.

**Current phase**: 4.3 (see ROADMAP). **Post-4.3 order re-sequenced by
ADR-032** (tooling-before-ingest): W-F → W-A → W-B → W-C → W-E → W-D,
then resume 3.5 → 6 → 7 → 8 → 9+. Workstream breakdown below
(§ "Active plan").

**2026-06-14 — schema expansion + consolidation campaign (ADR-060…069), all
merged.** Catalogue **34 entities / 89 properties / 62 relations / 59
vocabularies**. New media/production entities: `album`+`contains-track`
(ADR-060), `video-game` (ADR-061), `live-action-series`+`live-action-episode`
(ADR-062), `anime-special` OVA/TV-special/ONA (ADR-063), `live-performance`
(ADR-064), `merchandise` (ADR-065). Then five dedup/consolidation refactors
(all breaking, migrate-forward): relation dedup pass 3 (ADR-066), unified
release dates `released_at`+`territory` (ADR-067), dropped `canonicity` →
derive from `canon_scope` (ADR-068), and merged `references` into `features`
(ADR-069). **Migration system now exercised**: `0001`–`0004` under
`/data/migrations` (mostly no-ops on the current corpus; `0002` rewrote 10
chapter files); import via **relative path** to the engine, not the package
specifier (README fixed). The full **apply-all-pending migration runner** now
exists — `bun run migrate:all` (+ `--dry-run`/`--check`) with a committed
`applied.json` ledger (ADR-070). Remaining schema lag: §1 tree + §2
allowed-relations in INVENTORY only.

## Open / blocked threads — resume here

### 1. Production dashboard `/api/*` 404 — ROOT CAUSE FOUND + FIXED (code)

- Symptom: `https://dashboard.one-piece.wiki/api/schemas` → Vercel edge
  `NOT_FOUND`, while SSR routes (`/`, `/types/character`, `/login`) work
  fine via the function. So the function deploys and runs — only
  `/api/*` is intercepted **before** reaching it.
- **Real root cause (proven 2026-06-13 by probing prod):** Vercel's
  legacy **zero-config Serverless Functions** convention treats a
  root-level `api/` directory as individual functions. With Root
  Directory = `apps/dashboard`, Vercel saw **`apps/dashboard/api/`** and
  reserved the **entire `/api/*` path prefix**, shadowing the nitro
  Build-Output catch-all (`/(.*) → /__server`). Proof: `/api/server`,
  `/api/session`, `/api/r2`, `/api/admin-promote` (= the `.ts`
  filenames) returned **500 FUNCTION_INVOCATION_FAILED** (Vercel built
  them as broken functions), while `/api/schemas` + any non-file path
  returned **404 NOT_FOUND**. The earlier "Vite preset / stale deploy /
  operational" theory was **wrong** — the deploy was current and the
  function was live; `/api/*` never reached it.
- **Fix (this PR):** renamed `apps/dashboard/api/` →
  `apps/dashboard/server/` so there is no root-level `api/` dir for
  Vercel to claim. The public URL `/api/*` is unchanged — it is the
  TanStack route path `src/routes/api/$.ts` (splat → `handleApiRequest`),
  independent of the server-lib dir name. Updated the 4 references:
  route import, dashboard `tsconfig.json` include, `package.json`
  `dev:api-legacy` script, `knip.json` entry. Typecheck + lint + vercel-
  preset build all green; only `__server.func` is emitted; catch-all
  config intact.
- **Verify after deploy** (routing effect can't be checked locally —
  DoD #7): `curl -s -o /dev/null -w "%{http_code}\n"
  https://dashboard.one-piece.wiki/api/schemas` → expect **200** (was
  404). Also confirm `/api/server` no longer 500s (should be handled by
  the splat now).
- Dead ends (do NOT repeat blind): #23 relocated `.vercel/output` via
  the buildCommand → **broke the build** (reverted #25); #27 removed
  `framework`/`outputDirectory` → made a preview 404 (closed). The
  repo-root `vercel.json` is **ignored** when Root Directory =
  `apps/dashboard`. **Never push deploy config blind** (CLAUDE.md
  Definition of done #7).
- The big post-build `tsc` **error flood** in the Vercel log (`Cannot
  find name 'process'`, `node:crypto`, `Buffer`, `NodeJS`, `Bun`,
  `S3Client.send`, plus a couple of "genuine-looking" ones like
  `string | { error: string }` in server.ts and the `id?` mismatch in
  generator.ts) is the **same root cause** as the 404: it is Vercel
  **compiling `apps/dashboard/api/*.ts` as zero-config serverless
  functions** in its own context without our `@types/bun`/`@types/node`.
  Proof: every erroring file is in the `api/*.ts` import graph (api/ +
  the packages it imports) — **zero errors come from `src/**`** (the
  2302-module tree nitro actually bundles). It is **non-fatal** (deploy
  exits 0) AND it disappears entirely once `api/` is renamed (PR #32):
  no `api/` dir → Vercel compiles nothing there → no tsc pass → no
  flood. The "genuine-looking" errors pass our CI typecheck and are
  artifacts of the degraded (types-missing) context, not real bugs.

### 2. Admin schema editor (Phase 5) — proposed, not started

- Goal: control fields / values / enums from the dashboard.
- Plan: **same dashboard app**, an admin-gated `/schema` section (not a
  separate app); reuse the schema-driven form generator + github-client
  PR flow + admin auth. Order, safest first: **vocabulary (enum)
  editor** (additive → PR label `vocabulary`) → property-type editor
  (+ impact analysis, reuse `bun run migrate`) → entity-type editor
  (admin-only, ≥2 reviews).
- ADR-027 deferred Phase 5; the maintainer wants it pulled forward →
  needs an ADR + reorder, then start with the vocab editor.

### 3. Codebase-audit backlog (pending)

From the 2026-06-13 audit. **Done this run**: db-builder derived fields
(is_first, primary_canon_scope), display-name dedup, github-client
save-flow tests, the migration helper. **Pending**:

- ~~**qualifiers schema-driven**~~ — **DONE (ADR-078):** the
  qualifier-type registry (`/data/schemas/qualifier-types/**`, 7 base +
  8 common) feeds loader → catalogue → `/api/schemas` →
  `resolveQualifiers(registry, locale, …)`. Follow-ups tracked in the
  ADR (relation-qualifier labels, UI_STRINGS overrides, coherence
  check on `default_qualifiers` ids).
- **db-builder inference engine** — public events reveal facts to
  participants; death events update status transitively. Needs Phase
  3.5 data to be useful.
- **multi-medium spoiler progression** — `packages/sdk/src/progression.ts`
  only models `manga_chapter`; add anime/film axes + cross-medium
  reachability (reaching an episode implies its adapted chapter).
- **Playwright e2e** for the entity-create → PR flow (none exists yet).
- **decompose god-modules** — `EntityForm.tsx` (~1876 L) and
  `server/server.ts` (~1776 L). **ADR-first**. Also burns down
  react-doctor's ~254 advisory findings (mostly react-hooks deps here).
- ~~**schema-driven display name**~~ — **DONE (ADR-031):** entity types
  declare an ordered `display_name_properties`; resolver defaults to
  `['name','title_key']` only when a type omits it. No data migration.
  **Follow-up the feature now unlocks:** `image` (→ `caption_key`) and
  `sbs` currently fall back to slug (no `name`/`title_key`) — give them
  real display names by declaring `display_name_properties` (own PR;
  it's a display behaviour change, left out of ADR-031 to keep it
  behaviour-preserving).
- ~~**relation epistemic axis**~~ — **DONE (ADR-037):** `epistemic_status`
  / `believed_by` / `known_truth_by` / `revealed_since` are now base
  qualifiers on every relation (engine-provided, guarded by
  `RELATION_DECLARES_BASE_QUALIFIER`), typed in both validators
  (`entity-loader` + generated printer), exposed as columns on the
  db-builder `relations` table (mirrored onto the inverse) and on the SDK
  `RelationRecord`. Unblocks disguise-of / same-identity-as (G-series) and
  secret-alliance / double-agent modelling. No data migration.

### 4. Data-model expansion (clusters) — in progress

Driven by `/docs/DATA_EXPANSION_PLAN.md` (Fandom-survey synthesis → clusters
C1–C9, each = one ADR + PR). **Shipped:** ADR-037 (relation epistemic axis),
ADR-039 (C4 devil-fruit identity/succession), ADR-040 (C6 weapon Meitō), ADR-041
(C2 character occupations/blood-types), ADR-042 (`check:compat` schema-evolution
lockfile + CI gate), ADR-043 (C3 organizations: sub-units/power-systems/member
nations), ADR-044 (C7-core: `person` entity + `voiced-by`/`portrayed-by` +
`marine-ranks` via `held_rank`), ADR-045 (C9a: location `region` + historised
`location_status` + crew territorial control), ADR-046 (materials: `material`
entity + `made-of` + Seastone's `nullifies_devil_fruits`), ADR-047 (C8a:
`semi_canon` tier + `wanted_poster`/`eyecatcher` + `arc_number`). **Remaining
(committed order — user said "tout"):** ~~C8-rest~~ **done 2026-06-14 evening**
(ADR-071/073 volume, ADR-074 sbs-qa, ADR-075 chapter enrichment — see the
dated entry at the top), C9-rest (race/concept additions,
ancient-weapon/artifact, event enrichment, `era` entity + the `[D]` structured
in-universe temporal value — biggest), C5 (fighting-styles/Haki/techniques), C1
(naming/i18n editions — invasive, deliberately last; note `name-types` already
carries `native_script`/`romanized`/`literal_meaning`). All clusters touch
DECISIONS.md +
INVENTORY.md, so **merge sequentially**: pull main, branch, `compat:snapshot`
per cluster. **INVENTORY refresh** (per-item sub-sections lag the true catalogue
counts) is tracked in `DATA_EXPANSION_PLAN.md` §5 — a catalogue-generated
rewrite, its own PR.

### 5. Universe scoping / G6 relocation — DONE

**Decision 2026-06-14** (user: avoid letting the debt grow): G6 done in two PRs,
both behaviour- and contract-preserving (loader re-merges `core ∪ one-piece`;
`forUniverse` is test-only; `compat.ts` ignores `universes`; merged catalogue
identical at 22/79/58/48).

- **PR1 — guard fix (ADR-048)** [merged #63]: `checkUniverseScopes` no longer
  treats the _applicability_ lists (`relation.valid_from_types`/`valid_to_types`,
  `property.applies_to_entity_types`) as dependencies; `forUniverse` filters them
  per universe. Kept: entity→properties, entity→allowed_relations,
  entity→display_name_properties, property→enum_ref, relation→qualifier-enum.
- **PR2 — relocation (ADR-049)**: moved the One-Piece closure into
  `data/universes/one-piece/schemas/`. **Core** (9 entities): `image`,
  `manga-chapter`, `anime-episode`, `film`, `arc`, `saga`, `event`, `person`,
  `databook` + 36 generic props + 17 universal relations + 24 meta/generic
  vocabs. **One Piece** (13 entities): `character`/`crew`/`organization`/
  `location`/`title`/`concept`/`race`/`ship`/`weapon`/`technique`/`devil-fruit`/
  `sbs`/`material` + their 43 props + 41 relations + 24 domain vocabs. Guard
  green (no `SCHEMA_UNIVERSE_SCOPE_LEAK`). New clusters: put One-Piece-specific
  schemas under `data/universes/one-piece/schemas/`, universal ones under
  `data/schemas/`.

### 6. Production & credits + availability programme — in progress

User asked (2026-06-14) for full anime/film production data + platform links.
A Fandom audit (Episode Box / Song Box / Movie Box) confirmed: per-episode staff
(director/storyboard/animation-dir/art-dir/screenplay), theme songs (28-field Song
Box), per-dub cast, film credits + regional releases. **All universal → core.**
Slices (each ADR + PR):

1. **`staffed-by`** episode/film → person (role qualifier) + person-roles
   (storyboard/art_director/lyricist/arranger/producer) + dub-studios+=netflix —
   **ADR-050 [done, #65]**.
2. **`theme-song`** entity + `theme-of` (→ anime-episode/film/arc; usage/sequence/
   episode_from/to/broadcast_version) + `theme-song-usage` vocab; credits reuse
   `staffed-by` (widened +=theme-song); `record_label`/`track_length` props; titles
   via `name` `name_type` — **ADR-051 [done, this PR]**.
3. Episode/film props: `tv_rating`, `anime_original`, `film_number` — **ADR-053
   [done, this PR]**. (Eyecatcher = `features` + `appearance_type: eyecatcher`,
   no new field. Per-dub titles/dates fold into C1 i18n.)
4. **Platform availability** (W-E): `streaming-platform` entity (name,
   `platform_kind` → `platform-kinds` streaming/reader/store, `homepage_url`) +
   `available-on` relation (anime-episode/manga-chapter/film → streaming-platform;
   qualifiers url/region/requires_subscription/subtitle_langs/dub_langs/
   verified_at/since) — **ADR-052 [done, this PR]**. **Amends ADR-028** —
   relation-to-entity, NOT the `object` value-type ADR-028 assumed (unbuilt;
   value-types are string/number/boolean/enum/multi_enum/date/entity_ref/
   source_ref/i18n_key/markdown). Live-action availability now works:
   `available-on` `valid_from` += `live-action-series`/`live-action-episode`
   (ADR-062).

**New-domain clusters** (user: "tout tout tout"; from a 4-agent Fandom audit).
**STATUS 2026-06-14 — all delivered** (see the dated summary at the top): `company`
(prior), `databook-card` (prior), `album` (ADR-060), `video-game` (ADR-061),
`live-action-series`+`live-action-episode` (ADR-062), `merchandise` (ADR-065),
plus stage shows as `live-performance` (ADR-064). **OVAs/specials changed approach**:
modelled as a dedicated **`anime-special`** entity with a `special_kind`
(ova/tv_special/ona) **format** axis (ADR-063), _not_ a new `ova` canon-scope value
— format is orthogonal to canonicity. Original (now-superseded) plan below:

- **Real-world `company` entity** (core) — devs/publishers/labels/studios/
  manufacturers; + `produced-by` relation (media → company, `role` qualifier).
  Foundational; unblocks games/merch/music/live-action. (Note: in-universe
  `organization` is OP-scoped; real-world companies are distinct + universal.)
- **`live-action-episode`** entity (+ season): Netflix series; reuse
  `staffed-by`/`portrayed-by`/`available-on`/`theme-song`, `canon_scope: live_action`.
- **Non-canon media**: specials → `anime-episode` + `anime_filler`; crossovers →
  `anime-episode` + `crossover`; OVAs → new `ova` canon-scope value; stage shows/
  musicals → new `live-performance` entity.
- **`databook-card`** entity (Vivre Card / Visual Dictionary): `card_number`,
  `card_kind` vocab (character/extra/skill/ship), measured-fact snapshot props
  (historised), `profiles` → character/df/ship, `sourced-from` → databook. NB the
  audit found **no six-axis stat hexagon** — cards are descriptive/measured.
- **`album`** entity + `contains-track` (album → theme-song, many-to-many,
  qualifiers disc/track_number/version_note); `album_kind` vocab; reuse
  `staffed-by` (widen += album). theme-song doubles as the track entity.
- **`video-game`** entity (Game Box: name/genre/platform/release/prev-next);
  `game-platforms` vocab; widen `features` += video-game (+ `appearance_type`
  playable/exclusive); dev/publisher via `produced-by` → company.
- **`merchandise`** entity (+ `product-line`, `product-type` vocabs);
  manufacturer/collab via `produced-by` → company.

## Active plan (ADR-032) — tooling before ingest

Six workstreams, built in this order; each ships as independent PR(s).
No runtime DB: live PR/contributor data is read from the GitHub API on
demand (module-level cache like `api.ts`); derived aggregates are
computed server-side or emitted as generated TS manifests under
`packages/` (cf. `packages/schemas/generated`); image bytes stay on R2.

- **W-F — UI-coherence foundation** — **DONE 2026-06-14 evening.** The
  `<Banner>`/`<Button>` halves had already shipped with the #85
  overhaul; the last piece — the shared **`useApiResource`** hook
  (`src/hooks/use-api-resource.ts`, no new dependency; note TanStack
  Query is NOT actually in the dep tree despite the earlier note) +
  the shared `<LoadFailed>` error banner — landed on PR #91, replacing
  the duplicated `useEffect`+`useState`+`.catch(setError)`+`Failed:`
  blocks in the 7 fetching routes (index, type list/table/new,
  entity edit, apparitions, source cast). Route-local derived state
  (cast/apparitions working sets, table drafts) seeds via
  `useEffect`-on-data. God-module decomposition (`EntityForm.tsx`
  1876 L, `inputs.tsx` 1103 L, `server/server.ts` 1776 L) remains a
  later **ADR-first** slice, done opportunistically as W-B/C/D touch
  those files.
- **W-A — DONE 2026-06-14 evening.** The `check:coherence` linter half
  had already shipped earlier; the last piece — the schema-driven
  qualifier registry (ADR-078, `/data/schemas/qualifier-types/**`) —
  landed on PR #91.
- **W-B — admin queue + contributors** — **slice 1 DONE 2026-06-14
  evening** (PR #91): `GET /api/admin/pulls` (github-client
  `listAdminQueue` + contributor parsed from the Contributors bullet),
  gated `/admin/queue` route (list, Approve-merge → promote, Reject →
  reject, Review link), `admin` flag on `/api/auth/me`. **Slice 2 DONE
  (same evening)**: in-app structured diff (`server/diff.ts` pure
  helpers + `GET /api/admin/pulls/:n/detail` + expandable queue rows).
  **Remaining W-B**: staged image previews, CI status,
  Request-changes action, and the
  `GET /api/contributors` + `/contributors` route aggregating by
  **parsing the PR-body Contributors bullet** (bot owns commits, so
  GitHub's author APIs don't reflect humans). `packages/contribution-
  stats` util; optional build-time `contributors.generated.ts`.
- **W-C — schema/enum/value editor** (pulls Phase 5 fwd). Vocabulary
  (enum) editor first (additive, PR label `vocabulary`) → property-type
  editor (+ impact analysis, reuse `bun run migrate`) → entity-type
  editor (admin-only, ≥2 reviews, incl. `display_name_properties`), PR
  label `schema-breaking`. Reuse the form generator + github-client.
- **W-E — availability links** (ADR-028, already designed). `availability`
  object property (`{platform,url,kind,region?,subtitle_langs?,
  dub_langs?,requires_subscription?,verified_at?}`, `allow_multiple`) on
  anime-episode/manga-chapter/film; `streaming-platforms` vocabulary.
  Prereq: `SCHEMA_SPEC` `object` value-type section (ADR-026) + a
  repeating-object-row form input. **Affiliate links = separate net-new
  ADR** (FTC disclosure, `rel="sponsored nofollow"`, program/tag model).
- **W-D — media library + image UX.** `/media` gallery (filter by
  license/format/spoiler/usage, search, "where used"); image **reuse
  picker** in the form (widen `depicted-by.valid_from_types` first);
  **display images** on entity detail/list/cards, spoiler-gated by
  `spoiler_since`; uploader polish (paste, bulk, optional crop/focal,
  inline license+attribution+alt-text gating, content-hash dedup).
  `packages/media` helper (URL resolution, srcset, blur). Responsive
  variants via Cloudflare = deploy-config, flag for platform.

## Gotchas (so they don't bite again)

- **Build before committing**, and **deploy config can't be verified
  locally** — CLAUDE.md Definition of done #7. CI now builds the
  dashboard, but `vercel.json` / nitro preset changes only prove out on
  Vercel.
- commitlint allowed types: `feat fix refactor docs test chore data
  schema perf style` — **no `ci`** (use `chore` for tooling/CI).
- `react-doctor install` overwrites `.git/hooks/pre-commit` (hijacks
  lefthook) — restore with `bunx lefthook install`.
- dprint markdown turns a line starting with `+` into a list marker —
  don't start prose lines with `+`.
- Unit tests run on `bun test` (not Vitest — ADR-030).
- On Windows the working tree can drift to CRLF; `.gitattributes`
  enforces LF. Stage intentionally (the tree may show phantom CRLF
  diffs).

## Tooling in place

- Skills (`.claude/skills/`): `data-model`, `dashboard`, `toolchain`,
  plus vendor `react-doctor`.
- Gates: dprint (format), oxlint (correctness + suspicious = error,
  `no-unused-vars` = error), knip (dead files + deps; export-level off),
  react-doctor (advisory ratchet, non-blocking), CI dashboard build,
  commitlint, lefthook.
- `bun run migrate <file>` rewrites `/data` for schema renames in the
  pre-freeze regime (ADR-029/030).
- Full verify gauntlet: see the `toolchain` skill.
