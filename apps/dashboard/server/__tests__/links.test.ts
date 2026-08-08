/**
 * Pure link-scan + inverse-coherence detection (server/links.ts).
 */
import { describe, expect, it } from 'bun:test';
import {
  buildReverseIndex,
  computeEntityLinks,
  detectConflicts,
  type LinkableEntity,
  relationsOf,
  type RelationTypeLabels,
} from '../links.ts';

function entity(
  id: string,
  relations: Array<{ type: string; target: string; qualifiers?: Record<string, unknown>; }>,
): LinkableEntity {
  const [type = ''] = id.split(':');
  return { id, type, data: { id, type, relations } };
}

const SYMMETRIC_TYPES: ReadonlyMap<string, RelationTypeLabels> = new Map([
  [
    'family-of',
    {
      labels: {
        en: { active: 'Family of', inverse: 'Family of' },
        fr: { active: 'Famille de', inverse: 'Famille de' },
      },
    },
  ],
  [
    'mentor-of',
    {
      labels: {
        en: { active: 'Mentor of', inverse: 'Mentored by' },
        fr: { active: 'Mentor de', inverse: 'Formé par' },
      },
    },
  ],
]);

describe('relationsOf', () => {
  it('parses relations defensively', () => {
    const e = entity('character:a', [{ type: 'ally-of', target: 'character:b' }]);
    expect(relationsOf(e)).toEqual([
      { relationType: 'ally-of', target: 'character:b', qualifiers: {} },
    ]);
  });

  it('ignores malformed entries and missing arrays', () => {
    const bad: LinkableEntity = {
      id: 'character:a',
      type: 'character',
      data: { relations: [null, 42, { type: 'x' }, { target: 'y' }, 'z'] },
    };
    expect(relationsOf(bad)).toEqual([]);
    expect(relationsOf({ id: 'c', type: 'character', data: {} })).toEqual([]);
  });
});

describe('buildReverseIndex', () => {
  it('indexes every relation by target in one pass', () => {
    const a = entity('character:a', [
      { type: 'ally-of', target: 'character:b' },
      { type: 'member-of', target: 'crew:x', qualifiers: { role: 'captain' } },
    ]);
    const chapter = entity('manga-chapter:1', [
      { type: 'features', target: 'character:b', qualifiers: { appearance_type: 'main' } },
    ]);
    const index = buildReverseIndex([a, chapter]);
    expect(index.get('character:b')).toEqual([
      { relationType: 'ally-of', sourceEntityId: 'character:a', qualifiers: {} },
      {
        relationType: 'features',
        sourceEntityId: 'manga-chapter:1',
        qualifiers: { appearance_type: 'main' },
      },
    ]);
    expect(index.get('crew:x')).toHaveLength(1);
    expect(index.get('character:a')).toBeUndefined();
  });
});

describe('detectConflicts — duplicate-symmetric', () => {
  it('flags the same relation type stored on both sides', () => {
    const links = computeEntityLinks(
      'character:a',
      [
        entity('character:a', [{ type: 'family-of', target: 'character:b' }]),
        entity('character:b', [{ type: 'family-of', target: 'character:a' }]),
      ],
      SYMMETRIC_TYPES,
    );
    expect(links.conflicts).toEqual([
      {
        kind: 'duplicate-symmetric',
        relationType: 'family-of',
        otherEntityId: 'character:b',
        detail: expect.stringContaining('pipeline infers') as unknown as string,
      },
    ]);
  });

  it('flags same-type opposite edges even when labels are not symmetric', () => {
    const links = computeEntityLinks(
      'character:a',
      [
        entity('character:a', [{ type: 'mentor-of', target: 'character:b' }]),
        entity('character:b', [{ type: 'mentor-of', target: 'character:a' }]),
      ],
      SYMMETRIC_TYPES,
    );
    expect(links.conflicts.map((c) => c.kind)).toEqual(['duplicate-symmetric']);
  });

  it('does not flag a one-sided edge', () => {
    const links = computeEntityLinks('character:a', [
      entity('character:a', [{ type: 'family-of', target: 'character:b' }]),
      entity('character:b', []),
    ]);
    expect(links.conflicts).toEqual([]);
  });

  it('does not flag different relation types between the same pair', () => {
    const links = computeEntityLinks('character:a', [
      entity('character:a', [{ type: 'captains', target: 'crew:x' }]),
      entity('crew:x', [{ type: 'captained-by', target: 'character:a' }]),
    ]);
    expect(links.conflicts).toEqual([]);
  });
});

describe('detectConflicts — duplicate-edge', () => {
  it('flags the same (type, target) twice with no distinguishing since/until', () => {
    const conflicts = detectConflicts(
      relationsOf(entity('character:a', [
        { type: 'ally-of', target: 'character:b' },
        { type: 'ally-of', target: 'character:b' },
      ])),
      [],
    );
    expect(conflicts).toEqual([
      {
        kind: 'duplicate-edge',
        relationType: 'ally-of',
        otherEntityId: 'character:b',
        detail: expect.stringContaining('identical since/until') as unknown as string,
      },
    ]);
  });

  it('allows repeated edges distinguished by since', () => {
    const conflicts = detectConflicts(
      relationsOf(entity('character:a', [
        { type: 'member-of', target: 'crew:x', qualifiers: { since: 'manga-chapter:1' } },
        {
          type: 'member-of',
          target: 'crew:x',
          qualifiers: { since: 'manga-chapter:500', until: 'manga-chapter:600' },
        },
      ])),
      [],
    );
    expect(conflicts).toEqual([]);
  });
});

describe('detectConflicts — qualifier-mismatch', () => {
  it('flags a symmetric edge stored on both sides with different since', () => {
    const links = computeEntityLinks(
      'character:a',
      [
        entity('character:a', [
          { type: 'family-of', target: 'character:b', qualifiers: { since: 'manga-chapter:1' } },
        ]),
        entity('character:b', [
          { type: 'family-of', target: 'character:a', qualifiers: { since: 'manga-chapter:585' } },
        ]),
      ],
      SYMMETRIC_TYPES,
    );
    expect(links.conflicts).toEqual([
      {
        kind: 'qualifier-mismatch',
        relationType: 'family-of',
        otherEntityId: 'character:b',
        detail: expect.stringContaining('manga-chapter:585') as unknown as string,
      },
    ]);
  });
});

describe('computeEntityLinks', () => {
  const catalogue = [
    entity('character:ace', [
      {
        type: 'family-of',
        target: 'character:luffy',
        qualifiers: { relation_kind: 'sworn_brother' },
      },
    ]),
    entity('character:luffy', [
      {
        type: 'family-of',
        target: 'character:ace',
        qualifiers: { relation_kind: 'sworn_brother' },
      },
    ]),
    entity('manga-chapter:574', [
      { type: 'features', target: 'character:ace', qualifiers: { appearance_type: 'main' } },
    ]),
    entity('event:marineford', [
      { type: 'caused-death-of', target: 'character:ace' },
    ]),
  ];

  it('returns outgoing, incoming and conflicts for the entity', () => {
    const links = computeEntityLinks('character:ace', catalogue, SYMMETRIC_TYPES);
    expect(links.outgoing).toEqual([
      {
        relationType: 'family-of',
        target: 'character:luffy',
        qualifiers: { relation_kind: 'sworn_brother' },
      },
    ]);
    expect(links.incoming.map((i) => [i.relationType, i.sourceEntityId])).toEqual([
      ['family-of', 'character:luffy'],
      ['features', 'manga-chapter:574'],
      ['caused-death-of', 'event:marineford'],
    ]);
    expect(links.conflicts.map((c) => c.kind)).toEqual(['duplicate-symmetric']);
  });

  it('returns empty lists for an unknown entity id', () => {
    const links = computeEntityLinks('character:nobody', catalogue);
    expect(links.outgoing).toEqual([]);
    expect(links.incoming).toEqual([]);
    expect(links.conflicts).toEqual([]);
  });
});
