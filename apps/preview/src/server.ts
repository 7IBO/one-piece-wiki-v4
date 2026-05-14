/**
 * Phase 3 preview app — minimal Bun HTTP server.
 *
 * Routes:
 *   /                              redirect to /preview
 *   /preview                       index of every entity type
 *   /preview/:type                 listing of entities of that type
 *   /preview/:type/:slug           entity detail
 *
 * Query params:
 *   ?chapter=N                     user progression cursor (default 9999)
 *   ?locale=en|fr                  locale for resolved labels (default en)
 *
 * The SQLite artefact must exist at /dist/onepiece.db (run
 * `bun run build:data` first). The DB is opened once at startup.
 */
import type { Locale } from '@onepiece-wiki/schemas';
import { createClient, openDatabase } from '@onepiece-wiki/sdk';
import { resolve } from 'node:path';
import {
  renderEntity,
  renderIndex,
  renderNotFound,
  renderType,
  type ViewContext,
} from './views.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const DB_PATH = resolve(REPO_ROOT, 'dist', 'onepiece.db');

const PORT = Number(process.env['PORT'] ?? '4000');

const db = openDatabase(DB_PATH);
const client = createClient(db);

function parseCtx(url: URL): ViewContext {
  const chapterRaw = url.searchParams.get('chapter');
  const localeRaw = url.searchParams.get('locale');
  const chapter = chapterRaw === null ? 9999 : Math.max(0, Number.parseInt(chapterRaw, 10) || 0);
  const locale: Locale = localeRaw === 'fr' ? 'fr' : 'en';
  return { progression: { manga_chapter: chapter }, locale };
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const ctx = parseCtx(url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/') {
      return Response.redirect(`/preview${url.search}`, 302);
    }
    if (path === '/preview') {
      return html(renderIndex(client, ctx));
    }

    const match = /^\/preview\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (match !== null) {
      const [, type = '', slug] = match;
      if (slug === undefined) {
        const body = renderType(client, type, ctx);
        return body === null ? html(renderNotFound(ctx), 404) : html(body);
      }
      const entity = client.getEntityBySlug(type, slug);
      if (entity === null) return html(renderNotFound(ctx), 404);
      return html(renderEntity(client, entity, ctx));
    }

    return html(renderNotFound(ctx), 404);
  },
});

process.stdout.write(`preview running at http://localhost:${server.port}/preview\n`);
