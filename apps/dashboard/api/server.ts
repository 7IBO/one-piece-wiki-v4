/**
 * Phase 4.2 dashboard API.
 *
 * Read endpoints (no auth):
 *   GET  /api/schemas
 *   GET  /api/entities/:type
 *   GET  /api/entities/:type/:slug         { data, sha }
 *
 * Auth:
 *   GET  /api/auth/login                    redirect to GitHub OAuth
 *   GET  /api/auth/callback?code=&state=    exchange + set cookie
 *   GET  /api/auth/me                       { login } or 401
 *   POST /api/auth/logout
 *
 * Write endpoints (require admin session):
 *   POST /api/entities/:type/:slug          opens a PR with the edit
 *
 * Listens on 127.0.0.1:4101. Vite proxies /api/*.
 */
import {
  authorizeUrl,
  exchangeCode,
  getFile,
  type GitHubAppConfig,
  installationClient,
  isAdmin,
  loadConfig,
  OptimisticLockError,
  submitEntityEdit,
} from '@onepiece-wiki/github-client';
import { loadEntities, loadSchemas, validateCatalogue } from '@onepiece-wiki/schema-engine';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import {
  buildCookie,
  clearCookie,
  newSession,
  parse,
  readCookie,
  type Session,
} from './session.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const UNIVERSE = 'one-piece';
const PORT = Number(process.env['DASHBOARD_API_PORT'] ?? '4101');
const PUBLIC_BASE_URL = process.env['DASHBOARD_PUBLIC_URL'] ?? 'http://localhost:4100';
const CALLBACK_URL = `${PUBLIC_BASE_URL}/api/auth/callback`;

let config: GitHubAppConfig | null = null;
let configError: string | null = null;
try {
  config = loadConfig();
} catch (err) {
  configError = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n[dashboard API] GitHub App config not loaded:\n  ${configError}\n`);
  process.stderr.write(
    `[dashboard API] Read endpoints will work; auth + save will return 503.\n\n`,
  );
}

const oauthStates = new Set<string>();

type CatalogueSnapshot = Awaited<ReturnType<typeof snapshot>>;

async function snapshot() {
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

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

function notFound(message: string): Response {
  return json({ error: message }, 404);
}
function badRequest(message: string): Response {
  return json({ error: message }, 400);
}
function unauthorized(message: string): Response {
  return json({ error: message }, 401);
}
function serviceUnavailable(message: string): Response {
  return json({ error: message }, 503);
}
function conflict(message: string, currentSha: string): Response {
  return json({ error: message, currentSha }, 409);
}

function dataPath(type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/entities/${type}/${fileBase}.json`;
}

async function findEntity(snap: CatalogueSnapshot, type: string, slug: string) {
  for (const entity of snap.entities.values()) {
    if (entity.type === type && entity.data['slug'] === slug) return entity;
  }
  return undefined;
}

async function handleSchemas(): Promise<Response> {
  const snap = await snapshot();
  return json({
    entityTypes: Object.fromEntries(snap.validated.entityTypes),
    propertyTypes: Object.fromEntries(snap.validated.propertyTypes),
  });
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
  const entity = await findEntity(snap, type, slug);
  if (entity === undefined) return notFound(`No entity of type ${type} with slug ${slug}`);

  let sha: string | null = null;
  if (config !== null) {
    try {
      const octokit = await installationClient(config);
      const fileBase = entity.id.split(':')[1] ?? slug;
      const file = await getFile(octokit, config, dataPath(type, fileBase));
      sha = file?.sha ?? null;
    } catch (err) {
      process.stderr.write(
        `getFile failed for ${entity.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  return json({ id: entity.id, type, slug, data: entity.data, sha });
}

async function handleSaveEntity(
  cfg: GitHubAppConfig,
  session: Session,
  type: string,
  slug: string,
  req: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body === null || typeof body !== 'object') {
    return badRequest('Body must be an object with { data, sha }.');
  }
  const payload = body as { data?: Record<string, unknown>; sha?: string | null; };
  if (payload.data === undefined || typeof payload.data !== 'object' || payload.data === null) {
    return badRequest('Body.data must be the entity object.');
  }

  const snap = await snapshot();
  const entity = await findEntity(snap, type, slug);
  if (entity === undefined) return notFound(`No entity of type ${type} with slug ${slug}`);

  if (payload.data['id'] !== entity.id) {
    return badRequest(`data.id must equal "${entity.id}".`);
  }
  if (payload.data['type'] !== type) return badRequest(`data.type must equal "${type}".`);
  if (payload.data['slug'] !== slug) return badRequest(`data.slug must equal "${slug}".`);

  const fileBase = entity.id.split(':')[1] ?? slug;
  const path = dataPath(type, fileBase);
  const newContent = `${JSON.stringify(payload.data, null, 2)}\n`;

  const octokit = await installationClient(cfg);
  try {
    const pr = await submitEntityEdit(octokit, cfg, {
      entityId: entity.id,
      path,
      newContent,
      expectedSha: payload.sha ?? null,
      contributorLogin: session.login,
    });
    return json({ ok: true, pr });
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return conflict(err.message, err.currentSha);
    }
    throw err;
  }
}

function handleAuthLogin(cfg: GitHubAppConfig): Response {
  const state = randomBytes(16).toString('hex');
  oauthStates.add(state);
  setTimeout(() => oauthStates.delete(state), 5 * 60 * 1000);
  const url = authorizeUrl(cfg, CALLBACK_URL, state);
  return new Response(null, { status: 302, headers: { location: url } });
}

async function handleAuthCallback(cfg: GitHubAppConfig, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code === null || state === null) return badRequest('Missing code or state.');
  if (!oauthStates.delete(state)) return badRequest('Invalid OAuth state.');

  const user = await exchangeCode(cfg, code);
  if (!isAdmin(cfg, user.login)) {
    return new Response(`User @${user.login} is not in ADMIN_GITHUB_USERNAMES.`, {
      status: 403,
      headers: { 'content-type': 'text/plain' },
    });
  }

  const session = newSession(user.login, user.id, user.accessToken);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${PUBLIC_BASE_URL}/`,
      'set-cookie': buildCookie(session),
    },
  });
}

function handleAuthMe(session: Session | null): Response {
  if (session === null) return unauthorized('Not signed in.');
  return json({ login: session.login });
}

function handleAuthLogout(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearCookie() },
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const session = parse(readCookie(req));

    try {
      if (req.method === 'GET' && path === '/api/auth/login') {
        if (config === null) return serviceUnavailable(`Auth disabled: ${configError}`);
        return handleAuthLogin(config);
      }
      if (req.method === 'GET' && path === '/api/auth/callback') {
        if (config === null) return serviceUnavailable(`Auth disabled: ${configError}`);
        return await handleAuthCallback(config, url);
      }
      if (req.method === 'GET' && path === '/api/auth/me') return handleAuthMe(session);
      if (req.method === 'POST' && path === '/api/auth/logout') return handleAuthLogout();

      if (req.method === 'GET' && path === '/api/schemas') return await handleSchemas();
      const listMatch = /^\/api\/entities\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && listMatch !== null) {
        return await handleListEntities(listMatch[1]!);
      }

      const entityMatch = /^\/api\/entities\/([^/]+)\/([^/]+)$/.exec(path);
      if (entityMatch !== null) {
        const [, type = '', slug = ''] = entityMatch;
        if (req.method === 'GET') return await handleGetEntity(type, slug);
        if (req.method === 'POST') {
          if (config === null) return serviceUnavailable(`Save disabled: ${configError}`);
          if (session === null) return unauthorized('Sign in via /api/auth/login first.');
          return await handleSaveEntity(config, session, type, slug, req);
        }
      }

      return notFound(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`API error on ${req.method} ${path}: ${message}\n`);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
});

process.stdout.write(
  `dashboard API running at http://${server.hostname}:${server.port}\n`
    + (config !== null
      ? `  data repo: ${config.dataRepo.owner}/${config.dataRepo.repo}\n`
        + `  admins: ${config.adminUsernames.join(', ') || '(none)'}\n`
      : `  GitHub App config NOT loaded; auth + save endpoints return 503.\n`),
);

void REPO_ROOT;
