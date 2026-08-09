/**
 * ADR-088 — server-side gate for BLOCKING declarative rules.
 *
 * Advisory rules (ADR-085) never block a save: the form shows them
 * amber and the PR opens anyway. A rule that opted into
 * `enforcement: 'blocking'` encodes a structural impossibility
 * (e.g. `until` preceding `since`), so the save/create endpoints
 * refuse it with a 422 BEFORE any GitHub call, mirroring the Zod
 * validation refusal: a structured payload the form maps onto the
 * exact fields (see `ruleBlockedFindings` in src/api.ts).
 *
 * Pure and schema-driven — the rule set comes from the catalogue
 * snapshot; nothing here names a property or entity type.
 */
import { evaluateRules, type Rule, type RuleFinding } from '@onepiece-wiki/schema-engine';

/** Wire shape of one blocking finding in the 422 payload. */
export type BlockingFindingPayload = {
  readonly ruleId: string;
  /** Localized rule message — the client picks its display locale. */
  readonly messages: { readonly en: string; readonly fr: string; };
  readonly property?: string;
  readonly entryIndex?: number;
};

/**
 * Evaluate every applicable rule against the SAVE PAYLOAD (so findings
 * describe exactly what would land in the PR) and keep only the
 * blocking ones. Advisory findings are ignored here — the form already
 * shows them live.
 */
export function blockingRuleFindings(
  data: Record<string, unknown>,
  type: string,
  rules: Iterable<Rule>,
): readonly RuleFinding[] {
  const properties = data['properties'];
  const relations = data['relations'];
  return evaluateRules(
    {
      type,
      properties:
        properties !== null && typeof properties === 'object' && !Array.isArray(properties)
          ? properties as Record<string, unknown>
          : undefined,
      relations: Array.isArray(relations)
        ? relations as { type: string; target: string; qualifiers?: Record<string, unknown>; }[]
        : undefined,
    },
    rules,
  ).filter((f) => f.enforcement === 'blocking');
}

/**
 * 422 response for a save refused by blocking rules. `code:
 * 'rule_blocked'` is the discriminator the client's
 * `ruleBlockedFindings` type-guard matches on. Bulk flows (incoming
 * edges — ADR-097) pass `entityId` so the payload names the offending
 * SOURCE entity; the single-entity save omits it (the entity is the
 * URL).
 */
export function ruleBlockedResponse(
  findings: readonly RuleFinding[],
  entityId?: string,
): Response {
  const payload: BlockingFindingPayload[] = findings.map((f) => ({
    ruleId: f.ruleId,
    messages: f.messages,
    ...(f.property !== undefined ? { property: f.property } : {}),
    ...(f.entryIndex !== undefined ? { entryIndex: f.entryIndex } : {}),
  }));
  const summary = payload.map((f) => `[${f.ruleId}] ${f.messages.en}`).join('; ');
  const prefix = entityId !== undefined ? `${entityId}: ` : '';
  return new Response(
    JSON.stringify({
      error: `Save refused by blocking coherence rule(s): ${prefix}${summary}`,
      code: 'rule_blocked',
      findings: payload,
      ...(entityId !== undefined ? { entityId } : {}),
    }),
    { status: 422, headers: { 'content-type': 'application/json' } },
  );
}
