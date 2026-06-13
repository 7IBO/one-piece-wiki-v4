# Docs map

Entry point for humans and agents. New sessions should read the core docs in
the order below (also mandated by `/CLAUDE.md`). **Authoritative over any doc**:
`/data/schemas/**` (the catalogue), `packages/schemas` (generated Zod), and the
ADR log for decisions — docs describe; the schema files decide.

| Doc                                                    | Answers                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`/CLAUDE.md`](../CLAUDE.md)                           | Hard rules, imposed stack, definition of done, workflow.                                                                                                                |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | High-level vision and stack.                                                                                                                                            |
| [DATA_MODEL.md](DATA_MODEL.md)                         | Conceptual model: the three primitives, historisation, the epistemic axis (values **and** relations), sources/progression, canon, provenance, i18n, narratives, images. |
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md)                       | Formal schema-file spec (entity/property/relation/vocabulary), value types, base & declared qualifiers, universe scoping.                                               |
| [INVENTORY.md](INVENTORY.md)                           | Reference list of every type / property / relation / vocabulary. Hand-maintained — verify against the catalogue.                                                        |
| [CONVENTIONS.md](CONVENTIONS.md)                       | Naming, IDs vs slugs, JSON formatting, code style.                                                                                                                      |
| [EPISTEMIC_MODEL.md](EPISTEMIC_MODEL.md)               | Epistemic statuses, false beliefs, hidden identities, reveals, retcons.                                                                                                 |
| [CANON_MODEL.md](CANON_MODEL.md)                       | Canon scopes, filler, (planned) semi-canon.                                                                                                                             |
| [I18N_STRATEGY.md](I18N_STRATEGY.md)                   | Translation keys, locales, name variants/editions.                                                                                                                      |
| [BUILD_PIPELINE.md](BUILD_PIPELINE.md)                 | JSON → SQLite build and the read-side schema.                                                                                                                           |
| [DASHBOARD_ARCHITECTURE.md](DASHBOARD_ARCHITECTURE.md) | The editing dashboard (TanStack Start).                                                                                                                                 |
| [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md)         | PR automation, GitHub App, contribution flow.                                                                                                                           |
| [IMAGES.md](IMAGES.md)                                 | Image entities, R2 storage, licensing, spoiler gating.                                                                                                                  |
| [DECISIONS.md](DECISIONS.md)                           | ADR log — architectural decisions (newest on top).                                                                                                                      |
| [ROADMAP.md](ROADMAP.md)                               | Phases and current state.                                                                                                                                               |
| [STATE.md](STATE.md)                                   | Living handoff: where things stand, open threads — read to resume.                                                                                                      |
| [DATA_EXPANSION_PLAN.md](DATA_EXPANSION_PLAN.md)       | Fandom-informed plan to expand the model (executing cluster by cluster).                                                                                                |

## Quick "where do I…?"

- **Add an entity type / property / relation / vocabulary** → `SCHEMA_SPEC.md`
  (procedure) + `DATA_MODEL.md` (introduce the concept first) + an ADR.
- **Understand spoilers / false beliefs / reveals** → `EPISTEMIC_MODEL.md`.
- **Understand the build artifact / SDK reads** → `BUILD_PIPELINE.md`.
- **Resume mid-stream work** → `STATE.md`.
- **See why a decision was made** → `DECISIONS.md` (search the ADR).
