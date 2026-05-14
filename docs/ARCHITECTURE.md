# Architecture

## Vision

A spoiler-aware One Piece wiki that treats fiction the way historians treat
reality: every fact is sourced, dated, and qualified by who knows what when.
The data layer is a **knowledge graph** of versioned facts, and every reader
experiences a view of that graph filtered to their personal in-universe
progression.

The architecture optimizes for three properties, in order:

1. **Correctness of the data model** — the model must be able to express
   facts as nuanced as "Sabo is alive (true), but believed dead by the world
   after chapter 956 (false belief), revealed alive to Luffy in chapter 731
   (private knowledge), and re-confirmed publicly in chapter 1054".
2. **Maintainability** — schema-driven everything. No property name is
   hardcoded. Adding a new entity type or property never requires code
   changes in the dashboard.
3. **Performance at read time** — the public app must feel instant, even with
   tens of thousands of entities and complex spoiler filters. This is
   achieved through aggressive build-time precomputation into SQLite.

## Core invariants

1. **JSON is the source of truth.** Everything else is derived. SQLite is a
   build artifact, regenerated from scratch on every change.
2. **Schemas are data, not code.** Entity types, property types, and relation
   types are JSON files. Zod schemas are generated from them.
3. **Slugs are English, kebab-case, public, mutable (with redirects).** IDs
   are internal, immutable, prefixed by type (`type:slug`).
4. **Every value carries provenance.** Source (chapter, episode, SBS),
   in-universe date (when applicable), epistemic status, optional event link.
5. **Translations are separate from structure.** Entity files are
   language-neutral. Translations live in a parallel tree.
6. **Narratives are separate from data.** Prose summaries live in a
   `narratives/` tree, referenced by key, never inlined.

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Source of truth                           │
│                                                                 │
│   /data/schemas/              ← entity-types, property-types,   │
│                                  relation-types, vocabulary     │
│                                                                 │
│   /data/universes/one-piece/                                    │
│     ├── entities/             ← *.json per entity               │
│     ├── translations/         ← per-locale property values      │
│     └── narratives/           ← per-locale prose, by key        │
│                                                                 │
│   /data/migrations/           ← JSON migration scripts          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                  ┌──────────────┴─────────────┐
                  │     Build pipeline         │
                  │  (packages/db-builder)     │
                  │                            │
                  │  1. Load schemas           │
                  │  2. Generate Zod           │
                  │  3. Validate all entities  │
                  │  4. Resolve references     │
                  │  5. Compute derived fields │
                  │  6. Apply inferences       │
                  │  7. Write SQLite           │
                  │  8. Generate search index  │
                  └──────────────┬─────────────┘
                                 │
                  ┌──────────────┴─────────────┐
                  │     Derived artifacts      │
                  │                            │
                  │  /dist/onepiece.db         │  SQLite, read-only
                  │  /dist/search-index/       │  Pagefind or similar
                  │  /dist/manifest.json       │  Build metadata
                  └──────────────┬─────────────┘
                                 │
              ┌──────────────────┴─────────────────┐
              │                                    │
              ▼                                    ▼
      ┌───────────────┐                  ┌──────────────────┐
      │  Preview app  │                  │    Dashboard     │
      │  (phase 1)    │                  │   (phase 1)      │
      │               │                  │                  │
      │  Reads SQLite │                  │  Reads SQLite    │
      │  Renders raw  │                  │  Writes JSON via │
      │   entity data │                  │   GitHub API     │
      └───────────────┘                  └──────────────────┘
```

## Stack

### Runtime and tooling

| Concern            | Choice                                                |
| ------------------ | ----------------------------------------------------- |
| Runtime            | Bun (with Node fallback where needed)                 |
| Monorepo           | Turborepo                                             |
| Web framework      | TanStack Start                                        |
| UI primitives      | Base UI                                               |
| Styling            | Tailwind CSS v4 with `@theme` CSS-first config        |
| Validation         | Zod                                                   |
| Forms              | React Hook Form + `@hookform/resolvers/zod`           |
| Server state       | TanStack Query                                        |
| Build DB           | SQLite via `better-sqlite3`                           |
| GitHub integration | Octokit with GitHub App                               |
| Linter             | oxlint                                                |
| Formatter          | dprint (oxfmt under consideration when it stabilises) |
| Type checker       | `tsc --noEmit`, cached by Turborepo                   |
| Unit tests         | Vitest                                                |
| E2E tests          | Playwright                                            |
| Git hooks          | lefthook                                              |
| Commits            | Conventional Commits + commitlint                     |
| Dead code          | knip                                                  |
| Image storage      | Cloudflare R2                                         |
| Deployment         | Vercel                                                |

### Why these choices

- **Bun**: fast install, fast script execution, native TypeScript. Falls back
  to Node where compatibility matters (`better-sqlite3`, some Octokit
  ecosystem packages).
- **Turborepo**: best-in-class task caching, integrates well with Vercel.
- **TanStack Start**: file-based routing with end-to-end type-safe server
  functions, no REST/tRPC boilerplate. Perfect for the dashboard.
- **Base UI**: headless, unstyled, fully accessible primitives. Pairs with
  Tailwind without conflicts.
- **Tailwind v4**: new Oxide engine is fast, CSS-first config keeps tokens
  next to the code that consumes them.
- **Zod**: type-safe validation, schema introspection, runs in browser and
  Node. Single source of truth for shape.
- **oxlint**: Rust-based linter, an order of magnitude faster than ESLint at
  this project's scale.
- **Cloudflare R2 + Vercel**: zero egress fees on R2, Vercel handles
  TanStack Start natively, Cloudflare CDN can sit in front of images.

## Monorepo layout

```
/
├── apps/
│   ├── dashboard/                # contributor editing UI
│   └── preview/                  # minimal reading app (phase 1)
│
├── packages/
│   ├── schemas/                  # Zod primitives + generated schemas
│   ├── schema-engine/            # parse schema JSON, generate Zod
│   ├── db-builder/               # JSON → SQLite pipeline
│   ├── sdk/                      # runtime data access (reads SQLite)
│   ├── ui/                       # Base UI + Tailwind components
│   ├── github-client/            # Octokit wrapper for PR automation
│   ├── i18n/                     # translation utilities
│   ├── tsconfig/                 # shared tsconfig presets
│   ├── oxlint-config/            # shared oxlint config
│   └── tailwind-config/          # shared Tailwind preset + tokens
│
├── data/
│   ├── schemas/
│   │   ├── entity-types/         # character.json, devil-fruit.json, …
│   │   ├── property-types/       # name.json, bounty.json, …
│   │   ├── relation-types/       # member-of.json, ate-fruit.json, …
│   │   └── vocabulary/           # haki-types.json, crew-roles.json, …
│   ├── universes/
│   │   └── one-piece/
│   │       ├── universe.json
│   │       ├── entities/         # one file per entity, grouped by type
│   │       ├── translations/     # per-locale, mirrors entities/
│   │       └── narratives/       # per-locale prose, by key
│   └── migrations/               # numbered TS migrations on JSON
│
├── docs/                         # all documentation
├── scripts/                      # one-off scripts (migration runners, etc.)
├── .github/                      # CI workflows, PR templates
│
├── CLAUDE.md                     # Claude Code instructions
├── README.md
├── package.json                  # workspace root
├── turbo.json
├── bunfig.toml
├── tsconfig.base.json
├── lefthook.yml
└── commitlint.config.ts
```

## Build pipeline (overview)

Detailed in `/docs/BUILD_PIPELINE.md`. Summary:

1. **Schema load**: read `/data/schemas/**` into memory
2. **Zod generation**: produce typed Zod schemas in
   `packages/schemas/generated/`
3. **Validation pass**: every JSON file in `/data/universes/**` is validated
   against the generated Zod. Errors abort the build.
4. **Reference resolution**: every `target` in a relation, every `event`,
   every `source` is checked for existence.
5. **Derived computation**: per entity, compute `first_appearance`,
   `last_appearance`, `current_value` per property at each canonical
   checkpoint (arc end), aggregate counters, etc.
6. **Inference pass**: apply rules like "all participants of a public event
   learn the facts the event reveals, unless marked secret".
7. **SQLite write**: emit a fresh `onepiece.db`. Tables are denormalized for
   read speed.
8. **Search index**: emit a Pagefind-compatible static index.
9. **Manifest**: emit a `manifest.json` with build metadata (commit, date,
   counts).

## Dashboard architecture (overview)

Detailed in `/docs/DASHBOARD_ARCHITECTURE.md`. Summary:

- TanStack Start app, server functions for all writes.
- Reads from the same SQLite the preview app uses (read-only).
- Writes go through `packages/github-client`, which opens a PR per submission.
- Forms are dynamically generated from schema definitions. No form code is
  type-specific.
- Drafts persist in IndexedDB (client) plus optimistic-lock SHA tracking.
- No persistent server-side state in phase 1 (admin-only, low contention).

## Public web app (deferred)

A minimal **preview** app exists in phase 1 (raw entity display, basic
spoiler filter) to validate the data model end-to-end. The full public app
is built in a later phase, with proper SEO, design, and SSG.

## Deployment

- **Vercel** hosts both apps (`apps/dashboard`, `apps/preview`).
- **Cloudflare R2** holds the image bucket, fronted by Cloudflare's CDN.
- **GitHub Actions** runs CI: lint, typecheck, test, build, and on `main`
  triggers a Vercel deployment.
- **The SQLite artifact** is built either at deploy time (Vercel build) or
  in CI and committed to a release. The exact strategy is documented in
  `/docs/BUILD_PIPELINE.md`.

### R2 storage key convention

Image files use a **flat namespace** in the R2 bucket:

```
images/<image-slug>.<format>
```

The `<image-slug>` is the entity's slug (the part after the
`image:` prefix in its id); `<format>` matches the entity's `format`
property (`webp`, `jpg`, `png`, `gif`, `avif`, `svg`).

Examples:

```
images/luffy-bounty-30m.webp
images/luffy-bounty-3b.webp
images/luffy-gear-5.webp
images/straw-hats-marineford-arrival.webp
images/gomu-gomu-no-mi.png
```

The layout is deliberately flat. An image can be linked from multiple
entities (group photos, reused covers), so there is no single
"owning" entity to nest under. The slug carries the meaning. The full
image-handling guide is in `/docs/IMAGES.md`.

## Extensibility

The architecture is designed so adding a new universe (e.g. Naruto) requires
no code changes:

- Add `/data/universes/naruto/`
- Add or extend schema types in `/data/schemas/`
- Add translations and narratives

The build pipeline and apps treat universe as a top-level dimension. In
phase 1, only One Piece is exposed in the UI, but the model is universe-aware
from day one.

## Future considerations

- **Real-time collaborative editing** in the dashboard (Yjs or similar)
  becomes relevant when contributor count grows beyond ~10 active editors.
- **A read-side cache layer** (Redis or edge KV) becomes relevant if SQLite
  page generation exceeds Vercel's serverless limits.
- **A separate read API** (REST or GraphQL) becomes relevant when third
  parties want to consume the data (a likely demand from YouTubers, fan apps).
- **A search service** (Meilisearch) replaces Pagefind when faceted search
  needs exceed what static indexing can do.

None of these are needed in phase 1. The architecture allows them to be
added without rewriting the core model.
