import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-098 — catalogue dedup pass, vocabulary trims (audit V1/V2,
 * `/docs/audits/2026-08-09-catalogue-redundancy.md`).
 *
 * - `name-types` loses `epithet` and `title`: the dedicated `epithet`
 *   property (9 live entries) and the `bears-title` relation are the
 *   single homes for those facts.
 * - `loyalty-statuses` loses `allied`: an ally is an `ally-of` edge,
 *   not a membership flavour.
 *
 * **0 uses of any of the three values in the corpus** (verified
 * 2026-08-09: every `name_type` qualifier is `common`/`true_name`;
 * no entity sets `loyalty_status` at all), so this is a no-op on the
 * present corpus — kept as the historical record. Instead of silently
 * dropping data, `up` ASSERTS the invariant: any future replay against
 * a corpus that does use one of the removed values fails loudly so the
 * entry can be re-homed by hand (epithet/title → `epithet` property /
 * `bears-title` edge; allied → `ally-of` edge).
 */
const migration: Migration = {
  id: '0008-trim-name-and-loyalty-vocabularies',
  description:
    'Assert the removed vocabulary values (name-types epithet/title, loyalty-statuses allied) are unused (ADR-098).',
  up: (data) => {
    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    const props = asRecord(data['properties']);
    if (props !== null) {
      for (const [key, value] of Object.entries(props)) {
        const entries = Array.isArray(value) ? value : [value];
        for (const entry of entries) {
          const record = asRecord(entry);
          const nameType = record?.['name_type'];
          if (nameType === 'epithet' || nameType === 'title') {
            throw new Error(
              `${String(data['id'])}: property "${key}" uses removed name_type "${
                String(nameType)
              }" — re-home it (epithet property / bears-title relation) before migrating (ADR-098).`,
            );
          }
        }
      }
    }

    const relations = data['relations'];
    if (Array.isArray(relations)) {
      for (const rel of relations) {
        const record = asRecord(rel);
        const qualifiers = asRecord(record?.['qualifiers']);
        if (qualifiers?.['loyalty_status'] === 'allied') {
          throw new Error(
            `${
              String(data['id'])
            }: member-of edge uses removed loyalty_status "allied" — re-home it as an ally-of edge before migrating (ADR-098).`,
          );
        }
      }
    }

    return data;
  },
};

export default migration;
