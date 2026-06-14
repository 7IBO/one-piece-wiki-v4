import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-069 — merge `references` into `features`.
 *
 * A source "involving" an entity is one relation; whether the entity is shown or
 * merely evoked is the `appearance_type` qualifier, not a separate relation type.
 * So `references` edges become `features` with `appearance_type: "mentioned"`,
 * and the retired non-visual appearance values (`named_only`, `narrator_only`)
 * collapse into `mentioned`.
 *
 * No entity in `/data/universes/**` uses `references`, `named_only` or
 * `narrator_only`, so this is a no-op on the present corpus; kept as the record.
 * Returns a NEW object only when something changed (the runner diffs strings).
 */
const COLLAPSE = new Set(['named_only', 'narrator_only']);

const migration: Migration = {
  id: '0004-merge-references-into-features',
  description:
    'Merge references edges into features{appearance_type:mentioned}; collapse named_only/narrator_only (ADR-069).',
  up: (data) => {
    const rels = data.relations as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(rels)) return data;

    let touched = false;
    const next = rels.map((rel) => {
      let r = rel;
      if (r.type === 'references') {
        const quals = { ...(r.qualifiers as Record<string, unknown> | undefined) };
        if (quals.appearance_type === undefined) quals.appearance_type = 'mentioned';
        r = { ...r, type: 'features', qualifiers: quals };
        touched = true;
      }
      const q = r.qualifiers as Record<string, unknown> | undefined;
      if (q !== undefined && COLLAPSE.has(q.appearance_type as string)) {
        r = { ...r, qualifiers: { ...q, appearance_type: 'mentioned' } };
        touched = true;
      }
      return r;
    });

    return touched ? { ...data, relations: next } : data;
  },
};

export default migration;
