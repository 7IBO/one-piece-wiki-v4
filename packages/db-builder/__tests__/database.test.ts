/**
 * End-to-end round trip against an in-memory SQLite: production DDL +
 * insert path (`populateDatabase`), then plain SQL reads. Proves the
 * artifact carries both relation directions with their labels, keeps
 * the four historisation axes on property entries, and stores the
 * translation + narrative content trees.
 */
import type { LoadedEntity, RelationType, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { extract } from '../src/extract.ts';
import { populateDatabase } from '../src/writer.ts';

const ateFruit: RelationType = {
  id: 'ate-fruit',
  schema_version: 1,
  labels: {
    en: { active: 'Ate fruit', inverse: 'Eaten by' },
    fr: { active: 'A mangé', inverse: 'Mangé par' },
  },
  valid_from_types: ['character'],
  valid_to_types: ['devil-fruit'],
  qualifiers: [],
  allow_multiple_concurrent: false,
  inverse_inferred: true,
  historical: true,
};

const testCatalogue: ValidatedCatalogue = {
  entityTypes: new Map(),
  propertyTypes: new Map(),
  relationTypes: new Map([[ateFruit.id, ateFruit]]),
  vocabularies: new Map(),
  qualifierTypes: new Map(),
  rules: new Map(),
  errors: [],
};

const luffy: LoadedEntity = {
  id: 'character:luffy',
  type: 'character',
  path: 'character/luffy.json',
  data: {
    id: 'character:luffy',
    type: 'character',
    schema_version: 1,
    slug: 'monkey-d-luffy',
    properties: {
      status: [
        {
          value: 'dead',
          since: 'manga-chapter:574',
          epistemic_status: 'believed_by_world',
          event: 'event:battle-of-marineford',
        },
      ],
    },
    relations: [
      {
        type: 'ate-fruit',
        target: 'devil-fruit:gomu-gomu',
        qualifiers: { since: 'manga-chapter:1' },
      },
    ],
  },
};

function buildDatabase(): Database {
  const db = new Database(':memory:');
  const rows = extract(new Map([[luffy.id, luffy]]), testCatalogue);
  populateDatabase(db, {
    ...rows,
    translations: [
      {
        universe: 'one-piece',
        locale: 'en',
        key: 'character.luffy.name.common',
        value: 'Monkey D. Luffy',
      },
    ],
    narratives: [
      {
        universe: 'one-piece',
        entity_id: 'character:luffy',
        locale: 'en',
        markdown: 'The future Pirate King.\n',
      },
    ],
    search: { docs: [], gates: [], trigrams: [] },
  });
  return db;
}

describe('populateDatabase (in-memory)', () => {
  const db = buildDatabase();

  it('stores both relation directions with their direction labels', () => {
    const rows = db
      .prepare(
        `SELECT source_entity_id, target_entity_id, relation_type, label, is_inferred
         FROM relations ORDER BY is_inferred`,
      )
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      source_entity_id: 'character:luffy',
      target_entity_id: 'devil-fruit:gomu-gomu',
      relation_type: 'ate-fruit',
      label: JSON.stringify({ en: 'Ate fruit', fr: 'A mangé' }),
      is_inferred: 0,
    });
    expect(rows[1]).toEqual({
      source_entity_id: 'devil-fruit:gomu-gomu',
      target_entity_id: 'character:luffy',
      relation_type: 'ate-fruit.inverse',
      label: JSON.stringify({ en: 'Eaten by', fr: 'Mangé par' }),
      is_inferred: 1,
    });
  });

  it('preserves the four historisation axes on property entries', () => {
    const row = db
      .prepare(
        `SELECT since_source, epistemic_status, event_id, value
         FROM properties WHERE entity_id = ? AND property_id = ?`,
      )
      .get('character:luffy', 'status') as Record<string, unknown>;
    expect(row['since_source']).toBe('manga-chapter:574');
    expect(row['epistemic_status']).toBe('believed_by_world');
    expect(row['event_id']).toBe('event:battle-of-marineford');
    expect(JSON.parse(row['value'] as string)['value']).toBe('dead');
  });

  it('stores translations keyed by (universe, locale, key)', () => {
    const row = db
      .prepare(`SELECT value FROM translations WHERE locale = ? AND key = ?`)
      .get('en', 'character.luffy.name.common') as Record<string, unknown>;
    expect(row['value']).toBe('Monkey D. Luffy');
  });

  it('stores narratives keyed by (entity_id, locale)', () => {
    const row = db
      .prepare(`SELECT markdown FROM narratives WHERE entity_id = ? AND locale = ?`)
      .get('character:luffy', 'en') as Record<string, unknown>;
    expect(row['markdown']).toBe('The future Pirate King.\n');
  });

  it('reports counts including the inferred split', () => {
    const db2 = new Database(':memory:');
    const rows = extract(new Map([[luffy.id, luffy]]), testCatalogue);
    const counts = populateDatabase(db2, {
      ...rows,
      translations: [],
      narratives: [],
      search: { docs: [], gates: [], trigrams: [] },
    });
    expect(counts.relations).toBe(2);
    expect(counts.relations_inferred).toBe(1);
    expect(counts.entities).toBe(1);
    db2.close();
  });
});
