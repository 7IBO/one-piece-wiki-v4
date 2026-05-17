/**
 * `GET /api/entities/$type/table` — bulk-edit "table view" payload.
 *
 * Returns every entity of the given type with its full `data` and
 * per-locale translations bundled in. Deliberately skips per-entity
 * GitHub SHA lookups: fetching one blob per entity scales poorly for
 * a 1000-row table and is unnecessary in practice (the save endpoint
 * accepts `sha: null` and the table view trades optimistic-locking
 * for bulk speed — the single-entity editor still uses SHA-locked
 * saves).
 *
 * Static segment match: this MUST resolve before the per-entity
 * `$slug` route, otherwise `/api/entities/foo/table` would look up
 * an entity with slug `table`. TanStack Router prioritises literal
 * segments over params automatically, so co-locating both files
 * works.
 */
import { createFileRoute } from '@tanstack/react-router';
import { json, readTranslationsFor, snapshot } from '../server/catalogue';

export const Route = createFileRoute('/api/entities/$type/table')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { type } = params;
        const snap = await snapshot();
        const ofType = [...snap.entities.values()].filter((e) => e.type === type);
        const rows = await Promise.all(
          ofType.map(async (e) => {
            const slug = String(e.data['slug'] ?? '');
            const fileBase = e.id.split(':')[1] ?? slug;
            const translations = await readTranslationsFor(type, fileBase);
            return {
              id: e.id,
              type,
              slug,
              data: e.data,
              translations,
            };
          }),
        );
        rows.sort((a, b) => a.slug.localeCompare(b.slug));
        return json({ entities: rows });
      },
    },
  },
});
