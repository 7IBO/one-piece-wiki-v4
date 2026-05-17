/**
 * `GET /api/entities/$type` — list of every entity of the given type
 * with its display name pre-resolved. Powers the per-type browse
 * page. No auth.
 */
import { createFileRoute } from '@tanstack/react-router';
import { buildDisplayNames, json, snapshot } from '../server/catalogue';

export const Route = createFileRoute('/api/entities/$type')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { type } = params;
        const snap = await snapshot();
        const names = await buildDisplayNames(snap);
        const list = [...snap.entities.values()]
          .filter((e) => e.type === type)
          .map((e) => ({
            id: e.id,
            type: e.type,
            slug: e.data['slug'],
            canonical_name_key: e.data['canonical_name_key'] ?? null,
            displayName: names.get(e.id) ?? { en: null, fr: null },
          }))
          .sort((a, b) => {
            const an = names.get(a.id)?.en ?? String(a.slug);
            const bn = names.get(b.id)?.en ?? String(b.slug);
            return an.localeCompare(bn);
          });
        return json(list);
      },
    },
  },
});
