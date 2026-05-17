/**
 * `GET /api/i18n-keys` — every dotted i18n key found anywhere across
 * the loaded entities. Used by the form's translation auto-complete
 * so the maintainer can re-use an existing key instead of inventing
 * a slightly different one. No auth.
 */
import { createFileRoute } from '@tanstack/react-router';
import { collectI18nKeysFrom, json, snapshot } from '../server/catalogue';

export const Route = createFileRoute('/api/i18n-keys')({
  server: {
    handlers: {
      GET: async () => {
        const snap = await snapshot();
        const seen = new Set<string>();
        for (const entity of snap.entities.values()) {
          collectI18nKeysFrom(entity.data, seen);
        }
        return json([...seen].sort());
      },
    },
  },
});
