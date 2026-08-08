/**
 * Declarative coherence-rule engine (ADR-085): entity-scope
 * conditions/expectations, entry-scope qualifier rules, ordering
 * checks, universe/type applicability. Uses the REAL committed rule
 * files so the engine and the shipped rule set are tested together.
 */
import { RuleSchema } from '@onepiece-wiki/schemas';
import { describe, expect, it } from 'bun:test';
import { evaluateRules } from '../src/rules.ts';

async function loadRule(id: string): Promise<RuleSchema> {
  const raw = await Bun.file(`data/schemas/rules/${id}.json`).json();
  return RuleSchema.parse(raw);
}

describe('evaluateRules — entity scope', () => {
  it('flags a bounty on an ACTIVE Marine, silent when membership ended', async () => {
    const rule = await loadRule('active-marine-with-bounty');
    const activeMarine = {
      type: 'character',
      properties: { bounty: [{ value: 100, since: 'manga-chapter:1' }] },
      relations: [{ type: 'member-of', target: 'organization:marines' }],
    };
    expect(evaluateRules(activeMarine, [rule])).toHaveLength(1);
    expect(evaluateRules(activeMarine, [rule])[0]!.property).toBe('bounty');

    const formerMarine = {
      ...activeMarine,
      relations: [{
        type: 'member-of',
        target: 'organization:marines',
        qualifiers: { until: 'manga-chapter:700' },
      }],
    };
    expect(evaluateRules(formerMarine, [rule])).toHaveLength(0);

    const marineNoBounty = { ...activeMarine, properties: {} };
    expect(evaluateRules(marineNoBounty, [rule])).toHaveLength(0);
  });

  it('flags two concurrent devil fruits, allows sequential ones', async () => {
    const rule = await loadRule('single-concurrent-devil-fruit');
    const twoActive = {
      type: 'character',
      relations: [
        { type: 'ate-fruit', target: 'devil-fruit:a' },
        { type: 'ate-fruit', target: 'devil-fruit:b' },
      ],
    };
    expect(evaluateRules(twoActive, [rule])).toHaveLength(1);

    const sequential = {
      type: 'character',
      relations: [
        { type: 'ate-fruit', target: 'devil-fruit:a', qualifiers: { until: 'manga-chapter:576' } },
        { type: 'ate-fruit', target: 'devil-fruit:b' },
      ],
    };
    expect(evaluateRules(sequential, [rule])).toHaveLength(0);
  });

  it('skips rules whose entity type does not match', async () => {
    const rule = await loadRule('active-marine-with-bounty');
    const crew = {
      type: 'crew',
      properties: { bounty: [{ value: 1 }] },
      relations: [{ type: 'member-of', target: 'organization:marines' }],
    };
    expect(evaluateRules(crew, [rule])).toHaveLength(0);
  });
});

describe('evaluateRules — entry scope', () => {
  it('flags believed_by_world without actual_value on any property', async () => {
    const rule = await loadRule('believed-by-world-needs-actual-value');
    const entity = {
      type: 'character',
      properties: {
        name: [
          { value_key: 'k', epistemic_status: 'believed_by_world' },
          { value_key: 'k2', epistemic_status: 'believed_by_world', actual_value: 'X' },
        ],
      },
    };
    const findings = evaluateRules(entity, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.property).toBe('name');
    expect(findings[0]!.entryIndex).toBe(0);
  });

  it('flags a dead status entry without since', async () => {
    const rule = await loadRule('death-needs-source-anchor');
    const entity = {
      type: 'character',
      properties: { status: [{ value: 'alive', since: 'manga-chapter:1' }, { value: 'dead' }] },
    };
    const findings = evaluateRules(entity, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.entryIndex).toBe(1);
  });

  it('flags until before since on comparable numeric refs only', async () => {
    const rule = await loadRule('until-not-before-since');
    const wrongOrder = {
      type: 'character',
      properties: {
        epithet: [{
          value_key: 'k',
          since: 'manga-chapter:600',
          until: 'manga-chapter:96',
        }],
      },
    };
    expect(evaluateRules(wrongOrder, [rule])).toHaveLength(1);

    const crossType = {
      type: 'character',
      properties: {
        epithet: [{ value_key: 'k', since: 'manga-chapter:600', until: 'anime-episode:5' }],
      },
    };
    // Different source types are incomparable — no finding.
    expect(evaluateRules(crossType, [rule])).toHaveLength(0);
  });
});
