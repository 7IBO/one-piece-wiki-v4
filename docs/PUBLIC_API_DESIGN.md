# Public API Design

> **Status**: design-only, not implemented. Implementation is deferred
> (cf. `/docs/ROADMAP.md` § "Public API"). This document is the
> reference contract for that future work.
>
> Ratified by ADR-025. Open questions at the bottom must be answered
> by a follow-up ADR before any `packages/api-*` package is created.

## 1. Vision and scope

Expose the wiki's structured data to external consumers (YouTubers,
fan apps, Discord bots, third-party tools) via a read-only REST API,
**without ever leaking facts beyond the consumer's stated in-universe
progression**.

In scope for v1:

- Read access to entities, properties, relations
- Resolution of `i18n_key` values into a chosen locale
- Vocabulary lookup (enum codes → localized labels)
- Narrative (prose) retrieval
- Image URL resolution
- Search

Out of scope for v1 (may come later, with its own ADR each):

- Write access (suggestions stay on the dashboard PR flow)
- GraphQL surface
- Webhooks / push — **delivery** deferred, but the event taxonomy
  and the build-pipeline emit seam are now fixed in ADR-028 so the
  architecture stays webhook-ready (see § 13a)
- Authenticated tiers with elevated quotas
- Cross-universe queries (the universe primitive is universe-aware,
  but only One Piece is exposed)

## 2. Architecture

```
data/schemas/  + data/universes/  (source of truth, evolves freely)
       │
       ▼
packages/schema-engine  ──►  packages/schemas/generated/
       │                            │
       │                            ▼
       │                     packages/sdk/  (camelCase, follows data)
       │                            │
       │                            ▼
       │                     apps internes (dashboard, preview, public web app)
       │
       └──►  packages/api-v1/   (PINNED — wire format frozen at v1.0.0 release)
             packages/api-v2/   (PINNED — wire format frozen at v2.0.0 release)
                    │
                    ▼
             apps/api/  (routing, rate-limit, caching, OpenAPI serving)
```

Each `packages/api-vN/` is an independent workspace containing:

- `wire-format/<resource>.ts` — one adapter per resource, mapping
  the current SDK shape to the frozen wire shape.
- `routes/<resource>.ts` — HTTP route handlers.
- `openapi/` — OpenAPI generator scoped to this version.
- `CHANGELOG.md` — Keep-a-changelog format, one entry per
  `MINOR.PATCH` release.
- `package.json` — `name: "@onepiece-wiki/api-v1"`.

`apps/api/` mounts each `packages/api-vN/` under its URL prefix:

- `GET /api/v1/entities/character/luffy` → `packages/api-v1/routes/entities.ts`
- `GET /api/v2/entities/character/luffy` → `packages/api-v2/routes/entities.ts`

## 3. Naming conventions

| Surface                      | Convention                      | Origin                                          | Example                                                               |
| ---------------------------- | ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| **Wire (REST)** meta keys    | `snake_case`                    | code-defined                                    | `entity_id`, `since_source`, `epistemic_status`, `canonical_name_key` |
| **TypeScript SDK** meta keys | `camelCase`                     | code-defined                                    | `entityId`, `sinceSource`, `epistemicStatus`, `canonicalNameKey`      |
| Property IDs                 | unchanged                       | data-defined in `/data/schemas/property-types/` | `bounty`, `blood_type`, `haki_types`, `published_at_jp`               |
| Qualifier IDs                | unchanged                       | data-defined in `allowed_qualifiers[]`          | `issued_by`, `name_type`, `appearance_type`                           |
| Entity-type IDs              | unchanged                       | data-defined                                    | `character`, `devil-fruit`, `manga-chapter`                           |
| Vocabulary IDs               | unchanged                       | data-defined                                    | `blood-types`, `haki-types`, `epistemic-statuses`                     |
| Enum values                  | unchanged                       | data-defined                                    | `A_plus`, `confirmed`, `believed_by_world`                            |
| URL path segments            | `kebab-case`                    | code + `url_segment` from data                  | `/api/v1/entities/devil-fruit/gomu-gomu`                              |
| HTTP headers (response)      | `Pascal-Case` (HTTP convention) | code-defined                                    | `X-API-Version`, `X-Schema-Hash`, `Sunset`                            |
| Query parameters             | `snake_case`                    | code-defined                                    | `?progression=...&include_labels=true`                                |

**Rule of thumb**: anything chosen by code can flip convention
between wire and SDK; anything chosen by data is immutable on every
surface. This eliminates the snake↔camel mapping ambiguity for
property names (which is where most other projects get it wrong).

## 4. Request shape

### Mandatory query parameters

| Parameter     | Type                                                                     | Notes                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `progression` | `EntityId` (e.g. `manga-chapter:1044`, `anime-episode:1085`, `film:red`) | Required on every endpoint that returns content. Enforces the anti-spoiler contract.                                                   |
| `lang`        | `en` \| `fr`                                                             | Required on endpoints whose response contains `value_key` resolutions (entities, narratives) or vocabulary labels. Optional elsewhere. |

### Optional query parameters

| Parameter           | Type                         | Notes                                                                                          |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `fields`            | comma-separated property IDs | Trim the `properties` object to the listed IDs.                                                |
| `include_relations` | `true` (default) \| `false`  | When `false`, omit the `relations[]` array.                                                    |
| `limit`             | integer                      | Pagination, list endpoints. Default 50, max 200.                                               |
| `cursor`            | opaque string                | Pagination, list endpoints.                                                                    |
| `precise`           | `true` \| `false` (default)  | Bypass arc-bucket cache normalization for `progression`. Use sparingly — kills cache hit rate. |

### Error envelope

```json
{
  "error": {
    "code": "PROGRESSION_REQUIRED",
    "message": "Query parameter `progression` is required on this endpoint.",
    "details": { "endpoint": "/api/v1/entities/character/luffy" }
  },
  "api_version": "v1.4.2"
}
```

Stable codes (excerpt; full list lives in OpenAPI):

- `PROGRESSION_REQUIRED`
- `PROGRESSION_INVALID`
- `LANG_REQUIRED`
- `ENTITY_NOT_FOUND`
- `ENTITY_NOT_YET_VISIBLE` (the entity exists but appears after the consumer's progression — return 404, not 403, to avoid leaking existence)
- `RATE_LIMITED`
- `INVALID_FIELD_SELECTION`
- `UNSUPPORTED_API_VERSION`

## 5. Response shape

### Entity detail

```json
GET /api/v1/entities/character/luffy?progression=manga-chapter:1044&lang=fr

{
  "id": "character:luffy",
  "type": "character",
  "slug": "luffy",
  "schema_version": 2,
  "canonical_name_key": "character.luffy.name",
  "first_appearance_source": "manga-chapter:1",
  "last_appearance_source": "manga-chapter:1043",
  "properties": {
    "name": [
      {
        "value_key": "character.luffy.name",
        "value": "Monkey D. Luffy",
        "since_source": "manga-chapter:1",
        "epistemic_status": "confirmed",
        "name_type": "full_name"
      }
    ],
    "bounty": [
      {
        "value": 3000000000,
        "since_source": "manga-chapter:1058",
        "epistemic_status": "confirmed",
        "issued_by": "organization:world-government"
      }
    ],
    "blood_type": {
      "value": "F",
      "since_source": "databook:vivre-card",
      "epistemic_status": "confirmed"
    }
  },
  "relations": [
    {
      "type": "member-of",
      "target": "crew:straw-hat-pirates",
      "qualifiers": {
        "role": "captain",
        "since": "manga-chapter:1"
      }
    }
  ]
}
```

Conventions visible in this example:

- **Meta keys snake_case**, **property IDs unchanged**, **enum values unchanged** (cf. § 3).
- **Translation resolution**: `value_key` preserved alongside resolved `value`. If `lang=fr` and the `fr` key is missing, the response falls back to `en` and includes a `translation_fallback: "en"` flag at the entry level.
- **Historical properties** are arrays (`name`, `bounty`); non-historical are single objects (`blood_type`).
- **Anti-spoiler filtering**: only entries whose `since_source` is reachable from `progression` are included. If the entire property has no reachable entry, the property key is omitted entirely.
- **Locale-independent fields** (numbers, enums, refs) are not duplicated — only `i18n_key` values get the `value_key` + `value` pair.

### Vocabulary

```json
GET /api/v1/vocabularies/character-statuses?lang=fr

{
  "id": "character-statuses",
  "schema_version": 1,
  "values": {
    "alive": {
      "label": "Vivant",
      "description": "Personnage vivant dans la timeline canonique."
    },
    "deceased": {
      "label": "Décédé",
      "description": "Confirmé mort dans la canonical timeline."
    },
    "presumed_deceased": {
      "label": "Présumé décédé",
      "description": "Cru mort par les autres personnages, statut réel non confirmé."
    }
  }
}
```

Vocabularies are cacheable for very long (1 year + ETag). Most clients will fetch each vocabulary once and cache it.

### Narrative

```json
GET /api/v1/narratives/character/luffy?progression=manga-chapter:1044&lang=fr

{
  "key": "character.luffy",
  "type": "character",
  "subject_id": "character:luffy",
  "format": "markdown",
  "content": "Monkey D. Luffy est le capitaine de l'équipage du Chapeau de paille...",
  "content_chunks": [
    { "progression_threshold": "manga-chapter:1", "content": "..." },
    { "progression_threshold": "manga-chapter:1043", "content": "..." }
  ]
}
```

Narratives can be chunked by progression — each chunk only renders if its `progression_threshold` is reached. The server pre-filters; the client receives only chunks it's allowed to see.

### Listing

```json
GET /api/v1/entities/character?progression=manga-chapter:1044&lang=en&limit=20&cursor=eyJsYXN0IjoidXNvcHAifQ

{
  "items": [
    { "id": "character:luffy", "slug": "luffy", "name": "Monkey D. Luffy" },
    { "id": "character:zoro", "slug": "zoro", "name": "Roronoa Zoro" }
  ],
  "pagination": {
    "next_cursor": "eyJsYXN0IjoiemVmZiJ9",
    "has_more": true,
    "total": 1247
  }
}
```

Listing endpoints return a thin shape (id, slug, resolved name only). Full detail requires the per-entity endpoint.

## 6. Endpoint inventory (v1.0.0 release target)

| Method | Path                             | Purpose                                   |
| ------ | -------------------------------- | ----------------------------------------- |
| `GET`  | `/api/v1/health`                 | Liveness + version + schema hash          |
| `GET`  | `/api/v1/openapi.json`           | OpenAPI spec for v1 current `MINOR.PATCH` |
| `GET`  | `/api/v1/docs`                   | Redoc-rendered HTML                       |
| `GET`  | `/api/v1/entities`               | Inventory of exposed entity types         |
| `GET`  | `/api/v1/entities/:type`         | Paginated list of entities of `:type`     |
| `GET`  | `/api/v1/entities/:type/:slug`   | Entity detail                             |
| `GET`  | `/api/v1/vocabularies`           | Inventory of vocabularies                 |
| `GET`  | `/api/v1/vocabularies/:id`       | Vocabulary detail with localized labels   |
| `GET`  | `/api/v1/narratives/:type/:slug` | Narrative for an entity                   |
| `GET`  | `/api/v1/search`                 | Full-text search across exposed entities  |

Notably **absent** in v1:

- No write endpoints
- No batch/multi-get
- No cross-resource graph queries
- No event-stream/webhook

These are deferred. If demand emerges, each gets its own ADR.

## 7. Anti-spoiler model

The single non-negotiable invariant. Five rules:

1. **`progression` is mandatory** on every content endpoint. Absent → 400 `PROGRESSION_REQUIRED`. Never default to "show everything".
2. **Filter on the server, never client.** A response must not contain any value whose `since_source` is unreachable from `progression`. A response must not contain any relation whose `since` qualifier is unreachable.
3. **Existence is itself a spoiler.** An entity introduced after the consumer's progression returns 404 `ENTITY_NOT_YET_VISIBLE`, not 200 with empty content and not 403 (which would confirm existence).
4. **Cache key includes a normalized progression.** Default normalization is to arc boundaries (`manga-chapter:1044` → `arc:wano-island:end`). Opt out with `?precise=true`.
5. **Epistemic status is preserved in the response.** A consumer caught up to chapter X may see "Sabo is dead" with `epistemic_status: "believed_by_world"` even when the reader knows Sabo is alive — the API exposes the world's belief at that point in time, not the omniscient truth. (Logic delegated to the SDK's `visibleProperties` / `visibleRelations` filters, already in `packages/sdk/src/spoiler-filter.ts`.)

## 8. Versioning

### Semver scheme

| Level                       | Trigger                 | URL impact                                     | Header impact                                         |
| --------------------------- | ----------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| **MAJOR** (v1 → v2)         | breaking change         | new URL prefix `/api/v2/`, parallel deployment | new `X-API-Version: v2.0.0`                           |
| **MINOR** (v1.3.x → v1.4.0) | additive, non-breaking  | same URL                                       | `X-API-Version` bumped, new OpenAPI snapshot archived |
| **PATCH** (v1.4.2 → v1.4.3) | bug fix, perf, security | same URL                                       | `X-API-Version` bumped                                |

The URL only carries the MAJOR. A pinned client targeting `/api/v1/` automatically rides MINOR/PATCH improvements but never gets surprised by a MAJOR. Clients that want bit-exact reproducibility download the archived `openapi-1.4.2.json` for the version they integrated against.

### Taxonomy of changes

| Change                             | Sévérité                         | Why                                                                                                   |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Add new endpoint                   | MINOR                            | Old clients ignore it.                                                                                |
| Add new optional response field    | MINOR                            | Lenient JSON parsers ignore unknown fields.                                                           |
| Add new optional query parameter   | MINOR                            | Default behavior preserved.                                                                           |
| Add new entity type to wire-format | MINOR                            | New paths under existing endpoints.                                                                   |
| Add new property to wire-format    | MINOR                            | New field in response.                                                                                |
| Add new vocabulary to wire-format  | MINOR                            | New label space.                                                                                      |
| Add new enum value                 | **MINOR — documented risk**      | Clients with exhaustive `switch` break. Documented anti-pattern: never exhaustive-match on API enums. |
| Bug fix changing returned value    | **PATCH or MAJOR**               | PATCH if the old value was a clear bug; MAJOR if it was documented behavior, even if wrong.           |
| Performance / latency improvement  | PATCH                            | No contract change.                                                                                   |
| Rename property                    | **MAJOR**                        | Contract rupture.                                                                                     |
| Remove property                    | **MAJOR**                        | Contract rupture.                                                                                     |
| Change property `value_type`       | **MAJOR**                        | Type contract rupture.                                                                                |
| Remove enum value                  | **MAJOR**                        | Contract rupture.                                                                                     |
| New required query parameter       | **MAJOR**                        | Old clients break.                                                                                    |
| Tighten validation                 | **MAJOR**                        | Old valid requests become invalid.                                                                    |
| Relax validation                   | MINOR                            |                                                                                                       |
| Change a documented default        | **MAJOR** if behavior-observable |                                                                                                       |

### Wire-format adapter pattern

Each `packages/api-vN/` package owns its frozen wire shape. An adapter is a TypeScript module that takes the **current** SDK-shaped entity and produces the **vN-frozen** wire-format response.

```ts
// packages/api-v1/src/wire-format/character.ts (illustrative)
import type { Character } from '@onepiece-wiki/sdk';
import type { CharacterV1Wire } from './types.ts';

export function toV1Wire(entity: Character, ctx: WireContext): CharacterV1Wire {
  return {
    id: entity.id,
    type: 'character',
    slug: entity.slug,
    schema_version: entity.schemaVersion, // camelCase → snake_case meta key
    canonical_name_key: entity.canonicalNameKey,
    properties: {
      // Property IDs unchanged (data-defined)
      name: entity.properties.name?.map((e) => toNameEntry(e, ctx)),
      bounty: entity.properties.bounty?.map((e) => toBountyEntry(e, ctx)),
      // ... only fields present at v1.0.0 OR added in v1.MINOR
    },
    relations: entity.relations.map((r) => toRelation(r, ctx)),
  };
}
```

**Append-only within a MAJOR**: once `v1.0.0` ships, this file can only have fields added (MINOR) or aliased (MINOR). It cannot remove or rename. A removal/rename triggers a `v2.0.0` cycle.

### Drift strategies

Four ways an adapter handles a schema change.

| Strategy             | When                                                        | Adapter action                                                                                                                             | Version impact                                                                 |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Ignore**           | New property added to data; not yet exposed by adapter      | Nothing — `toV1Wire` doesn't read it                                                                                                       | None                                                                           |
| **Alias**            | Property renamed in data                                    | Adapter reads new name, exposes old name                                                                                                   | None (transparent)                                                             |
| **Freeze + warning** | Property `value_type` changed in a way incompatible with v1 | Adapter returns sentinel (`null`, last-known value, or 410-style flag) + response includes `Warning: 199 - "Field X frozen in v1, see v2"` | MINOR (the warning is itself new behavior)                                     |
| **Hard fail**        | Property deleted from data with no fallback path            | Adapter cannot produce response; impact analyzer blocks the PR                                                                             | Requires human decision: either restore data, add a fallback, or initiate `v2` |

### Impact analyzer

Script: `bun run api:impact` (to implement, deferred).

**Inputs**:

- The schema catalogue **before** the PR (HEAD)
- The schema catalogue **after** the PR (working tree)
- Every active `packages/api-vN/` adapter

**Output** (illustrative):

```
$ bun run api:impact

PR: feat(schema): add family-crest property to character

  Adapter api-v1.4.2 : no-op
    → family_crest added to character entity-type
    → adapter does not reference this property
    → no version bump required, no action

  Adapter api-v2.0.0 (draft) : minor-additive
    → family_crest mappable as optional field
    → SUGGESTION: add to packages/api-v2/src/wire-format/character.ts
    → SUGGESTION: bump version to v2.0.1 (or v2.1.0 if grouping)
    → SUGGESTION: append "### Added\n- character.family_crest" to packages/api-v2/CHANGELOG.md

RESULT: PR is safe to merge. No blocking action.
```

```
PR: refactor(schema): rename birth_island to birthplace

  Adapter api-v1.4.2 : BREAKING (without intervention)
    → property birth_island referenced by adapter no longer exists in source
    → REQUIRED ACTION (choose one):
       a) Add aliasing rule to packages/api-v1/src/wire-format/character.ts
          (read entity.properties.birthplace, expose as birth_island)
       b) Freeze birth_island with deprecation warning
       c) Open a v2.0.0 release that uses the new name

RESULT: PR is BLOCKED until resolution.
```

**Wiring**: lefthook pre-commit hook + CI gate. Blocking behavior on `BREAKING` and `hard-fail`. Warning-only on `minor-additive`.

### Version lifecycle

| State        | Headers served                                                       | Cohabits with  | Duration                                 |
| ------------ | -------------------------------------------------------------------- | -------------- | ---------------------------------------- |
| **Current**  | `X-API-Version: vN.x.y`                                              | previous MAJOR | until next MAJOR ships                   |
| **Previous** | `X-API-Version: v(N-1).x.y` + `Deprecation: true` + `Sunset: <date>` | current MAJOR  | 18 months minimum after next MAJOR ships |
| **Sunset**   | 410 Gone with link to migration guide                                | none           | indefinitely (URL kept for clarity)      |

Only two MAJOR versions are ever served simultaneously. When a third MAJOR ships, the oldest enters sunset.

### PR workflow

For every PR that touches `/data/schemas/` or `packages/api-*/`:

1. **Pre-commit hook** runs `bun run api:impact`. Output displayed.
2. **CI gate** re-runs the analyzer:
   - `no-op` → green, no action.
   - `minor-additive` → warning, suggested bump in PR description.
   - `breaking` → red, PR blocked.
   - `hard-fail` → red, PR blocked with strong wording.
3. **If adapter code is touched**, `packages/api-vN/CHANGELOG.md` **must** be updated in the same PR (lefthook check, then CI re-check).
4. **MINOR/PATCH bump** is part of the PR. Version source of truth: `packages/api-vN/package.json` `version` field.
5. **OpenAPI snapshot** is regenerated and committed under `docs/api-versions/v1/openapi-<MINOR>.<PATCH>.json` in the same PR.
6. **Tag** the merge commit with `api-vN.MINOR.PATCH` when ready to release.

### CHANGELOG format

Each `packages/api-vN/CHANGELOG.md` follows Keep-a-changelog 1.1.0:

```md
# Changelog — Public API v1

## v1.4.0 — 2027-02-15

### Added

- `properties.family_crest` on `character` entity-type. Optional
  string field. ADR-031.

### Changed

- (none)

### Deprecated

- `properties.birth_island` on `character`. Use `birthplace` instead.
  Removal scheduled for v2.0.0 (no date set). Header
  `Warning: 299 - "birth_island will be removed in v2"` is added when
  this field is included in a response.

### Removed

- (none)

### Fixed

- (none)

### Security

- (none)

## v1.3.7 — 2027-01-30

### Fixed

- `GET /entities/character/:slug` no longer leaks `last_appearance_source`
  when it equals an unreached chapter. ADR-030.
```

## 9. OpenAPI strategy

**Single source of truth**: the schema-engine. No hand-written OpenAPI.

**Generator pipeline**:

```
ValidatedCatalogue + packages/api-vN/wire-format/  ──►  printer  ──►  openapi-<MINOR>.<PATCH>.json
```

The printer is an extension of the generator built in ADR-024 Phase A. It walks the wire-format adapters and emits:

- `components.schemas` — one per wire-format type (`CharacterV1`, `BountyEntryV1`, …)
- `paths` — one per route handler
- `components.parameters` — common parameters (`progression`, `lang`, `fields`, …)
- `components.responses` — common envelopes (`ErrorEnvelope`, `Pagination`)
- `info.version` — `MINOR.PATCH` (the URL only carries MAJOR; the OpenAPI carries the exact bump)
- `examples` — auto-generated from a curated fixture set (Luffy, Zoro, Wano arc, etc.)

**Lint**: `spectral lint` in CI with a project ruleset (extends `spectral:oas`, adds project-specific rules like "all paths require `progression` parameter unless on an allow-list").

**Round-trip test**: a CI test generates a TypeScript client from the OpenAPI (e.g. via `openapi-typescript`) and uses it against a test server backed by the real adapter. Compilation failure = wire regression detected.

**Hosting**: `/api/v1/openapi.json` serves the current latest MINOR.PATCH. Archived snapshots under `docs/api-versions/v1/` are served as static files (also via `/api/v1/openapi-1.4.2.json` for direct access).

**Interactive doc**: `/api/v1/docs` renders Redoc as a static HTML page. Zero JS-runtime cost, perfect CDN cacheability.

## 10. Authentication and rate limiting

**v1.0.0 baseline**:

- Public, no authentication.
- Rate limit by IP via Cloudflare Workers in front of Vercel.
  Default: 60 req/min per IP, burst 120.
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- 429 with `Retry-After` when exceeded.

**Future tiers** (separate ADR each):

- Optional anonymous API key for higher quotas (free, self-service).
- Authenticated tier (GitHub OAuth) for elevated quotas.
- Commercial tier — not in v1 scope, would require a business decision first.

**Abuse mitigation**:

- Block list maintained via env var `BLOCKED_IPS=` (parallels `BLOCKED_GITHUB_USERNAMES` in Phase 7).
- Cloudflare WAF rules for known scrapers.
- 410 Gone on requests to sunsetted versions (don't engage the analyzer for old versions).

## 11. Hosting and deployment

**Workspace**: `apps/api/` (new). Separate from `apps/dashboard/` to:

- Isolate the bundle size budget (Vercel function 250MB / 500MB limits)
- Deploy independently (an API hotfix doesn't redeploy the dashboard)
- Pin different SLAs (dashboard can be down briefly; the API should not)

**Runtime**: TanStack Start route handlers (consistent with rest of the project) backed by Vercel Functions. Reads SQLite via `packages/sdk` using the `createClient` (in-process) path.

**Caching**:

- `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` on entity GETs
- `Cache-Control: public, s-maxage=2592000` (30 days) on vocabularies
- `Vary: X-API-Version, Accept-Language` (matters once locale-negotiation enters via headers; query param `?lang=` participates in the URL key naturally)
- Cloudflare CDN in front of Vercel absorbs ≥95% of reads at the edge.

**Bundle strategy**: the SQLite `.db` artifact is bundled into the Vercel function (per ADR-019's pattern for the dashboard). When `.db` size approaches 250MB, migrate to Turso or D1 — both compatible with `better-sqlite3`'s API surface, so the SDK code doesn't change.

## 12. Implementation phasing (deferred)

When the time comes, implementation splits into 6 phases on a feature
branch `feat/public-api-v1`:

| Phase                          | Scope                                                                                  | Depends on      |
| ------------------------------ | -------------------------------------------------------------------------------------- | --------------- |
| **0. Doc-only** (this PR)      | This file + ADR-025 + CONVENTIONS update + ROADMAP entry                               | nothing         |
| **B' (suite ADR-024)**         | SDK camelCase + paired generated types                                                 | ADR-024 Phase B |
| **1. Foundation**              | `apps/api/` workspace, routing, error envelope, rate-limit middleware, health endpoint | B'              |
| **2. Wire-format v1**          | `packages/api-v1/` package, adapters per resource, round-trip tests                    | 1               |
| **3. Read endpoints**          | entities, vocabularies, narratives, listing, search                                    | 2               |
| **4. i18n resolution**         | `value_key` → text pipeline, fallback rules, vocabulary labels                         | 3               |
| **5. OpenAPI + docs**          | Printer, route, Redoc, Spectral lint, round-trip test                                  | 3               |
| **6. Versioning + monitoring** | Impact analyzer, lefthook hook, CI gate, CHANGELOG enforcement, logs, observability    | 5               |

Each phase = 1 PR mergeable into the integration branch. Final
release v1.0.0 = merge of `feat/public-api-v1` to `main` + git tag.

## 13. Open questions

These must be answered by a follow-up ADR before phase 1 starts.

1. **`?lang=` enforcement**: required on all content endpoints, or default to `en` when omitted?
2. **`?progression=` enforcement**: required, or default to "nothing visible" with a documented error? Current direction: required.
3. **Cache granularity**: normalize `progression` to arc boundary by default with `?precise=true` opt-in?
4. **Authentication baseline**: none in v1, or optional API key for analytics + abuse-tracking even without quota differentiation?
5. **Write endpoints in v1**: confirmed out of scope?
6. **Hosting**: `apps/api/` workspace vs route group inside `apps/dashboard/`? Direction: separate workspace.
7. **Adapter file decomposition**: one per resource (entities, vocabularies, narratives, search) vs single `wire-format.ts`?
8. **Doc renderer**: Redoc statique, Swagger UI, or Stoplight Elements?
9. **Old MAJOR support duration**: 12 months minimum, 18 months default — confirm 18?
10. **CHANGELOG file**: one per `packages/api-vN/` (Keep-a-changelog) vs single top-level `docs/API_CHANGELOG.md`?
11. **Enum-value addition policy**: MINOR (documented risk) or MAJOR (zero surprise)? Direction: MAJOR for `epistemic_status`, MINOR for decorative vocabularies.
12. **OpenAPI snapshot storage**: in-repo under `docs/api-versions/v1/openapi-*.json` vs externalized (R2, GitHub Releases)?
13. **Impact analyzer enforcement**: blocking on `breaking` only, or also on `minor-additive` (force explicit decision)?
14. **Adapter representation**: TypeScript code vs declarative JSON config? Direction: TS for v1, evaluate JSON config when 95% of rules are mechanical.

## 13a. Webhook event model (taxonomy fixed, delivery deferred)

Ratified by **ADR-028**. Delivery is deferred; the taxonomy and the
emit seam are fixed now so nothing forecloses it.

**Event taxonomy** (stable):

| Event                | Fires when                                       |
| -------------------- | ------------------------------------------------ |
| `entity.created`     | a new entity enters the corpus                   |
| `entity.updated`     | an existing entity's data changes                |
| `entity.deleted`     | an entity is removed                             |
| `source.published`   | a new chapter / episode / film enters the corpus |
| `vocabulary.changed` | a vocabulary gains/edits/disables a value        |
| `build.completed`    | a build artifact finishes (carries the diff)     |

**Envelope** (snake_case, consistent with the REST wire format):

```json
{
  "event": "source.published",
  "id": "manga-chapter:1145",
  "type": "manga-chapter",
  "schema_hash": "sha256-…",
  "occurred_at": "2027-03-01T09:00:00Z",
  "api_version": "v1.4.2"
}
```

**Emit seam**: the build pipeline (`packages/db-builder`) and the
PR-merge flow. The build manifest already records build metadata;
the prerequisite is a **manifest-to-manifest diff** (entities and
sources added or changed since the previous build). `db-builder`
refactors must preserve this diff capability — it is the single seam
every webhook feature reads from, and it also feeds the Phase 6.6
`/help-wanted` and "recently revealed" surfaces.

**Delivery (future, own ADR)**: a dispatcher reads the build diff,
signs payloads (HMAC-SHA256 per subscriber), POSTs to subscriber URLs
with retry + exponential backoff, and exposes subscription management
in the dashboard. Not implemented; only the taxonomy and seam are
fixed here.

## 14. References

- ADR-028 — Anticipate availability links + webhook event model (this section's source)
- ADR-025 — Public REST API with versioned wire-format adapters
- ADR-024 — End-to-end type-safe SDK from generated Zod schemas (Phase A, prerequisite for the SDK side)
- ADR-019 — Bundle `/data` into the dashboard SSR output for serverless deploys (informs the bundling strategy for `apps/api/`)
- ADR-018 — Migrate dashboard from Vite + standalone Bun API to TanStack Start (sets the framework precedent for `apps/api/`)
- ADR-015 — Open contributions with two-stage R2 + admin moderation queue (informs the auth / rate-limit baseline)
- `/docs/ARCHITECTURE.md` § "Future considerations" — flags the API as future scope; this doc is the deferred design
- `/docs/CONVENTIONS.md` § "Wire formats and SDK conventions" — codifies the naming split
- `/docs/ROADMAP.md` § "Public API" — phased delivery plan
