# One Piece Wiki

A community-driven, spoiler-aware wiki for the One Piece universe. Every fact
is versioned by in-universe progression so readers can browse safely up to
their current manga chapter, anime episode, or film.

## What this project is

- A **knowledge graph** of the One Piece universe (characters, devil fruits,
  crews, chapters, events, locations…)
- Versioned by **in-universe progression** (chapter, episode, film)
- Multi-lingual (English and French in phase 1)
- Aware of **epistemic status** (believed vs confirmed, false deaths, hidden
  identities)
- Aware of **canon scope** (manga vs anime vs films vs SBS)
- Open data: source of truth is JSON in this repository

## What this project is not

- Not a Fandom replacement for casual fan content (no theory pages, no fanart
  galleries in phase 1)
- Not a runtime database with mutable state from the public web
- Not a CMS where editors type unstructured prose

## Quick start

```sh
bun install
bun run build:data       # JSON → SQLite
bun run dev              # dashboard + preview app
```

See `/docs/CONTRIBUTING.md` (to be written) for development workflow.

## Documentation

All documentation lives in `/docs`. Start with:

1. [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — vision, stack, monorepo layout
2. [`DATA_MODEL.md`](./docs/DATA_MODEL.md) — entities, properties, relations,
   historisation
3. [`SCHEMA_SPEC.md`](./docs/SCHEMA_SPEC.md) — how schemas are defined
4. [`CONVENTIONS.md`](./docs/CONVENTIONS.md) — naming, code style
5. [`ROADMAP.md`](./docs/ROADMAP.md) — phases and current state
6. [`DECISIONS.md`](./docs/DECISIONS.md) — architectural decision log

Deep dives (read when relevant):

- [`EPISTEMIC_MODEL.md`](./docs/EPISTEMIC_MODEL.md)
- [`CANON_MODEL.md`](./docs/CANON_MODEL.md)
- [`BUILD_PIPELINE.md`](./docs/BUILD_PIPELINE.md)
- [`DASHBOARD_ARCHITECTURE.md`](./docs/DASHBOARD_ARCHITECTURE.md)
- [`I18N_STRATEGY.md`](./docs/I18N_STRATEGY.md)
- [`GITHUB_INTEGRATION.md`](./docs/GITHUB_INTEGRATION.md)

## License

TBD. Data and code are intended to be open. The fictional content described
belongs to Eiichiro Oda and Shueisha.
