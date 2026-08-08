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
};

type EntryRecord = Record<string, unknown>;

type EntityLike = {
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

function relationIsActive(qualifiers: Record<string, unknown> | undefined): boolean {
  return !qualifierIsSet(qualifiers?.['until']);
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

function conditionHolds(entity: EntityLike, c: Rule['when'][number]): boolean {
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

/** Evaluate every applicable rule against one entity. */
export function evaluateRules(
  entity: EntityLike,
  rules: Iterable<Rule>,
): readonly RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const rule of rules) {
    const applies = rule.applies_to_entity_types === undefined
      || rule.applies_to_entity_types.length === 0
      || rule.applies_to_entity_types.some((t) => String(t) === entity.type);
    if (!applies) continue;

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

    // Entity scope.
    if (!rule.when.every((c) => conditionHolds(entity, c))) continue;
    for (const exp of rule.expect) {
      let ok = true;
      let property: string | undefined;
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
      }
      if (!ok) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          enforcement: rule.enforcement,
          messages: rule.messages,
          ...(property !== undefined ? { property } : {}),
        });
      }
    }
  }

  return findings;
}
