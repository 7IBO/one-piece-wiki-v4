/**
 * `GET /api/schemas` — returns the validated schema catalogue. Read by
 * every dashboard page through `api.schemas()` on the client. No auth.
 */
import { createFileRoute } from '@tanstack/react-router';
import { json, snapshot } from '../server/catalogue';

export const Route = createFileRoute('/api/schemas')({
  server: {
    handlers: {
      GET: async () => {
        const snap = await snapshot();
        return json({
          entityTypes: Object.fromEntries(snap.validated.entityTypes),
          propertyTypes: Object.fromEntries(snap.validated.propertyTypes),
          relationTypes: Object.fromEntries(snap.validated.relationTypes),
          vocabularies: Object.fromEntries(snap.validated.vocabularies),
        });
      },
    },
  },
});
