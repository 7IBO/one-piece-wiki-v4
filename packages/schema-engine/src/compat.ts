/**
 * Schema-compatibility "lockfile" (ADR-042).
 *
 * `buildContract` distils the catalogue down to the **public contract** the
 * SDK / API and external consumers depend on (entity-type property sets,
 * property value-types, relation endpoints + qualifiers, vocabulary value
 * sets). `diffContract` classifies a change between two contracts as
 * **additive** (safe) or **breaking** (removes/renames/retypes/tightens). The
 * `check:compat` CLI compares the live catalogue to the committed
 * `schema-snapshot.json`, so no breaking change reaches consumers unnoticed.
 */
import type { ValidatedCatalogue } from './meta-validator.ts';

export type SchemaContract = {
  readonly entityTypes: Record<string, {
    readonly properties: Record<string, { readonly required: boolean; }>;
    readonly allowed_relations: readonly string[];
  }>;
  readonly propertyTypes: Record<string, {
    readonly value_type: string;
    readonly enum_ref: string | null;
    readonly historical: boolean;
    readonly localizable: boolean;
  }>;
  readonly relationTypes: Record<string, {
    readonly valid_from_types: readonly string[];
    readonly valid_to_types: readonly string[];
    readonly inverse_inferred: boolean;
    readonly qualifiers: Record<string, {
      readonly value_type: string;
      readonly enum_ref: string | null;
      readonly required: boolean;
    }>;
  }>;
  readonly vocabularies: Record<string, readonly string[]>;
};

export type CompatFinding = { readonly kind: 'breaking' | 'additive'; readonly message: string; };

const uniqSorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort();
const byKey = <T>(m: ReadonlyMap<string, T>): [string, T][] =>
  [...m].sort((a, b) => a[0].localeCompare(b[0]));

/** Distil the validated catalogue into its consumer-facing contract. */
export function buildContract(catalogue: ValidatedCatalogue): SchemaContract {
  const entityTypes: Record<string, SchemaContract['entityTypes'][string]> = {};
  for (const [id, et] of byKey(catalogue.entityTypes)) {
    const properties: Record<string, { required: boolean; }> = {};
    for (const p of [...et.properties].sort((a, b) => a.id.localeCompare(b.id))) {
      properties[p.id] = { required: p.required === true };
    }
    entityTypes[id] = { properties, allowed_relations: uniqSorted(et.allowed_relations) };
  }

  const propertyTypes: Record<string, SchemaContract['propertyTypes'][string]> = {};
  for (const [id, pt] of byKey(catalogue.propertyTypes)) {
    propertyTypes[id] = {
      value_type: pt.value_type,
      enum_ref: pt.value_constraints?.enum_ref ?? null,
      historical: pt.historical === true,
      localizable: pt.localizable === true,
    };
  }

  const relationTypes: Record<string, SchemaContract['relationTypes'][string]> = {};
  for (const [id, rt] of byKey(catalogue.relationTypes)) {
    const qualifiers: Record<
      string,
      { value_type: string; enum_ref: string | null; required: boolean; }
    > = {};
    for (const q of [...rt.qualifiers].sort((a, b) => a.id.localeCompare(b.id))) {
      qualifiers[q.id] = {
        value_type: q.value_type,
        enum_ref: q.enum_ref ?? null,
        required: q.required === true,
      };
    }
    relationTypes[id] = {
      valid_from_types: uniqSorted(rt.valid_from_types),
      valid_to_types: uniqSorted(rt.valid_to_types),
      inverse_inferred: rt.inverse_inferred === true,
      qualifiers,
    };
  }

  const vocabularies: Record<string, readonly string[]> = {};
  for (const [id, voc] of byKey(catalogue.vocabularies)) {
    vocabularies[id] = Object.keys(voc.values).sort();
  }

  return { entityTypes, propertyTypes, relationTypes, vocabularies };
}

/** Deterministic JSON for the committed snapshot. */
export function serializeContract(contract: SchemaContract): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

const removed = (prev: readonly string[], next: readonly string[]): string[] =>
  prev.filter((x) => !next.includes(x));

/** Classify the change from `prev` (snapshot) to `next` (current catalogue). */
export function diffContract(prev: SchemaContract, next: SchemaContract): CompatFinding[] {
  const out: CompatFinding[] = [];
  const add = (kind: CompatFinding['kind'], message: string): void => {
    out.push({ kind, message });
  };

  // Entity types
  for (const id of Object.keys(prev.entityTypes)) {
    if (!(id in next.entityTypes)) add('breaking', `entity-type removed: ${id}`);
  }
  for (const id of Object.keys(next.entityTypes)) {
    const pe = prev.entityTypes[id];
    const ne = next.entityTypes[id]!;
    if (pe === undefined) {
      add('additive', `entity-type added: ${id}`);
      continue;
    }
    for (const prop of Object.keys(pe.properties)) {
      if (!(prop in ne.properties)) add('breaking', `${id}: property removed: ${prop}`);
    }
    for (const prop of Object.keys(ne.properties)) {
      const pp = pe.properties[prop];
      const np = ne.properties[prop]!;
      if (pp === undefined) {
        add(
          np.required ? 'breaking' : 'additive',
          `${id}: property added${np.required ? ' (required)' : ''}: ${prop}`,
        );
      } else if (!pp.required && np.required) {
        add('breaking', `${id}: property became required: ${prop}`);
      }
    }
    for (const rel of removed(pe.allowed_relations, ne.allowed_relations)) {
      add('breaking', `${id}: allowed_relations removed: ${rel}`);
    }
    for (const rel of removed(ne.allowed_relations, pe.allowed_relations)) {
      add('additive', `${id}: allowed_relations added: ${rel}`);
    }
  }

  // Property types
  for (const id of Object.keys(prev.propertyTypes)) {
    if (!(id in next.propertyTypes)) add('breaking', `property-type removed: ${id}`);
  }
  for (const id of Object.keys(next.propertyTypes)) {
    const pp = prev.propertyTypes[id];
    const np = next.propertyTypes[id]!;
    if (pp === undefined) {
      add('additive', `property-type added: ${id}`);
      continue;
    }
    if (pp.value_type !== np.value_type) {
      add('breaking', `property-type ${id}: value_type ${pp.value_type} -> ${np.value_type}`);
    }
    if (pp.enum_ref !== np.enum_ref) {
      add('breaking', `property-type ${id}: enum_ref ${pp.enum_ref} -> ${np.enum_ref}`);
    }
    if (pp.historical !== np.historical) {
      add('breaking', `property-type ${id}: historical ${pp.historical} -> ${np.historical}`);
    }
    if (pp.localizable !== np.localizable) {
      add('breaking', `property-type ${id}: localizable ${pp.localizable} -> ${np.localizable}`);
    }
  }

  // Relation types
  for (const id of Object.keys(prev.relationTypes)) {
    if (!(id in next.relationTypes)) add('breaking', `relation-type removed: ${id}`);
  }
  for (const id of Object.keys(next.relationTypes)) {
    const pr = prev.relationTypes[id];
    const nr = next.relationTypes[id]!;
    if (pr === undefined) {
      add('additive', `relation-type added: ${id}`);
      continue;
    }
    for (const t of removed(pr.valid_from_types, nr.valid_from_types)) {
      add('breaking', `relation ${id}: valid_from_types removed: ${t}`);
    }
    for (const t of removed(nr.valid_from_types, pr.valid_from_types)) {
      add('additive', `relation ${id}: valid_from_types added: ${t}`);
    }
    for (const t of removed(pr.valid_to_types, nr.valid_to_types)) {
      add('breaking', `relation ${id}: valid_to_types removed: ${t}`);
    }
    for (const t of removed(nr.valid_to_types, pr.valid_to_types)) {
      add('additive', `relation ${id}: valid_to_types added: ${t}`);
    }
    if (pr.inverse_inferred !== nr.inverse_inferred) {
      add(
        'breaking',
        `relation ${id}: inverse_inferred ${pr.inverse_inferred} -> ${nr.inverse_inferred}`,
      );
    }
    for (const q of Object.keys(pr.qualifiers)) {
      if (!(q in nr.qualifiers)) add('breaking', `relation ${id}: qualifier removed: ${q}`);
    }
    for (const q of Object.keys(nr.qualifiers)) {
      const pq = pr.qualifiers[q];
      const nq = nr.qualifiers[q]!;
      if (pq === undefined) {
        add(
          nq.required ? 'breaking' : 'additive',
          `relation ${id}: qualifier added${nq.required ? ' (required)' : ''}: ${q}`,
        );
      } else {
        if (pq.value_type !== nq.value_type) {
          add('breaking', `relation ${id}.${q}: value_type ${pq.value_type} -> ${nq.value_type}`);
        }
        if (pq.enum_ref !== nq.enum_ref) {
          add('breaking', `relation ${id}.${q}: enum_ref ${pq.enum_ref} -> ${nq.enum_ref}`);
        }
        if (!pq.required && nq.required) {
          add('breaking', `relation ${id}.${q}: became required`);
        }
      }
    }
  }

  // Vocabularies
  for (const id of Object.keys(prev.vocabularies)) {
    if (!(id in next.vocabularies)) add('breaking', `vocabulary removed: ${id}`);
  }
  for (const id of Object.keys(next.vocabularies)) {
    const pv = prev.vocabularies[id];
    const nv = next.vocabularies[id]!;
    if (pv === undefined) {
      add('additive', `vocabulary added: ${id}`);
      continue;
    }
    for (const v of removed(pv, nv)) add('breaking', `vocabulary ${id}: value removed: ${v}`);
    for (const v of removed(nv, pv)) add('additive', `vocabulary ${id}: value added: ${v}`);
  }

  return out;
}
