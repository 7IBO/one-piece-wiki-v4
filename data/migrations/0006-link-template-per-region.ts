import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-090 — `link_template` becomes a multi-entry property so a
 * platform can carry one template per region (`region` qualifier),
 * following the `publications` per-country precedent. The entry
 * WITHOUT a `region` qualifier is the worldwide default.
 *
 * Data shape change: `{ "value": "…" }` → `[{ "value": "…" }]` on
 * `streaming-platform` entities (schema_version 2 → 3). Purely
 * mechanical; the existing single template becomes the default entry.
 */
const migration: Migration = {
  id: '0006-link-template-per-region',
  description:
    'Wrap streaming-platform `link_template` single entry into a list (per-region templates, ADR-090).',
  up: (data) => {
    if (data['type'] !== 'streaming-platform') return data;
    const props = data['properties'];
    if (props === null || typeof props !== 'object' || Array.isArray(props)) return data;
    const current = (props as Record<string, unknown>)['link_template'];
    const needsWrap = current !== undefined && !Array.isArray(current);
    const staleVersion = data['schema_version'] !== 3;
    if (!needsWrap && !staleVersion) return data;
    const next = structuredClone(data);
    const nextProps = next['properties'] as Record<string, unknown>;
    if (needsWrap) nextProps['link_template'] = [current];
    next['schema_version'] = 3;
    return next;
  },
};

export default migration;
