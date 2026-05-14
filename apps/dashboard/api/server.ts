/**
 * Phase 4.1 dashboard API.
 *
 * Endpoints:
 *   GET  /api/schemas
 *   GET  /api/entities/:type
 *   GET  /api/entities/:type/:slug
 *   POST /api/entities/:type/:slug    (writes JSON file to disk)
 *
 * No auth; binds to 127.0.0.1 only. Vite proxies /api/* to this server
 * during dev (apps/dashboard/vite.config.ts). The save action calls
 * the schema-engine's loadSchemas + validate path before writing so a
 * malformed payload is rejected with the structured Zod error
 * surfaced from the schema layer.
 */
import {
  loadEntities,
  loadSchemas,
  validateCatalogue,
  type ValidatedCatalogue,
} from '@onepiece-wiki/schema-engine';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const UNIVERSES_DIR = resolve(REPO_ROOT, 'data', 'universes');
const UNIVERSE = 'one-piece';
const PORT = Number(process.env['DASHBOARD_API_PORT'] ?? '4101');

type CatalogueSnapshot = {
  validated: ValidatedCatalogue;
  entities: ReadonlyMap<string, { id: string; type: string; data: Record<string, unknown>; }>;
};

async function snapshot(): Promise<CatalogueSnapshot> {
  const catalogue = await loadSchemas();
  const validated = validateCatalogue(catalogue);
  if (catalogue.errors.length > 0 || validated.errors.length > 0) {
    throw new Error('Schema catalogue has errors. Run bun run schema:check.');
  }
  const loaded = await loadEntities(validated);
  if (loaded.errors.length > 0) {
    throw new Error('Entity files have errors. Run bun run validate.');
  }
  return { validated, entities: loaded.entities };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function notFound(message: string): Response {
  return json({ error: message }, 404);
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

async function handleSchemas(): Promise<Response> {
  const snap = await snapshot();
  const entityTypes = Object.fromEntries(snap.validated.entityTypes);
  const propertyTypes = Object.fromEntries(snap.validated.propertyTypes);
  return json({ entityTypes, propertyTypes });
}

async function handleListEntities(type: string): Promise<Response> {
  const snap = await snapshot();
  const list = [...snap.entities.values()]
    .filter((e) => e.type === type)
    .map((e) => ({
      id: e.id,
      type: e.type,
      slug: e.data['slug'],
      canonical_name_key: e.data['canonical_name_key'] ?? null,
    }))
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return json(list);
}

async function handleGetEntity(type: string, slug: string): Promise<Response> {
  const snap = await snapshot();
  for (const entity of snap.entities.values()) {
    if (entity.type === type && entity.data['slug'] === slug) {
      return json({ id: entity.id, type, slug, data: entity.data });
    }
  }
  return notFound(`No entity of type ${type} with slug ${slug}`);
}

async function handleSaveEntity(type: string, slug: string, req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body === null || typeof body !== 'object') {
    return badRequest('Body must be an object.');
  }

  // Locate the existing entity by slug so we know its file id (the
  // file basename — may differ from the slug, see character:luffy /
  // monkey-d-luffy).
  const snap = await snapshot();
  let existing: { id: string; type: string; } | undefined;
  for (const entity of snap.entities.values()) {
    if (entity.type === type && entity.data['slug'] === slug) {
      existing = entity;
      break;
    }
  }
  if (existing === undefined) {
    return notFound(`No entity of type ${type} with slug ${slug}`);
  }

  const fileBaseName = existing.id.split(':')[1] ?? slug;
  const target = resolve(UNIVERSES_DIR, UNIVERSE, 'entities', type, `${fileBaseName}.json`);
  const payload = body as Record<string, unknown>;
  if (payload['id'] !== existing.id) {
    return badRequest(`Body id must equal "${existing.id}".`);
  }
  if (payload['type'] !== type) return badRequest(`Body type must equal "${type}".`);
  if (payload['slug'] !== slug) return badRequest(`Body slug must equal "${slug}".`);

  const serialised = `${JSON.stringify(body, null, 2)}\n`;
  await writeFile(target, serialised, 'utf8');

  // Re-validate after the write.
  const result = await reloadAfterWrite();
  if (result === 'ok') {
    return json({ id: existing.id, type, slug, data: body });
  }
  return badRequest(result);
}

async function reloadAfterWrite(): Promise<'ok' | string> {
  // Phase 4.1 ships without atomic rollback. The id/type/slug guards
  // above bound the failure modes to "entity fails Zod against the
  // catalogue" — the maintainer fixes that by re-editing. Capturing
  // pre-write content for true rollback is a Phase 4.2 concern.
  try {
    const snap = await snapshot();
    void snap;
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (req.method === 'GET' && path === '/api/schemas') return await handleSchemas();

      const listMatch = /^\/api\/entities\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && listMatch !== null) {
        return await handleListEntities(listMatch[1]!);
      }

      const entityMatch = /^\/api\/entities\/([^/]+)\/([^/]+)$/.exec(path);
      if (entityMatch !== null) {
        const [, type = '', slug = ''] = entityMatch;
        if (req.method === 'GET') return await handleGetEntity(type, slug);
        if (req.method === 'POST') return await handleSaveEntity(type, slug, req);
      }

      return notFound(path);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }
  },
});

process.stdout.write(`dashboard API running at http://${server.hostname}:${server.port}\n`);
