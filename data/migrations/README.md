# Data migrations

During the **pre-freeze** schema regime (ADR-029) breaking changes —
renaming a property, removing a relation type, renaming a qualifier —
are routine. Because the source of truth is JSON in `/data`, such a
change means rewriting every entity file that used the old shape. A
migration makes that a one-command operation instead of a manual
sweep.

## Writing a migration

Create a file here named `NNNN-short-slug.ts` (zero-padded sequence),
default-exporting a `Migration`:

```ts
// Import via relative path to the engine source — `/data` is not a workspace
// package, so the `@onepiece-wiki/schema-engine` specifier does not resolve here.
import {
  type Migration,
  renameProperty,
} from '../../packages/schema-engine/src/index.ts';

const migration: Migration = {
  id: '0002-bounty-to-reward',
  description: 'Rename character `bounty` property to `reward`.',
  up: (data) => renameProperty(data, 'bounty', 'reward'),
};

export default migration;
```

> The first real migration is [`0001-relation-dedup.ts`](0001-relation-dedup.ts) (ADR-066).

`up` receives one entity's parsed JSON and returns the transformed
data, the same object when nothing changed, or `null` to delete the
entity. Compose the helpers from `@onepiece-wiki/schema-engine`:
`renameProperty`, `removeProperty`, `renameRelationType`,
`removeRelationType`, `renameRelationQualifier`. For anything they
don't cover, write a plain function over `data`.

## Running

Two CLIs. Use **`migrate:all`** (the runner, ADR-070) normally; the
single-file `migrate` is for ad-hoc replays.

```bash
# RUNNER — apply every migration not yet in applied.json, in order
bun run migrate:all --dry-run   # list pending + the files they'd touch
bun run migrate:all             # apply pending, then append IDs to applied.json
bun run migrate:all --check     # exit 1 if anything is pending (CI gate)

# single migration (ad-hoc)
bun run migrate data/migrations/0001-bounty-to-reward.ts --dry-run
bun run migrate data/migrations/0001-bounty-to-reward.ts
```

`applied.json` is the committed ledger of which migrations have run against the
corpus. `migrate:all` skips applied ones and records the ones it applies — so an
up-to-date checkout reports **0 pending**. (`migrate` writes nothing to the
ledger; if you use it, add the ID to `applied.json` yourself.)

After a real run (either CLI):

1. Bump the affected entity type's `schema_version` in
   `data/schemas/entity-types/`.
2. `bun run schema:generate` — regenerate the Zod types.
3. `bun run format` — dprint normalises the rewritten JSON.
4. `bun run validate` — confirm the corpus still parses.
5. Update the internal consumers (`packages/sdk`, `apps/dashboard`,
   `apps/preview`) in the **same PR** — see ADR-029.

Migrations are kept in the repo as a historical record. They are not
re-run on every build; `migrate:all` replays only what the ledger says is
pending (and all current transforms are idempotent, so a re-run would no-op
anyway). The runner + applied-state ledger is ADR-070; the per-applied
`schema_version` model is ADR-059.

## Inspecting versions (ADR-059)

The model is **migrate-forward**: one current schema, data rewritten to
match it. `schema_version` is a tracking field, not a validation gate —
`validate` checks every entity against the _current_ type schema.

```bash
# per-type: the type's current schema_version + the distribution of entity
# versions, flagging entities that lag (i.e. what a migration would touch)
bun run schema:versions
```

`check:coherence` additionally errors (`ENTITY_SCHEMA_VERSION_AHEAD`) if an
entity declares a version _newer_ than its type has reached — corrupt data or a
forgotten type bump. Entities _behind_ the type are fine (the normal state after
an additive bump) and are only reported, never failed.
