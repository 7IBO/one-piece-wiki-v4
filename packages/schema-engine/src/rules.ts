/**
 * Declarative coherence-rule engine (ADR-085) — browser-safe (no
 * node:*), shared verbatim by `check:coherence` in CI and the
 * dashboard form's live advisory panel. Findings are ADVISORY by
 * default: One Piece canon is built on exceptions — Cross Guild
 * bounties on Marines, Blackbeard's two fruits — so a finding means
 * "double-check / add the distinguishing qualifier", never "invalid".
 *
 * ADR-088: a rule may opt into `enforcement: 'blocking'` when it is
 * structurally ALWAYS wrong (no canon exception possible). Blocking
 * findings make `check:coherence` fail and the dashboard save
 * endpoint refuse (422). The engine itself only REPORTS enforcement;
 * callers decide what to do with it.
 *
 * ADR-090: `scope: 'relation'` visits stored relation EDGES (filtered
 * by `relation_type`) the way `entry` visits property entries, with
 * edge-level conditions/expectations on qualifiers (ADR-098 adds the
 * `qualifier_absent` expectation — the mirror of `property_absent`).
 *
 * ADR-099: entity-scope rules gain INCOMING-edge awareness — the
 * `has_active_incoming_relation` condition and the
 * `no_active_incoming_relation` expectation. Both need corpus-wide
 * knowledge a single entity cannot supply, so `evaluateRules` accepts
 * an optional `CorpusContext` (an incoming-active-edge oracle).
 * `check:coherence` builds it from its full entity map; callers
 * without one — the dashboard live form and save endpoint, which see
 * one entity at a time — pass nothing, and any rule using these
 * fields is SKIPPED silently (no finding either way). The same skip
 * applies when the entity carries no `id` (the index is keyed by id).
 *
 * The expectation/condition vocabulary evaluated here must stay in
 * sync with the Zod shapes in packages/schemas/src/meta/rule.ts.
 */
import type { Rule } from './meta-validator.ts';

export type RuleFinding = {
  readonly ruleId: string;
  readonly severity: 'info' | 'warning';
  /** ADR-088 — `blocking` findings fail CI and refuse the save. */
  readonly enforcement: 'advisory' | 'blocking';
  /** Localized message straight from the rule file. */
  readonly messages: { readonly en: string; readonly fr: string; };
  /** Property the finding anchors to, when entry/property-scoped. */
  readonly property?: string;
  /** Entry index (0-based) for entry-scoped findings. */
  readonly entryIndex?: number;
  /** Relation type + edge index (0-based within the entity's stored
   *  `relations` array) for relation-scoped findings (ADR-090). An
   *  ADR-099 `no_active_incoming_relation` finding sets only
   *  `relationType` (the offending edge lives on ANOTHER entity). */
  readonly relationType?: string;
  readonly relationIndex?: number;
};

type EntryRecord = Record<string, unknown>;

type EntityLike = {
  /** Entity id (`type:slug`) — needed only by the ADR-099 incoming-edge
   *  fields (the corpus index is keyed by id); optional otherwise. */
  readonly id?: string | undefined;
  readonly type: string;
  readonly properties?: Record<string, unknown> | undefined;
  readonly relations?:
    | readonly {
      readonly type: string;
      readonly target: string;
      readonly qualifiers?: Record<string, unknown> | undefined;
    }[]
    | undefined;
};

function entriesOf(value: unknown): readonly EntryRecord[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (e): e is EntryRecord => e !== null && typeof e === 'object' && !Array.isArray(e),
  );
}

function qualifierIsSet(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** ACTIVE = the edge's `until` qualifier is not set. Exported so
 *  `check:coherence` builds its ADR-099 incoming index with the exact
 *  same active semantics the rules use. */
export function relationIsActive(qualifiers: Record<string, unknown> | undefined): boolean {
  return !qualifierIsSet(qualifiers?.['until']);
}

/**
 * Corpus-wide knowledge for the ADR-099 incoming-edge rule fields.
 * Built by `check:coherence` from its full entity map; absent in
 * single-entity callers (dashboard), which therefore skip such rules.
 */
export type CorpusContext = {
  /** true when ≥1 ACTIVE (no `until`) stored edge of `relationType`
   *  points AT `entityId`; `sourceType` narrows to edges whose SOURCE
   *  entity has that type. */
  readonly hasActiveIncomingRelation: (
    entityId: string,
    relationType: string,
    sourceType?: string,
  ) => boolean;
};

/** Does the rule use any field that needs a `CorpusContext`? */
function ruleNeedsCorpusContext(rule: Rule): boolean {
  return rule.when.some((c) => c.has_active_incoming_relation !== undefined)
    || rule.expect.some((e) => e.no_active_incoming_relation !== undefined);
}

/** First source ref of a possibly-array `since`/`until` qualifier. */
function firstRef(v: unknown): string | null {
  if (typeof v === 'string' && v !== '') return v;
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0] !== '') return v[0];
  return null;
}

/**
 * Numeric order comparison for two source refs of the SAME type with
 * numeric slugs (`manga-chapter:96` vs `manga-chapter:1044`). Returns
 * null when incomparable (different types, non-numeric slugs).
 */
function refOrder(a: string, b: string): number | null {
  const [ta, sa] = a.split(':');
  const [tb, sb] = b.split(':');
  if (ta !== tb || sa === undefined || sb === undefined) return null;
  const na = /^\d+$/.test(sa) ? Number(sa) : null;
  const nb = /^\d+$/.test(sb) ? Number(sb) : null;
  if (na === null || nb === null) return null;
  return na - nb;
}

function latestEntry(value: unknown): EntryRecord | null {
  const list = entriesOf(value);
  return list.length > 0 ? list[list.length - 1]! : null;
}

function conditionHolds(
  entity: EntityLike,
  c: Rule['when'][number],
  context: CorpusContext | undefined,
): boolean {
  if (c.property_latest_equals !== undefined) {
    const { property, value } = c.property_latest_equals;
    const last = latestEntry(entity.properties?.[property]);
    if (last === null || last['value'] !== value) return false;
  }
  if (c.has_active_relation !== undefined) {
    const { type, target_type, target } = c.has_active_relation;
    const rels = entity.relations ?? [];
    const hit = rels.some((r) => {
      if (r.type !== type) return false;
      if (!relationIsActive(r.qualifiers)) return false;
      if (target !== undefined && r.target !== target) return false;
      if (target_type !== undefined && r.target.split(':')[0] !== target_type) return false;
      return true;
    });
    if (!hit) return false;
  }
  if (c.property_present !== undefined) {
    if (entriesOf(entity.properties?.[c.property_present.property]).length === 0) return false;
  }
  if (c.has_active_incoming_relation !== undefined) {
    // Guarded by the caller: rules with this field are skipped when no
    // CorpusContext (or no entity id) is available.
    if (context === undefined || entity.id === undefined) return false;
    const { type, source_type } = c.has_active_incoming_relation;
    if (
      !context.hasActiveIncomingRelation(
        entity.id,
        String(type),
        source_type === undefined ? undefined : String(source_type),
      )
    ) return false;
  }
  return true;
}

type RelationEdge = NonNullable<EntityLike['relations']>[number];

function relationConditionHolds(edge: RelationEdge, c: Rule['relation_when'][number]): boolean {
  if (c.qualifier_equals !== undefined) {
    const { qualifier, value } = c.qualifier_equals;
    const v = edge.qualifiers?.[qualifier];
    if (!qualifierIsSet(v)) return false;
    if (value !== undefined && v !== value) return false;
  }
  if (c.target_type_is !== undefined) {
    if (edge.target.split(':')[0] !== String(c.target_type_is.type)) return false;
  }
  return true;
}

function entryConditionHolds(entry: EntryRecord, c: Rule['entry_when'][number]): boolean {
  if (c.qualifier_equals !== undefined) {
    const { qualifier, value } = c.qualifier_equals;
    const v = entry[qualifier];
    if (!qualifierIsSet(v)) return false;
    if (value !== undefined && v !== value) return false;
  }
  if (c.value_equals !== undefined) {
    if (entry['value'] !== c.value_equals.value) return false;
  }
  return true;
}

/**
 * Evaluate every applicable rule against one entity. `context` is the
 * optional ADR-099 corpus oracle; without it (or without `entity.id`)
 * any rule using the incoming-edge fields is skipped silently.
 */
export function evaluateRules(
  entity: EntityLike,
  rules: Iterable<Rule>,
  context?: CorpusContext,
): readonly RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const rule of rules) {
    const applies = rule.applies_to_entity_types === undefined
      || rule.applies_to_entity_types.length === 0
      || rule.applies_to_entity_types.some((t) => String(t) === entity.type);
    if (!applies) continue;
    if (
      ruleNeedsCorpusContext(rule)
      && (context === undefined || entity.id === undefined)
    ) continue;

    if (rule.scope === 'entry') {
      const targetProps = rule.entry_property === '*' || rule.entry_property === undefined
        ? Object.keys(entity.properties ?? {})
        : [rule.entry_property];
      for (const property of targetProps) {
        const list = entriesOf(entity.properties?.[property]);
        list.forEach((entry, entryIndex) => {
          if (!rule.entry_when.every((c) => entryConditionHolds(entry, c))) return;
          for (const exp of rule.entry_expect) {
            let ok = true;
            if (exp.qualifier_present !== undefined) {
              ok = qualifierIsSet(entry[exp.qualifier_present.qualifier]);
            } else if (exp.until_not_before_since !== undefined) {
              const since = firstRef(entry['since']);
              const until = firstRef(entry['until']);
              if (since !== null && until !== null) {
                const order = refOrder(since, until);
                ok = order === null || order <= 0;
              }
            }
            if (!ok) {
              findings.push({
                ruleId: rule.id,
                severity: rule.severity,
                enforcement: rule.enforcement,
                messages: rule.messages,
                property,
                entryIndex,
              });
            }
          }
        });
      }
      continue;
    }

    if (rule.scope === 'relation') {
      const edges = entity.relations ?? [];
      edges.forEach((edge, relationIndex) => {
        if (
          rule.relation_type !== undefined
          && rule.relation_type !== '*'
          && edge.type !== rule.relation_type
        ) return;
        if (!rule.relation_when.every((c) => relationConditionHolds(edge, c))) return;
        for (const exp of rule.relation_expect) {
          let ok = true;
          if (exp.qualifier_present !== undefined) {
            ok = qualifierIsSet(edge.qualifiers?.[exp.qualifier_present.qualifier]);
          } else if (exp.qualifier_present_one_of !== undefined) {
            ok = exp.qualifier_present_one_of.qualifiers.some((q) =>
              qualifierIsSet(edge.qualifiers?.[String(q)])
            );
          } else if (exp.qualifier_absent !== undefined) {
            // ADR-098 — the relation-scope mirror of `property_absent`:
            // holds when the qualifier is NOT set on the edge.
            ok = !qualifierIsSet(edge.qualifiers?.[exp.qualifier_absent.qualifier]);
          }
          if (!ok) {
            findings.push({
              ruleId: rule.id,
              severity: rule.severity,
              enforcement: rule.enforcement,
              messages: rule.messages,
              relationType: edge.type,
              relationIndex,
            });
          }
        }
      });
      continue;
    }

    // Entity scope.
    if (!rule.when.every((c) => conditionHolds(entity, c, context))) continue;
    for (const exp of rule.expect) {
      let ok = true;
      let property: string | undefined;
      let relationType: string | undefined;
      if (exp.property_absent !== undefined) {
        property = exp.property_absent.property;
        ok = entriesOf(entity.properties?.[property]).length === 0;
      } else if (exp.property_present !== undefined) {
        property = exp.property_present.property;
        ok = entriesOf(entity.properties?.[property]).length > 0;
      } else if (exp.max_concurrent_relations !== undefined) {
        const { type, max } = exp.max_concurrent_relations;
        const active = (entity.relations ?? []).filter(
          (r) => r.type === type && relationIsActive(r.qualifiers),
        );
        ok = active.length <= max;
      } else if (exp.no_active_incoming_relation !== undefined) {
        // Reached only with a CorpusContext + entity id (see the
        // ruleNeedsCorpusContext skip above).
        relationType = String(exp.no_active_incoming_relation.type);
        if (context !== undefined && entity.id !== undefined) {
          ok = !context.hasActiveIncomingRelation(entity.id, relationType);
        }
      }
      if (!ok) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          enforcement: rule.enforcement,
          messages: rule.messages,
          ...(property !== undefined ? { property } : {}),
          ...(relationType !== undefined ? { relationType } : {}),
        });
      }
    }
  }

  return findings;
}
