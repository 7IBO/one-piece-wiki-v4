/**
 * Universe-scoped schemas (ADR-035). Every schema (entity-type,
 * property-type, relation-type, vocabulary) may declare a `universes`
 * list. Omitted/empty = **shared core** (present in every universe).
 * A list scopes it to those universes only. A universe's effective
 * catalogue is core ∪ its own schemas.
 *
 * The invariant that keeps this manageable: **a schema may only
 * reference schemas that are present in every universe where it itself
 * is present.** Concretely, a core schema may only reference core
 * schemas (else the reference dangles in a universe that has the core
 * schema but not the scoped one); a `["one-piece"]` schema may reference
 * core + one-piece schemas. `checkUniverseScopes` enforces this.
 */
import type { CoherenceFinding } from './coherence.ts';
import type { ValidatedCatalogue } from './meta-validator.ts';

type Scoped = { readonly universes?: readonly string[] | undefined; };

/** A schema with no (or empty) `universes` is shared core. */
function isCore(scoped: Scoped): boolean {
  return scoped.universes === undefined || scoped.universes.length === 0;
}

/** Is `scoped` present in `universeId`? (core is present everywhere). */
function presentIn(scoped: Scoped, universeId: string): boolean {
  return isCore(scoped) || (scoped.universes as readonly string[]).includes(universeId);
}

/**
 * Every universe `referrer` is present in must also contain `referee`,
 * otherwise the reference dangles there. Core ⊆ X only when X is core.
 */
function scopeCovers(referrer: Scoped, referee: Scoped): boolean {
  if (isCore(referee)) return true; // present everywhere — always covers.
  if (isCore(referrer)) return false; // referrer everywhere, referee not.
  const refereeSet = new Set(referee.universes as readonly string[]);
  return (referrer.universes as readonly string[]).every((u) => refereeSet.has(u));
}

/**
 * The effective catalogue for one universe: shared-core schemas ∪
 * schemas scoped to `universeId`. Errors are passed through unchanged.
 */
export function forUniverse(
  catalogue: ValidatedCatalogue,
  universeId: string,
): ValidatedCatalogue {
  const keep = (v: Scoped): boolean => presentIn(v, universeId);
  return {
    entityTypes: new Map([...catalogue.entityTypes].filter(([, v]) => keep(v))),
    propertyTypes: new Map([...catalogue.propertyTypes].filter(([, v]) => keep(v))),
    relationTypes: new Map([...catalogue.relationTypes].filter(([, v]) => keep(v))),
    vocabularies: new Map([...catalogue.vocabularies].filter(([, v]) => keep(v))),
    errors: catalogue.errors,
  };
}

/**
 * Enforce the cross-universe invariant: no schema references one whose
 * universe scope is narrower than its own. Runs over the whole catalogue
 * (no per-universe data needed), so an inconsistent tag is caught before
 * any second universe exists.
 */
export function checkUniverseScopes(
  catalogue: ValidatedCatalogue,
): readonly CoherenceFinding[] {
  const findings: CoherenceFinding[] = [];
  const { entityTypes, propertyTypes, relationTypes, vocabularies } = catalogue;

  const check = (
    referrer: Scoped,
    referrerLabel: string,
    refereeMap: ReadonlyMap<string, Scoped>,
    refereeId: string,
    refereeKind: string,
    path: string,
  ): void => {
    const referee = refereeMap.get(refereeId);
    if (referee === undefined) return; // missing-ref is check:references' job.
    if (!scopeCovers(referrer, referee)) {
      findings.push({
        code: 'SCHEMA_UNIVERSE_SCOPE_LEAK',
        severity: 'error',
        source: referrerLabel,
        path,
        message: `references ${refereeKind} "${refereeId}" (universes: ${
          refereeFmt(referee)
        }) but is itself broader (universes: ${
          refereeFmt(referrer)
        }); the reference would dangle where ${refereeKind} is absent.`,
      });
    }
  };

  for (const [id, et] of entityTypes) {
    for (const [i, prop] of et.properties.entries()) {
      check(et, id, propertyTypes, prop.id, 'property', `properties[${i}].id`);
    }
    for (const rel of et.allowed_relations) {
      check(et, id, relationTypes, rel, 'relation', 'allowed_relations');
    }
    for (const propId of et.display_name_properties ?? []) {
      check(et, id, propertyTypes, propId, 'property', 'display_name_properties');
    }
  }

  for (const [id, pt] of propertyTypes) {
    const enumRef = pt.value_constraints?.enum_ref;
    if (enumRef !== undefined) {
      check(pt, id, vocabularies, enumRef, 'vocabulary', 'value_constraints.enum_ref');
    }
    for (const etId of pt.applies_to_entity_types ?? []) {
      check(pt, id, entityTypes, etId, 'entity type', 'applies_to_entity_types');
    }
  }

  for (const [id, rt] of relationTypes) {
    for (const etId of rt.valid_from_types) {
      check(rt, id, entityTypes, etId, 'entity type', 'valid_from_types');
    }
    for (const etId of rt.valid_to_types) {
      check(rt, id, entityTypes, etId, 'entity type', 'valid_to_types');
    }
    for (const q of rt.qualifiers) {
      if (q.enum_ref !== undefined) {
        check(rt, id, vocabularies, q.enum_ref, 'vocabulary', `qualifiers.${q.id}.enum_ref`);
      }
    }
  }

  return findings;
}

function refereeFmt(scoped: Scoped): string {
  return isCore(scoped) ? 'core' : (scoped.universes as readonly string[]).join(', ');
}
