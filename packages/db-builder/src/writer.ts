/**
 * SQLite writer: opens a fresh file at the target path, applies DDL,
 * inserts the extracted rows inside a single transaction. Uses
 * positional parameter binding to avoid bun:sqlite's named-parameter
 * conflict with SQL reserved words (e.g. `type`).
 *
 * `populateDatabase` is exposed separately so tests can run the exact
 * production DDL + insert path against an in-memory database.
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NarrativeRow, TranslationRow } from './content.ts';
import type {
  AppearanceRow,
  EntityRow,
  ExtractedRows,
  PropertyRow,
  RelationRow,
} from './extract.ts';
import { DDL } from './schema.ts';

type Binding = SQLQueryBindings;

/** Everything the artifact stores: extracted entity rows + content trees. */
export type DatabaseRows = ExtractedRows & {
  readonly translations: readonly TranslationRow[];
  readonly narratives: readonly NarrativeRow[];
};

export type WriteResult = {
  readonly path: string;
  readonly counts: {
    entities: number;
    properties: number;
    relations: number;
    relations_inferred: number;
    appearances: number;
    translations: number;
    narratives: number;
  };
};

export function populateDatabase(db: Database, rows: DatabaseRows): WriteResult['counts'] {
  for (const stmt of DDL) db.exec(stmt);

  const insertEntity = db.prepare(
    `INSERT INTO entities
      (id, type, slug, schema_version, first_appearance_source, last_appearance_source,
       primary_canon_scope, canonical_name_key, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertProperty = db.prepare(
    `INSERT INTO properties
      (entity_id, property_id, value, since_source, until_source, epistemic_status,
       review_status, assisted_by, canon_scope, event_id, entry_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertRelation = db.prepare(
    `INSERT INTO relations
      (source_entity_id, target_entity_id, relation_type, qualifiers,
       since_source, until_source, epistemic_status, believed_by,
       known_truth_by, revealed_since, label, is_inferred)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAppearance = db.prepare(
    `INSERT INTO appearances
      (entity_id, source_id, appearance_type, is_first, qualifiers)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTranslation = db.prepare(
    `INSERT INTO translations (universe, locale, key, value) VALUES (?, ?, ?, ?)`,
  );
  const insertNarrative = db.prepare(
    `INSERT INTO narratives (universe, entity_id, locale, markdown) VALUES (?, ?, ?, ?)`,
  );

  const bindEntity = (r: EntityRow): Binding[] => [
    r.id,
    r.type,
    r.slug,
    r.schema_version,
    r.first_appearance_source,
    r.last_appearance_source,
    r.primary_canon_scope,
    r.canonical_name_key,
    r.data,
  ];
  const bindProperty = (r: PropertyRow): Binding[] => [
    r.entity_id,
    r.property_id,
    r.value,
    r.since_source,
    r.until_source,
    r.epistemic_status,
    r.review_status,
    r.assisted_by,
    r.canon_scope,
    r.event_id,
    r.entry_index,
  ];
  const bindRelation = (r: RelationRow): Binding[] => [
    r.source_entity_id,
    r.target_entity_id,
    r.relation_type,
    r.qualifiers,
    r.since_source,
    r.until_source,
    r.epistemic_status,
    r.believed_by,
    r.known_truth_by,
    r.revealed_since,
    r.label,
    r.is_inferred,
  ];
  const bindAppearance = (r: AppearanceRow): Binding[] => [
    r.entity_id,
    r.source_id,
    r.appearance_type,
    r.is_first,
    r.qualifiers,
  ];

  const txn = db.transaction((data: DatabaseRows) => {
    for (const row of data.entities) insertEntity.run(...bindEntity(row));
    for (const row of data.properties) insertProperty.run(...bindProperty(row));
    for (const row of data.relations) insertRelation.run(...bindRelation(row));
    for (const row of data.appearances) insertAppearance.run(...bindAppearance(row));
    for (const row of data.translations) {
      insertTranslation.run(row.universe, row.locale, row.key, row.value);
    }
    for (const row of data.narratives) {
      insertNarrative.run(row.universe, row.entity_id, row.locale, row.markdown);
    }
  });
  txn(rows);

  return {
    entities: rows.entities.length,
    properties: rows.properties.length,
    relations: rows.relations.length,
    relations_inferred: rows.relations.filter((r) => r.is_inferred === 1).length,
    appearances: rows.appearances.length,
    translations: rows.translations.length,
    narratives: rows.narratives.length,
  };
}

export function writeDatabase(path: string, rows: DatabaseRows): WriteResult {
  mkdirSync(dirname(path), { recursive: true });
  try {
    rmSync(path);
  } catch {
    // No prior file — fine.
  }

  const db = new Database(path, { create: true });
  let counts: WriteResult['counts'];
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = OFF');
    counts = populateDatabase(db, rows);
  } finally {
    db.close();
  }

  return { path, counts };
}
