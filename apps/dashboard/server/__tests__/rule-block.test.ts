/**
 * ADR-088 — blocking-rule gate on the save/create endpoints. The gate
 * is a pure module (`rule-block.ts`) wired into handleSaveEntity /
 * handleCreateEntity right after Zod validation, so it is tested
 * directly: advisory findings pass through (never refused), blocking
 * findings produce the structured 422 the form maps onto fields.
 */
import { RuleSchema } from '@onepiece-wiki/schemas';
import { describe, expect, it } from 'bun:test';
import { blockingRuleFindings, ruleBlockedResponse } from '../rule-block.ts';

const blockingRule = RuleSchema.parse({
  id: 'until-not-before-since',
  schema_version: 1,
  severity: 'warning',
  enforcement: 'blocking',
  labels: { en: 'until precedes since', fr: 'until antérieur à since' },
  messages: {
    en: 'This entry ends before it starts.',
    fr: 'Cette entrée se termine avant de commencer.',
  },
  scope: 'entry',
  entry_property: '*',
  entry_expect: [{ until_not_before_since: {} }],
});

const advisoryRule = RuleSchema.parse({
  id: 'no-bounty',
  schema_version: 1,
  severity: 'warning',
  labels: { en: 'x', fr: 'x' },
  messages: { en: 'advisory only', fr: 'consultatif' },
  scope: 'entity',
  expect: [{ property_absent: { property: 'bounty' } }],
});

const violatingData = {
  id: 'character:x',
  type: 'character',
  slug: 'x',
  properties: {
    bounty: [{ value: 100 }],
    epithet: [{ value_key: 'k', since: 'manga-chapter:600', until: 'manga-chapter:96' }],
  },
};

describe('blockingRuleFindings', () => {
  it('keeps only blocking findings — advisory rules never refuse a save', () => {
    const findings = blockingRuleFindings(violatingData, 'character', [
      advisoryRule,
      blockingRule,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('until-not-before-since');
    expect(findings[0]!.enforcement).toBe('blocking');
  });

  it('returns nothing when the payload satisfies every blocking rule', () => {
    const clean = {
      ...violatingData,
      properties: {
        bounty: [{ value: 100 }],
        epithet: [{ value_key: 'k', since: 'manga-chapter:96', until: 'manga-chapter:600' }],
      },
    };
    expect(blockingRuleFindings(clean, 'character', [advisoryRule, blockingRule]))
      .toHaveLength(0);
  });

  it('tolerates a payload without properties/relations', () => {
    expect(blockingRuleFindings({ id: 'character:x' }, 'character', [blockingRule]))
      .toHaveLength(0);
  });
});

describe('ruleBlockedResponse', () => {
  it('is a 422 with the structured rule_blocked payload (localized messages)', async () => {
    const findings = blockingRuleFindings(violatingData, 'character', [blockingRule]);
    const response = ruleBlockedResponse(findings);
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toBe('application/json');
    const body = (await response.json()) as {
      error: string;
      code: string;
      findings: {
        ruleId: string;
        messages: { en: string; fr: string; };
        property?: string;
        entryIndex?: number;
      }[];
    };
    expect(body.code).toBe('rule_blocked');
    expect(body.error).toContain('until-not-before-since');
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0]!.property).toBe('epithet');
    expect(body.findings[0]!.entryIndex).toBe(0);
    expect(body.findings[0]!.messages.fr).toBe('Cette entrée se termine avant de commencer.');
  });
});
