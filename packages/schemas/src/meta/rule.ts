import { z } from 'zod';
import { LocalizedLabel, Slug } from '../primitives.ts';

/**
 * Declarative coherence rule (ADR-085). Rules encode "this data shape
 * is USUALLY wrong" knowledge — a Marine with a bounty, two devil
 * fruits at once, a death without a source anchor — as advisory
 * findings. They NEVER block validation: One Piece is built on
 * exceptions (Cross Guild bounties on admirals, Blackbeard's two
 * fruits), so a finding is a prompt to double-check or add the
 * distinguishing qualifier, not an error.
 *
 * A rule = conditions (`when`, ALL must hold) + expectations
 * (`expect`, each violated one yields a finding). Two scopes:
 *  - `entity` (default): conditions/expectations read the whole
 *    entity (latest property values, relations).
 *  - `entry`: the rule runs once per property ENTRY matched by
 *    `entry_property` (`*` = every property), with entry-level
 *    conditions/expectations (qualifier presence, ordering).
 *
 * Evaluated by `check:coherence` in CI and live by the dashboard form
 * (browser-safe engine in schema-engine/src/rules.ts).
 *
 * ADR-088 adds an OPT-IN `enforcement: 'blocking'` notch for the rare
 * rule that encodes a structural impossibility (not canon knowledge):
 * the dashboard save endpoint refuses (422) and `check:coherence`
 * reports the finding as an error. The default stays `advisory` —
 * the ADR-085 principle (canon lives on exceptions) is unchanged.
 */

/** Entity-scope condition — ALL listed must hold for the rule to fire. */
export const RuleCondition = z.object({
  /** Latest entry of `property` equals `value` (strict equality). */
  property_latest_equals: z
    .object({ property: Slug, value: z.unknown() })
    .optional(),
  /** Entity has ≥1 ACTIVE relation (no `until`) of this type; optional
   *  target entity-type / exact target id narrowing. */
  has_active_relation: z
    .object({
      type: Slug,
      target_type: Slug.optional(),
      target: z.string().optional(),
    })
    .optional(),
  /** Property present with ≥1 entry. */
  property_present: z.object({ property: Slug }).optional(),
});

/** Expectation — each one that does NOT hold yields a finding. */
export const RuleExpectation = z.object({
  /** The property should carry no entries. */
  property_absent: z.object({ property: Slug }).optional(),
  /** The property should carry ≥1 entry. */
  property_present: z.object({ property: Slug }).optional(),
  /** At most `max` concurrent (no `until`) relations of this type. */
  max_concurrent_relations: z
    .object({ type: Slug, max: z.number().int().nonnegative() })
    .optional(),
});

/** Entry-scope condition/expectation (rule.scope === 'entry'). */
export const RuleEntryCondition = z.object({
  /** Entry has this qualifier set to `value` (or just set, if omitted). */
  qualifier_equals: z
    .object({ qualifier: Slug, value: z.unknown().optional() })
    .optional(),
  /** The entry's own value equals `value`. */
  value_equals: z.object({ value: z.unknown() }).optional(),
});

export const RuleEntryExpectation = z.object({
  /** Entry should carry this qualifier (non-empty). */
  qualifier_present: z.object({ qualifier: Slug }).optional(),
  /** `until` must not precede `since` when both refer to the same
   *  source type and both slugs are numeric (chapter/episode order). */
  until_not_before_since: z.object({}).optional(),
});

/** Relation-scope condition/expectation (rule.scope === 'relation').
 *  The rule runs once per relation EDGE of `relation_type` (or every
 *  edge when omitted / `*`) stored on the entity. ADR-090. */
export const RuleRelationCondition = z.object({
  /** Edge has this qualifier set to `value` (or just set, if omitted). */
  qualifier_equals: z
    .object({ qualifier: Slug, value: z.unknown().optional() })
    .optional(),
  /** The edge's target entity-type equals `type`. */
  target_type_is: z.object({ type: Slug }).optional(),
});

export const RuleRelationExpectation = z.object({
  /** Edge should carry this qualifier (non-empty). */
  qualifier_present: z.object({ qualifier: Slug }).optional(),
  /** Edge should carry AT LEAST ONE of these qualifiers (non-empty).
   *  E.g. `available-on` needs `external_id` or `url` to ever yield a
   *  usable link at build time (ADR-087/ADR-090). */
  qualifier_present_one_of: z
    .object({ qualifiers: z.array(Slug).min(1) })
    .optional(),
});

export const RuleSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** See PropertyTypeSchema.universes — omitted/empty = shared core. */
  universes: z.array(Slug).optional(),
  /** Advisory severity of the finding text (display weight). */
  severity: z.enum(['info', 'warning']),
  /** ADR-088 — how violations are enforced. `advisory` (default):
   *  finding only, save always allowed. `blocking`: the dashboard
   *  save/create endpoints refuse with 422 and `check:coherence`
   *  treats the finding as an ERROR. Reserve `blocking` for rules
   *  that are structurally ALWAYS wrong (no canon exception can
   *  exist), e.g. `until` preceding `since`. */
  enforcement: z.enum(['advisory', 'blocking']).default('advisory'),
  labels: LocalizedLabel,
  /** Finding text shown to editors (localized, may mention known
   *  canonical exceptions so the editor can self-serve). */
  messages: LocalizedLabel,
  /** Entity types the rule runs on. Empty/omitted = every type. */
  applies_to_entity_types: z.array(Slug).optional(),
  scope: z.enum(['entity', 'entry', 'relation']).default('entity'),
  /** For scope 'entry': which property's entries to visit — a
   *  property id, or `*` for every property. */
  entry_property: z.string().optional(),
  /** For scope 'relation': which relation type's edges to visit — a
   *  relation-type id, or `*`/omitted for every edge (ADR-090). */
  relation_type: z.string().optional(),
  when: z.array(RuleCondition).default([]),
  expect: z.array(RuleExpectation).default([]),
  entry_when: z.array(RuleEntryCondition).default([]),
  entry_expect: z.array(RuleEntryExpectation).default([]),
  relation_when: z.array(RuleRelationCondition).default([]),
  relation_expect: z.array(RuleRelationExpectation).default([]),
});
export type RuleSchema = z.infer<typeof RuleSchema>;
