/**
 * Semantic entity-history diff (property/value change groups instead
 * of raw JSON patch lines).
 */
import { describe, expect, it } from 'bun:test';
import { diffEntityData, type HistoryDiffContext, stableSerialize } from '../history-diff.ts';

const ctx: HistoryDiffContext = {
  propertyTypes: new Map([
    ['bounty', { value_type: 'number', unit: '฿' }],
    ['status', { value_type: 'enum', value_constraints: { enum_ref: 'life-status' } }],
    ['name', { value_type: 'i18n_key' }],
  ]),
  vocabularies: new Map([
    ['life-status', {
      values: {
        alive: { labels: { en: 'Alive', fr: 'En vie' } },
        dead: { labels: { en: 'Dead', fr: 'Mort' } },
      },
    }],
  ]),
  translations: { en: { 'c.x.name': 'Test Guy' }, fr: {} },
  displayNameFor: (id) =>
    id === 'crew:straw-hat-pirates' ? { en: 'Straw Hat Pirates', fr: null } : undefined,
  locale: 'en',
  propertyLabel: (id) => ({ bounty: 'Bounty', status: 'Status', name: 'Name' }[id] ?? id),
  relationLabel: (id) => (id === 'member-of' ? 'Member of' : id),
  sourceDisplay: (id) => {
    const [type, slug] = id.split(':');
    return type === 'manga-chapter' ? `C${slug}` : id;
  },
};

describe('stableSerialize', () => {
  it('is insensitive to object key order at every depth', () => {
    expect(stableSerialize({ a: 1, b: { c: 2, d: 3 } }))
      .toBe(stableSerialize({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe('diffEntityData', () => {
  const before = {
    properties: {
      status: [{ value: 'alive', since: 'manga-chapter:1' }],
      bounty: [{ value: 550_000_000, since: 'manga-chapter:550' }],
    },
    relations: [],
  };

  it('reports an appended historical entry as one addition', () => {
    const after = {
      ...before,
      properties: {
        ...before.properties,
        status: [
          { value: 'alive', since: 'manga-chapter:1' },
          { value: 'dead', since: 'manga-chapter:574' },
        ],
      },
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      { label: 'Status', added: ['Dead · C574'], removed: [] },
    ]);
  });

  it('reports an in-place edit as removal + addition, resolved (no raw JSON)', () => {
    const after = {
      ...before,
      properties: {
        ...before.properties,
        bounty: [{ value: 600_000_000, since: 'manga-chapter:550' }],
      },
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      {
        label: 'Bounty',
        added: ['600,000,000 ฿ · C550'],
        removed: ['550,000,000 ฿ · C550'],
      },
    ]);
  });

  it('groups relation edges by type with resolved target names', () => {
    const after = {
      ...before,
      relations: [{
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { since: 'manga-chapter:5' },
      }],
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      { label: 'Member of', added: ['Straw Hat Pirates · C5'], removed: [] },
    ]);
  });

  it('treats a null previous version as a creation (everything added)', () => {
    const changes = diffEntityData(null, before, ctx);
    expect(changes.map((g) => g.label).sort()).toEqual(['Bounty', 'Status']);
    expect(changes.every((g) => g.removed.length === 0)).toBe(true);
  });

  it('ignores untouched properties and key-order churn', () => {
    const reordered = {
      properties: {
        bounty: [{ since: 'manga-chapter:550', value: 550_000_000 }],
        status: [{ since: 'manga-chapter:1', value: 'alive' }],
      },
      relations: [],
    };
    expect(diffEntityData(before, reordered, ctx)).toEqual([]);
  });
});
