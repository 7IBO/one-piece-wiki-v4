/**
 * Unit tests for the schema-migration helper: the pure transforms and
 * the runner's change/delete/unchanged classification. No filesystem
 * is touched — `applyMigration` operates on in-memory EntityFile[].
 */
import { describe, expect, it } from 'bun:test';
import { applyMigration, detectLosses } from '../src/migrate/runner.ts';
import {
  removeProperty,
  removeRelationType,
  renameProperty,
  renameRelationQualifier,
  renameRelationType,
} from '../src/migrate/transforms.ts';
import type { EntityData, EntityFile, Migration } from '../src/migrate/types.ts';

function character(): EntityData {
  return {
    id: 'character:test',
    type: 'character',
    schema_version: 1,
    properties: {
      name: [{ value_key: 'character.test.name', since: 'manga-chapter:1' }],
      bounty: [{ value: 100, since: 'manga-chapter:1' }],
    },
    relations: [
      {
        type: 'member-of',
        target: 'crew:x',
        qualifiers: { role: 'captain', since: 'manga-chapter:1' },
      },
      { type: 'rival-of', target: 'character:y' },
    ],
  };
}

describe('transforms', () => {
  it('renames a property and preserves order', () => {
    const out = renameProperty(character(), 'bounty', 'reward');
    const props = out['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(['name', 'reward']);
    expect('bounty' in props).toBe(false);
  });

  it('is a no-op when the property is absent', () => {
    const input = character();
    expect(renameProperty(input, 'nonexistent', 'x')).toBe(input);
  });

  it('removes a property', () => {
    const out = removeProperty(character(), 'bounty');
    expect('bounty' in (out['properties'] as Record<string, unknown>)).toBe(false);
  });

  it('renames a relation type on every match', () => {
    const out = renameRelationType(character(), 'rival-of', 'enemy-of');
    const relations = out['relations'] as { type: string; }[];
    expect(relations.map((r) => r.type)).toEqual(['member-of', 'enemy-of']);
  });

  it('removes all relations of a type', () => {
    const out = removeRelationType(character(), 'member-of');
    const relations = out['relations'] as { type: string; }[];
    expect(relations.map((r) => r.type)).toEqual(['rival-of']);
  });

  it('renames a qualifier inside a specific relation type', () => {
    const out = renameRelationQualifier(character(), 'member-of', 'role', 'rank');
    const relations = out['relations'] as { type: string; qualifiers?: Record<string, unknown>; }[];
    const memberOf = relations.find((r) => r.type === 'member-of');
    expect(memberOf?.qualifiers && 'rank' in memberOf.qualifiers).toBe(true);
    expect(memberOf?.qualifiers && 'role' in memberOf.qualifiers).toBe(false);
  });

  it('does not mutate the input', () => {
    const input = character();
    const snapshot = JSON.stringify(input);
    renameProperty(input, 'bounty', 'reward');
    removeRelationType(input, 'member-of');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('applyMigration', () => {
  const files: EntityFile[] = [
    { path: 'a.json', data: character() },
    {
      path: 'b.json',
      data: { id: 'character:other', type: 'character', properties: {}, relations: [] },
    },
  ];

  it('classifies changed vs unchanged files', () => {
    const migration: Migration = {
      id: '0001-rename-bounty',
      description: 'bounty → reward',
      up: (data) => renameProperty(data, 'bounty', 'reward'),
    };
    const report = applyMigration(files, migration);
    expect(report.changed.map((c) => c.path)).toEqual(['a.json']);
    expect(report.unchanged).toBe(1);
    expect(report.deleted).toHaveLength(0);
  });

  it('collects deletions when up returns null', () => {
    const migration: Migration = {
      id: '0002-drop-others',
      description: 'delete character:other',
      up: (data) => (data['id'] === 'character:other' ? null : data),
    };
    const report = applyMigration(files, migration);
    expect(report.deleted).toEqual(['b.json']);
    expect(report.unchanged).toBe(1);
  });
});

describe('detectLosses', () => {
  const files: EntityFile[] = [{ path: 'a.json', data: character() }];

  it('flags a removed property (history loss)', () => {
    const report = applyMigration(files, {
      id: '0003',
      description: 'drop bounty',
      up: (data) => removeProperty(data, 'bounty'),
    });
    const losses = detectLosses(report);
    expect(losses).toHaveLength(1);
    expect(losses[0]?.reason).toBe('property-removed');
    expect(losses[0]?.detail).toContain('bounty');
  });

  it('flags removed relations', () => {
    const report = applyMigration(files, {
      id: '0004',
      description: 'drop member-of',
      up: (data) => removeRelationType(data, 'member-of'),
    });
    expect(detectLosses(report).some((l) => l.reason === 'relations-removed')).toBe(true);
  });

  it('flags file deletions', () => {
    const report = applyMigration(files, { id: '0005', description: 'delete', up: () => null });
    expect(detectLosses(report)).toEqual([
      { path: 'a.json', reason: 'file-deleted', detail: 'entity file removed' },
    ]);
  });

  it('does NOT flag a pure rename as a loss', () => {
    const report = applyMigration(files, {
      id: '0006',
      description: 'rename bounty → reward',
      up: (data) => renameProperty(data, 'bounty', 'reward'),
    });
    expect(detectLosses(report)).toEqual([]);
  });
});
