/**
 * Types for the schema-migration helper. During the pre-freeze
 * volatile regime (ADR-029) breaking schema changes — renames,
 * removals, retypes — are routine. A migration rewrites the affected
 * entity JSON in `/data` so a rename stays a one-command operation
 * rather than a manual sweep.
 *
 * A migration is a pure function over one entity's data; the runner
 * walks the corpus and the CLI writes the changed files.
 */
export type EntityData = Record<string, unknown>;

/**
 * Transforms one entity's data. Returns the transformed data, the
 * same object when nothing changed, or `null` to signal the entity
 * should be deleted.
 */
export type Migration = {
  readonly id: string;
  readonly description: string;
  readonly up: (data: EntityData) => EntityData | null;
};

export type MigrationChange = {
  readonly path: string;
  readonly before: EntityData;
  readonly after: EntityData;
};

export type EntityFile = {
  readonly path: string;
  readonly data: EntityData;
};

export type MigrationReport = {
  readonly migrationId: string;
  readonly changed: readonly MigrationChange[];
  readonly deleted: readonly string[];
  readonly unchanged: number;
};
