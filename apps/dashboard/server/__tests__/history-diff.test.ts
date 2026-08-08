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
    ['epistemic-statuses', {
      values: {
        confirmed: { labels: { en: 'Confirmed', fr: 'Confirmé' } },
      },
    }],
    ['family-relations', {
      values: {
        sworn_brother: { labels: { en: 'Sworn brother', fr: 'Frère juré' } },
      },
    }],
  ]),
  qualifierTypes: new Map([
    ['epistemic_status', {
      labels: { en: 'Epistemic status', fr: 'Statut épistémique' },
      value_type: 'enum',
      enum_ref: 'epistemic-statuses',
    }],
    ['event', { labels: { en: 'Event', fr: 'Évènement' }, value_type: 'entity_ref' }],
    ['until', { labels: { en: 'Until', fr: "Jusqu'à" }, value_type: 'source_ref' }],
    // Registry says plain string — the enum_ref for relation edges
    // comes from the relation type's own qualifier declaration.
    ['relation_kind', {
      labels: { en: 'Relation kind', fr: 'Type de lien' },
      value_type: 'string',
    }],
  ]),
  relationTypes: new Map([
    ['member-of', {
      qualifiers: [{ id: 'relation_kind', value_type: 'enum', enum_ref: 'family-relations' }],
    }],
  ]),
  translations: { en: { 'c.x.name': 'Test Guy' }, fr: {} },
  displayNameFor: (id) =>
    id === 'crew:straw-hat-pirates'
      ? { en: 'Straw Hat Pirates', fr: null }
      : id === 'event:marineford'
      ? { en: 'Battle of Marineford', fr: 'Bataille de Marineford' }
      : undefined,
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
      { label: 'Status', added: [{ text: 'Dead · C574' }], removed: [] },
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
        added: [{ text: '600,000,000 ฿ · C550' }],
        removed: [{ text: '550,000,000 ฿ · C550' }],
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
      { label: 'Member of', added: [{ text: 'Straw Hat Pirates · C5' }], removed: [] },
    ]);
  });

  it('treats a null previous version as a creation (everything added)', () => {
    const changes = diffEntityData(null, before, ctx);
    expect(changes.map((g) => g.label).sort()).toEqual(['Bounty', 'Status']);
    expect(changes.every((g) => g.removed.length === 0)).toBe(true);
  });

  it('splits every other qualifier of a property entry into "Label : Valeur" details', () => {
    const after = {
      ...before,
      properties: {
        ...before.properties,
        status: [
          { value: 'alive', since: 'manga-chapter:1' },
          {
            value: 'dead',
            since: 'manga-chapter:574',
            epistemic_status: 'confirmed',
            event: 'event:marineford',
          },
        ],
      },
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      {
        label: 'Status',
        added: [{
          text: 'Dead · C574',
          details: 'Epistemic status : Confirmed · Event : Battle of Marineford',
        }],
        removed: [],
      },
    ]);
  });

  it('compacts until like since in details and joins qualifier arrays with a comma', () => {
    const after = {
      ...before,
      properties: {
        ...before.properties,
        bounty: [{
          value: 550_000_000,
          since: 'manga-chapter:550',
          until: ['manga-chapter:574', 'manga-chapter:600'],
        }],
      },
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      {
        label: 'Bounty',
        added: [{ text: '550,000,000 ฿ · C550', details: 'Until : C574, C600' }],
        removed: [{ text: '550,000,000 ฿ · C550' }],
      },
    ]);
  });

  it('falls back to the raw key and value for unregistered qualifiers', () => {
    const after = {
      ...before,
      properties: {
        ...before.properties,
        status: [
          { value: 'alive', since: 'manga-chapter:1', mystery_flag: 'raw_token' },
        ],
      },
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      {
        label: 'Status',
        added: [{ text: 'Alive · C1', details: 'mystery_flag : raw_token' }],
        removed: [{ text: 'Alive · C1' }],
      },
    ]);
  });

  it('resolves relation qualifiers via the relation-type declaration enum_ref', () => {
    const after = {
      ...before,
      relations: [{
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { since: 'manga-chapter:5', relation_kind: 'sworn_brother' },
      }],
    };
    const changes = diffEntityData(before, after, ctx);
    expect(changes).toEqual([
      {
        label: 'Member of',
        added: [{
          text: 'Straw Hat Pirates · C5',
          details: 'Relation kind : Sworn brother',
        }],
        removed: [],
      },
    ]);
  });

  it('resolves qualifier labels and enum values in the requested locale', () => {
    const frCtx: HistoryDiffContext = { ...ctx, locale: 'fr' };
    const after = {
      ...before,
      properties: {
        ...before.properties,
        status: [
          { value: 'alive', since: 'manga-chapter:1' },
          { value: 'dead', since: 'manga-chapter:574', epistemic_status: 'confirmed' },
        ],
      },
    };
    const changes = diffEntityData(before, after, frCtx);
    expect(changes).toEqual([
      {
        label: 'Status',
        added: [{ text: 'Mort · C574', details: 'Statut épistémique : Confirmé' }],
        removed: [],
      },
    ]);
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
