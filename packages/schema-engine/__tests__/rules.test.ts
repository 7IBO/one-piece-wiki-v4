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

describe('evaluateRules — since_precision (ADR-113)', () => {
  it('flags a precision with no `since` to qualify, and stays silent otherwise', async () => {
    const rule = await loadRule('since-precision-needs-since');

    // Le cas fautif : on dit comment lire `since` sans donner de `since`.
    const orphan = {
      type: 'character',
      properties: { status: [{ value: 'alive', since_precision: 'at_latest' }] },
    };
    expect(evaluateRules(orphan, [rule])).toHaveLength(1);
    expect(evaluateRules(orphan, [rule])[0]!.property).toBe('status');

    // Le cas Rocks, bien écrit : présent au plus tard à ce chapitre.
    const attested = {
      type: 'character',
      properties: {
        status: [{
          value: 'alive',
          since: 'manga-chapter:130',
          since_precision: 'at_latest',
        }],
      },
    };
    expect(evaluateRules(attested, [rule])).toHaveLength(0);

    // Absence de précision : c'est `exact`, et la règle ne dit rien.
    const plain = {
      type: 'character',
      properties: { status: [{ value: 'alive', since: 'manga-chapter:1' }] },
    };
    expect(evaluateRules(plain, [rule])).toHaveLength(0);
  });
});

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

  it('accepts believed_by in BOTH item forms for believed-by-characters-needs-list (ADR-096)', async () => {
    const rule = await loadRule('believed-by-characters-needs-list');
    const entry = (
      believed_by?: unknown,
    ): { type: string; properties: Record<string, unknown>; } => ({
      type: 'character',
      properties: {
        status: [{
          value: 'presumed_dead',
          epistemic_status: 'believed_by_characters',
          ...(believed_by !== undefined ? { believed_by } : {}),
        }],
      },
    });
    // Missing list → finding.
    expect(evaluateRules(entry(), [rule])).toHaveLength(1);
    // Plain-string list satisfies the rule.
    expect(evaluateRules(entry(['character:luffy']), [rule])).toHaveLength(0);
    // Object-item list satisfies it too.
    expect(
      evaluateRules(
        entry([{ target: 'character:luffy', source: 'manga-chapter:585' }]),
        [rule],
      ),
    ).toHaveLength(0);
    // Mixed list as well.
    expect(
      evaluateRules(
        entry([{ target: 'character:luffy', source: 'manga-chapter:585' }, 'character:ace']),
        [rule],
      ),
    ).toHaveLength(0);
    // Empty array is still "not set".
    expect(evaluateRules(entry([]), [rule])).toHaveLength(1);
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

describe('evaluateRules — enforcement (ADR-088)', () => {
  it('defaults enforcement to advisory when the rule file omits it', async () => {
    const rule = await loadRule('active-marine-with-bounty');
    expect(rule.enforcement).toBe('advisory');
    const findings = evaluateRules(
      {
        type: 'character',
        properties: { bounty: [{ value: 100 }] },
        relations: [{ type: 'member-of', target: 'organization:marines' }],
      },
      [rule],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.enforcement).toBe('advisory');
  });

  it('carries blocking enforcement through to the finding', async () => {
    // until-not-before-since is the shipped blocking example — a
    // structurally-always-wrong shape, no canon exception possible.
    const rule = await loadRule('until-not-before-since');
    expect(rule.enforcement).toBe('blocking');
    const findings = evaluateRules(
      {
        type: 'character',
        properties: {
          epithet: [{ value_key: 'k', since: 'manga-chapter:600', until: 'manga-chapter:96' }],
        },
      },
      [rule],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.enforcement).toBe('blocking');
  });

  it('parses an explicit advisory enforcement', () => {
    const rule = RuleSchema.parse({
      id: 'explicit-advisory',
      schema_version: 1,
      severity: 'info',
      enforcement: 'advisory',
      labels: { en: 'x', fr: 'x' },
      messages: { en: 'x', fr: 'x' },
      scope: 'entity',
      expect: [{ property_absent: { property: 'bounty' } }],
    });
    const findings = evaluateRules(
      { type: 'character', properties: { bounty: [{ value: 1 }] } },
      [rule],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.enforcement).toBe('advisory');
  });
});

describe('evaluateRules — relation scope (ADR-090)', () => {
  it('flags an available-on edge missing BOTH external_id and url, passes with either', async () => {
    const rule = await loadRule('available-on-needs-target-anchor');
    expect(rule.scope).toBe('relation');

    const bare = {
      type: 'anime-episode',
      relations: [{ type: 'available-on', target: 'streaming-platform:crunchyroll' }],
    };
    const findings = evaluateRules(bare, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relationType).toBe('available-on');
    expect(findings[0]!.relationIndex).toBe(0);

    const withId = {
      type: 'anime-episode',
      relations: [{
        type: 'available-on',
        target: 'streaming-platform:crunchyroll',
        qualifiers: { external_id: 'GRMG8ZQZR' },
      }],
    };
    expect(evaluateRules(withId, [rule])).toHaveLength(0);

    const withUrl = {
      type: 'anime-episode',
      relations: [{
        type: 'available-on',
        target: 'streaming-platform:crunchyroll',
        qualifiers: { url: 'https://www.crunchyroll.com/watch/x' },
      }],
    };
    expect(evaluateRules(withUrl, [rule])).toHaveLength(0);
  });

  it('only visits edges of the rule relation_type and honors edge conditions', async () => {
    const anchorRule = await loadRule('available-on-needs-target-anchor');
    const otherEdgesOnly = {
      type: 'character',
      relations: [{ type: 'member-of', target: 'organization:marines' }],
    };
    expect(evaluateRules(otherEdgesOnly, [anchorRule])).toHaveLength(0);

    const conditioned = RuleSchema.parse({
      id: 'subscription-edges-need-region',
      schema_version: 1,
      severity: 'info',
      labels: { en: 'x', fr: 'x' },
      messages: { en: 'x', fr: 'x' },
      scope: 'relation',
      relation_type: 'available-on',
      relation_when: [
        { qualifier_equals: { qualifier: 'requires_subscription', value: true } },
        { target_type_is: { type: 'streaming-platform' } },
      ],
      relation_expect: [{ qualifier_present: { qualifier: 'region' } }],
    });
    const entity = {
      type: 'anime-episode',
      relations: [
        // Fails the qualifier_equals condition — never visited.
        { type: 'available-on', target: 'streaming-platform:a', qualifiers: { url: 'https://x' } },
        // Matches conditions, misses region — one finding at index 1.
        {
          type: 'available-on',
          target: 'streaming-platform:b',
          qualifiers: { requires_subscription: true },
        },
      ],
    };
    const findings = evaluateRules(entity, [conditioned]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relationIndex).toBe(1);
  });
});

describe('evaluateRules — qualifier_absent + the ADR-098 rules', () => {
  async function loadUniverseRule(id: string): Promise<RuleSchema> {
    const raw = await Bun.file(`data/universes/one-piece/schemas/rules/${id}.json`).json();
    return RuleSchema.parse(raw);
  }

  it('qualifier_absent holds when the qualifier is unset or empty, fails when set', () => {
    const rule = RuleSchema.parse({
      id: 'no-role-on-x',
      schema_version: 1,
      severity: 'warning',
      labels: { en: 'x', fr: 'x' },
      messages: { en: 'x', fr: 'x' },
      scope: 'relation',
      relation_type: 'member-of',
      relation_expect: [{ qualifier_absent: { qualifier: 'role' } }],
    });

    const bare = {
      type: 'character',
      relations: [{ type: 'member-of', target: 'organization:marines' }],
    };
    expect(evaluateRules(bare, [rule])).toHaveLength(0);

    // Empty string counts as NOT set — the expectation still holds.
    const empty = {
      type: 'character',
      relations: [
        { type: 'member-of', target: 'organization:marines', qualifiers: { role: '' } },
      ],
    };
    expect(evaluateRules(empty, [rule])).toHaveLength(0);

    const withRole = {
      type: 'character',
      relations: [
        { type: 'member-of', target: 'organization:marines', qualifiers: { role: 'cook' } },
      ],
    };
    const findings = evaluateRules(withRole, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relationType).toBe('member-of');
    expect(findings[0]!.relationIndex).toBe(0);
  });

  it('former-member-needs-until flags former_member without until, passes with it', async () => {
    const rule = await loadUniverseRule('former-member-needs-until');
    expect(rule.scope).toBe('relation');

    const drifting = {
      type: 'character',
      relations: [{
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { loyalty_status: 'former_member' },
      }],
    };
    const findings = evaluateRules(drifting, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relationType).toBe('member-of');
    expect(findings[0]!.enforcement).toBe('advisory');

    const anchored = {
      type: 'character',
      relations: [{
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { loyalty_status: 'former_member', until: 'manga-chapter:1000' },
      }],
    };
    expect(evaluateRules(anchored, [rule])).toHaveLength(0);

    // Other loyalty statuses never trip the condition.
    const activeMember = {
      type: 'character',
      relations: [{
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { loyalty_status: 'member' },
      }],
    };
    expect(evaluateRules(activeMember, [rule])).toHaveLength(0);
  });
});

/** Oracle over a fixed set of "targetId|relationType|sourceType" edges (ADR-099). */
function contextOf(...edges: readonly string[]): {
  hasActiveIncomingRelation: (id: string, type: string, sourceType?: string) => boolean;
} {
  return {
    hasActiveIncomingRelation: (id, type, sourceType) =>
      edges.some((edge) => {
        const [target, relationType, source] = edge.split('|');
        return target === id && relationType === type
          && (sourceType === undefined || source === sourceType);
      }),
  };
}

describe('evaluateRules — incoming-edge awareness (ADR-099)', () => {
  async function loadUniverseRule(id: string): Promise<RuleSchema> {
    const raw = await Bun.file(`data/universes/one-piece/schemas/rules/${id}.json`).json();
    return RuleSchema.parse(raw);
  }

  const incomingCondition = RuleSchema.parse({
    id: 'flag-eaten-fruits-with-classification',
    schema_version: 1,
    severity: 'info',
    labels: { en: 'x', fr: 'x' },
    messages: { en: 'x', fr: 'x' },
    scope: 'entity',
    when: [{ has_active_incoming_relation: { type: 'ate-fruit', source_type: 'character' } }],
    expect: [{ property_present: { property: 'classification' } }],
  });

  it('has_active_incoming_relation fires only through the corpus context', () => {
    const fruit = { id: 'devil-fruit:gomu-gomu', type: 'devil-fruit', properties: {} };

    // Context says a character actively ate the fruit -> condition
    // holds -> the (unmet) expectation yields a finding.
    const eaten = contextOf('devil-fruit:gomu-gomu|ate-fruit|character');
    expect(evaluateRules(fruit, [incomingCondition], eaten)).toHaveLength(1);

    // No incoming edge -> condition fails -> silent.
    expect(evaluateRules(fruit, [incomingCondition], contextOf())).toHaveLength(0);

    // source_type narrowing: an organization eater does not match.
    const wrongSource = contextOf('devil-fruit:gomu-gomu|ate-fruit|organization');
    expect(evaluateRules(fruit, [incomingCondition], wrongSource)).toHaveLength(0);
  });

  it('rules using incoming fields are SKIPPED without a context or entity id', () => {
    const fruit = { id: 'devil-fruit:gomu-gomu', type: 'devil-fruit', properties: {} };
    // No context (the dashboard single-entity call shape): skipped, no
    // finding even though the expectation could never hold.
    expect(evaluateRules(fruit, [incomingCondition])).toHaveLength(0);
    // Context but no id: the index is keyed by id — also skipped.
    const anonymous = { type: 'devil-fruit', properties: {} };
    const eaten = contextOf('devil-fruit:gomu-gomu|ate-fruit|character');
    expect(evaluateRules(anonymous, [incomingCondition], eaten)).toHaveLength(0);
  });

  it('eaten-fruit-not-concurrently-held flags held+eaten, passes either alone', async () => {
    const rule = await loadUniverseRule('eaten-fruit-not-concurrently-held');
    const heldFruit = {
      id: 'devil-fruit:mera-mera',
      type: 'devil-fruit',
      relations: [{ type: 'held-by', target: 'organization:donquixote-pirates' }],
    };

    // Held AND actively eaten — contradiction, one finding carrying
    // the offending incoming relation type.
    const eaten = contextOf('devil-fruit:mera-mera|ate-fruit|character');
    const findings = evaluateRules(heldFruit, [rule], eaten);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('eaten-fruit-not-concurrently-held');
    expect(findings[0]!.relationType).toBe('ate-fruit');
    expect(findings[0]!.enforcement).toBe('advisory');

    // Held but NOT eaten (the Dressrosa-prize shape) — clean.
    expect(evaluateRules(heldFruit, [rule], contextOf())).toHaveLength(0);

    // Eaten but no longer held (until closed) — condition off, clean.
    const releasedFruit = {
      ...heldFruit,
      relations: [{
        type: 'held-by',
        target: 'organization:donquixote-pirates',
        qualifiers: { until: 'manga-chapter:744' },
      }],
    };
    expect(evaluateRules(releasedFruit, [rule], eaten)).toHaveLength(0);

    // Without a corpus context (dashboard) the rule is skipped.
    expect(evaluateRules(heldFruit, [rule])).toHaveLength(0);
  });
});
