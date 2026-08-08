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

export const RuleSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** See PropertyTypeSchema.universes — omitted/empty = shared core. */
  universes: z.array(Slug).optional(),
  /** Advisory severity — never blocking. */
  severity: z.enum(['info', 'warning']),
  labels: LocalizedLabel,
  /** Finding text shown to editors (localized, may mention known
   *  canonical exceptions so the editor can self-serve). */
  messages: LocalizedLabel,
  /** Entity types the rule runs on. Empty/omitted = every type. */
  applies_to_entity_types: z.array(Slug).optional(),
  scope: z.enum(['entity', 'entry']).default('entity'),
  /** For scope 'entry': which property's entries to visit — a
   *  property id, or `*` for every property. */
  entry_property: z.string().optional(),
  when: z.array(RuleCondition).default([]),
  expect: z.array(RuleExpectation).default([]),
  entry_when: z.array(RuleEntryCondition).default([]),
  entry_expect: z.array(RuleEntryExpectation).default([]),
});
export type RuleSchema = z.infer<typeof RuleSchema>;
