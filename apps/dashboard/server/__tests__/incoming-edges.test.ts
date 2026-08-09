/**
 * ADR-097 — generic incoming-edge manager: pure reverse-scan, plan
 * coalescing, relation patching, and the file builder (validation +
 * ADR-088 blocking gate injected via deps). The HTTP handlers in
 * server.ts are thin wrappers over these functions plus I/O (display
 * names, GitHub SHAs, the bulk PR flow — tested in github-client).
 */
import { RuleSchema } from '@onepiece-wiki/schemas';
import { describe, expect, it } from 'bun:test';
import {
  buildIncomingEdgeFiles,
  coalesceIncomingPlans,
  type IncomingEdgePlan,
  incomingRelationError,
  type IncomingRelationType,
  patchIncomingRelations,
  scanIncomingEdges,
} from '../incoming-edges.ts';
import type { LinkableEntity } from '../links.ts';

const memberOf: IncomingRelationType = {
  id: 'member-of',
  valid_from_types: ['character'],
  valid_to_types: ['crew', 'organization'],
};

const CREW = 'crew:straw-hat-pirates';

function entity(
  id: string,
  relations: Array<Record<string, unknown>>,
  properties: Record<string, unknown> = {},
): LinkableEntity {
  const [type = '', slug = ''] = id.split(':');
  return { id, type, data: { id, type, slug, properties, relations } };
}

describe('incomingRelationError', () => {
  it('400s an unknown relation type', () => {
    expect(incomingRelationError(undefined, 'nope', 'crew')).toContain('No relation type "nope"');
  });

  it('400s a type outside valid_to_types', () => {
    const message = incomingRelationError(memberOf, 'member-of', 'character');
    expect(message).toContain('not a valid target');
    expect(message).toContain('crew, organization');
  });

  it('accepts a valid (relation, target-type) pair', () => {
    expect(incomingRelationError(memberOf, 'member-of', 'crew')).toBeNull();
  });
});

describe('scanIncomingEdges', () => {
  const luffy = entity('character:luffy', [
    { type: 'member-of', target: CREW, qualifiers: { role: 'captain' } },
    { type: 'ate-fruit', target: 'devil-fruit:gomu-gomu' },
  ]);
  const zoro = entity('character:zoro', [
    { type: 'member-of', target: CREW },
  ]);
  const buggy = entity('character:buggy', [
    { type: 'member-of', target: 'crew:buggy-pirates' },
  ]);
  const arc = entity('arc:whole-cake', [
    { type: 'features-crew', target: CREW },
  ]);

  it('returns one row per matching edge, ignoring other relations/targets', () => {
    const rows = scanIncomingEdges('member-of', CREW, [luffy, zoro, buggy, arc]);
    expect(rows.map((r) => r.sourceEntityId)).toEqual(['character:luffy', 'character:zoro']);
    expect(rows[0]!.qualifiers).toEqual({ role: 'captain' });
    expect(rows[1]!.qualifiers).toEqual({});
  });

  it('sorts by entity type then slug', () => {
    const org = entity('organization:marines', [{ type: 'member-of', target: CREW }]);
    const rows = scanIncomingEdges('member-of', CREW, [org, zoro, luffy]);
    expect(rows.map((r) => r.sourceEntityId)).toEqual([
      'character:luffy',
      'character:zoro',
      'organization:marines',
    ]);
  });

  it('yields one row per edge when an entity stores two historised edges', () => {
    const rejoiner = entity('character:usopp', [
      { type: 'member-of', target: CREW, qualifiers: { until: 'manga-chapter:332' } },
      { type: 'member-of', target: CREW, qualifiers: { since: 'manga-chapter:438' } },
    ]);
    expect(scanIncomingEdges('member-of', CREW, [rejoiner])).toHaveLength(2);
  });
});

describe('coalesceIncomingPlans', () => {
  it('collapses add + update into upsert, remove stays remove', () => {
    const plans = coalesceIncomingPlans({
      add: [{ entityId: 'character:jinbe', qualifiers: { role: 'helmsman' } }],
      update: [{ entityId: 'character:zoro', qualifiers: { role: 'swordsman' } }],
      remove: ['character:buggy'],
    });
    expect(plans.get('character:jinbe')).toEqual({
      op: 'upsert',
      qualifiers: { role: 'helmsman' },
    });
    expect(plans.get('character:zoro')).toEqual({
      op: 'upsert',
      qualifiers: { role: 'swordsman' },
    });
    expect(plans.get('character:buggy')).toEqual({ op: 'remove' });
  });

  it('lets add/update win over remove for the same entity (net add)', () => {
    const plans = coalesceIncomingPlans({
      add: [{ entityId: 'character:zoro', qualifiers: {} }],
      remove: ['character:zoro'],
    });
    expect(plans.get('character:zoro')).toEqual({ op: 'upsert', qualifiers: {} });
  });

  it('skips malformed items and is empty for an empty body', () => {
    expect(coalesceIncomingPlans({}).size).toBe(0);
    const plans = coalesceIncomingPlans({
      add: [{ qualifiers: { role: 'x' } }, { entityId: '' }],
      remove: [''],
    });
    expect(plans.size).toBe(0);
  });
});

describe('patchIncomingRelations', () => {
  const relations = [
    { type: 'ate-fruit', target: 'devil-fruit:gomu-gomu' },
    { type: 'member-of', target: CREW, qualifiers: { role: 'captain' } },
    { type: 'member-of', target: 'crew:other' },
  ];

  it('remove drops every edge of the pair, keeping everything else', () => {
    const next = patchIncomingRelations(relations, 'member-of', CREW, { op: 'remove' });
    expect(next).toEqual([
      { type: 'ate-fruit', target: 'devil-fruit:gomu-gomu' },
      { type: 'member-of', target: 'crew:other' },
    ]);
  });

  it('upsert replaces the first matching edge in place (add-dedupe)', () => {
    const next = patchIncomingRelations(relations, 'member-of', CREW, {
      op: 'upsert',
      qualifiers: { role: 'former_captain' },
    });
    expect(next[1]).toEqual({
      type: 'member-of',
      target: CREW,
      qualifiers: { role: 'former_captain' },
    });
    expect(next).toHaveLength(3);
  });

  it('upsert drops additional edges of the same pair (one edge per pair)', () => {
    const doubled = [
      { type: 'member-of', target: CREW, qualifiers: { until: 'manga-chapter:1' } },
      { type: 'member-of', target: CREW, qualifiers: { since: 'manga-chapter:2' } },
    ];
    const next = patchIncomingRelations(doubled, 'member-of', CREW, {
      op: 'upsert',
      qualifiers: { role: 'sniper' },
    });
    expect(next).toEqual([
      { type: 'member-of', target: CREW, qualifiers: { role: 'sniper' } },
    ]);
  });

  it('upsert appends when no edge exists, omitting an empty qualifier bag', () => {
    const next = patchIncomingRelations([], 'member-of', CREW, { op: 'upsert', qualifiers: {} });
    expect(next).toEqual([{ type: 'member-of', target: CREW }]);
  });
});

// ── buildIncomingEdgeFiles — the POST's core walk ──

const okSchema = { safeParse: (): { success: true; } => ({ success: true }) };

const blockingRule = RuleSchema.parse({
  id: 'no-bounty-blocking',
  schema_version: 1,
  severity: 'warning',
  enforcement: 'blocking',
  labels: { en: 'no bounty', fr: 'pas de prime' },
  messages: { en: 'refused', fr: 'refusé' },
  scope: 'entity',
  expect: [{ property_absent: { property: 'bounty' } }],
});

function depsFor(
  entities: readonly LinkableEntity[],
  overrides: Partial<Parameters<typeof buildIncomingEdgeFiles>[3]> = {},
): Parameters<typeof buildIncomingEdgeFiles>[3] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return {
    findEntity: (id) => byId.get(id),
    schemaFor: () => okSchema,
    rules: () => [],
    pathFor: (type, fileBase) => `data/universes/one-piece/entities/${type}/${fileBase}.json`,
    expectedShaFor: () => null,
    ...overrides,
  };
}

const plansOf = (
  ...pairs: readonly (readonly [string, IncomingEdgePlan])[]
): ReadonlyMap<string, IncomingEdgePlan> => new Map(pairs);

describe('buildIncomingEdgeFiles', () => {
  const zoro = entity('character:zoro', [{ type: 'member-of', target: CREW }]);

  it('patches, validates and returns one file per touched entity', () => {
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(
        ['character:zoro', { op: 'upsert', qualifiers: { role: 'swordsman' } }],
      ),
      depsFor([zoro], { expectedShaFor: () => 'sha-zoro' }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe(
      'data/universes/one-piece/entities/character/zoro.json',
    );
    expect(result.files[0]!.expectedSha).toBe('sha-zoro');
    const parsed = JSON.parse(result.files[0]!.content) as {
      relations: { type: string; target: string; qualifiers?: Record<string, unknown>; }[];
    };
    expect(parsed.relations).toEqual([
      { type: 'member-of', target: CREW, qualifiers: { role: 'swordsman' } },
    ]);
    expect(result.files[0]!.content.endsWith('\n')).toBe(true);
  });

  it('rejects a malformed entity id', () => {
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['not-an-id', { op: 'remove' }]),
      depsFor([]),
    );
    expect(result).toEqual({
      kind: 'bad_request',
      message: 'Malformed entityId "not-an-id" — expected "<type>:<slug>".',
    });
  });

  it('rejects an unknown entity', () => {
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['character:nobody', { op: 'remove' }]),
      depsFor([]),
    );
    expect(result.kind).toBe('bad_request');
    if (result.kind === 'bad_request') {
      expect(result.message).toContain('character:nobody');
    }
  });

  it('refuses appending a NEW edge on an entity type outside valid_from_types', () => {
    const island = entity('island:drum', []);
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['island:drum', { op: 'upsert', qualifiers: {} }]),
      depsFor([island]),
    );
    expect(result.kind).toBe('bad_request');
    if (result.kind === 'bad_request') {
      expect(result.message).toContain('valid_from_types');
    }
  });

  it('still allows updating/removing an EXISTING edge on an off-type entity', () => {
    const legacy = entity('island:drum', [{ type: 'member-of', target: CREW }]);
    const update = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['island:drum', { op: 'upsert', qualifiers: { role: 'x' } }]),
      depsFor([legacy]),
    );
    expect(update.kind).toBe('ok');
    const remove = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['island:drum', { op: 'remove' }]),
      depsFor([legacy]),
    );
    expect(remove.kind).toBe('ok');
  });

  it('surfaces Zod failures as validation_failed naming the entity', () => {
    const failSchema = {
      safeParse: (): {
        success: false;
        error: { errors: { path: (string | number)[]; message: string; }[]; };
      } => ({
        success: false,
        error: { errors: [{ path: ['relations', 0, 'target'], message: 'Invalid entity id' }] },
      }),
    };
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['character:zoro', { op: 'upsert', qualifiers: {} }]),
      depsFor([zoro], { schemaFor: () => failSchema }),
    );
    expect(result).toEqual({
      kind: 'validation_failed',
      entityId: 'character:zoro',
      issues: [{ path: ['relations', '0', 'target'], message: 'Invalid entity id' }],
    });
  });

  it('refuses with rule_blocked when an ADR-088 blocking rule matches the patched entity', () => {
    const bountied = entity(
      'character:zoro',
      [{ type: 'member-of', target: CREW }],
      { bounty: [{ value: 111_100_000 }] },
    );
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['character:zoro', { op: 'upsert', qualifiers: { role: 'swordsman' } }]),
      depsFor([bountied], { rules: () => [blockingRule] }),
    );
    expect(result.kind).toBe('rule_blocked');
    if (result.kind !== 'rule_blocked') return;
    expect(result.entityId).toBe('character:zoro');
    expect(result.findings[0]!.ruleId).toBe('no-bounty-blocking');
    expect(result.findings[0]!.enforcement).toBe('blocking');
  });

  it('reports missing schema as bad_request', () => {
    const result = buildIncomingEdgeFiles(
      memberOf,
      CREW,
      plansOf(['character:zoro', { op: 'remove' }]),
      depsFor([zoro], { schemaFor: () => undefined }),
    );
    expect(result.kind).toBe('bad_request');
    if (result.kind === 'bad_request') {
      expect(result.message).toContain('No schema registered');
    }
  });
});
