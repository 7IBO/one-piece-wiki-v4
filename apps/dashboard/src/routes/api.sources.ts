/**
 * `GET /api/sources` — list of source-type entities (manga chapters,
 * anime episodes, films, SBS, databooks) for the source picker. No
 * auth. Sorted by type then chapter number then slug so the dropdown
 * stays stable across renders.
 */
import { createFileRoute } from '@tanstack/react-router';
import {
  buildDisplayNames,
  chapterNumber,
  isSourceType,
  json,
  snapshot,
} from '../server/catalogue';

export const Route = createFileRoute('/api/sources')({
  server: {
    handlers: {
      GET: async () => {
        const snap = await snapshot();
        const names = await buildDisplayNames(snap);
        const sources = [...snap.entities.values()]
          .filter((e) => isSourceType(e.type))
          .map((e) => ({
            id: e.id,
            type: e.type,
            slug: e.data['slug'],
            number: chapterNumber(e),
            displayName: names.get(e.id) ?? { en: null, fr: null },
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.number !== null && b.number !== null) return a.number - b.number;
            return String(a.slug).localeCompare(String(b.slug));
          });
        return json(sources);
      },
    },
  },
});
