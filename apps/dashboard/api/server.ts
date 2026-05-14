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
import { readFile } from 'node:fs/promises';
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

const LOCALES = ['en', 'fr'] as const;
type Locale = typeof LOCALES[number];

function translationsPath(locale: Locale, type: string, fileBase: string): string {
  return `data/universes/${UNIVERSE}/translations/${locale}/${type}/${fileBase}.json`;
}

async function readTranslationsFor(
  type: string,
  fileBase: string,
): Promise<Record<Locale, Record<string, string>>> {
  const out = { en: {}, fr: {} } as Record<Locale, Record<string, string>>;
  for (const locale of LOCALES) {
    const path = resolve(REPO_ROOT, translationsPath(locale, type, fileBase));
    try {
      const text = await readFile(path, 'utf8');
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out[locale] = parsed as Record<string, string>;
      }
    } catch {
      // missing file → empty translations for this locale; that's fine.
    }
  }
  return out;
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
    vocabularies: Object.fromEntries(snap.validated.vocabularies),
  });
}

const SOURCE_TYPES: ReadonlySet<string> = new Set([
  'manga-chapter',
  'anime-episode',
  'film',
  'sbs',
  'databook',
]);

function chapterNumber(entity: { id: string; data: Record<string, unknown>; }): number | null {
  const props = entity.data['properties'];
  if (props === null || typeof props !== 'object') return null;
  const num = (props as Record<string, unknown>)['number'];
  if (num !== null && typeof num === 'object' && num !== undefined) {
    const v = (num as Record<string, unknown>)['value'];
    if (typeof v === 'number') return v;
  }
  return null;
}

async function handleSources(): Promise<Response> {
  const snap = await snapshot();
  const sources = [...snap.entities.values()]
    .filter((e) => SOURCE_TYPES.has(e.type))
    .map((e) => ({
      id: e.id,
      type: e.type,
      slug: e.data['slug'],
      number: chapterNumber(e),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.number !== null && b.number !== null) return a.number - b.number;
      return String(a.slug).localeCompare(String(b.slug));
    });
  return json(sources);
}

function collectI18nKeysFrom(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (/^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/.test(value)) {
      out.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectI18nKeysFrom(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectI18nKeysFrom(v, out);
    }
  }
}

async function handleI18nKeys(): Promise<Response> {
  const snap = await snapshot();
  const seen = new Set<string>();
  for (const entity of snap.entities.values()) {
    collectI18nKeysFrom(entity.data, seen);
  }
  const keys = [...seen].sort();
  return json(keys);
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

  const fileBase = entity.id.split(':')[1] ?? slug;

  let sha: string | null = null;
  if (config !== null) {
    try {
      const octokit = await installationClient(config);
      const file = await getFile(octokit, config, dataPath(type, fileBase));
      sha = file?.sha ?? null;
    } catch (err) {
      process.stderr.write(
        `getFile failed for ${entity.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const translations = await readTranslationsFor(type, fileBase);

  return json({ id: entity.id, type, slug, data: entity.data, sha, translations });
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
  const payload = body as {
    data?: Record<string, unknown>;
    sha?: string | null;
    translations?: Partial<Record<Locale, Record<string, string>>>;
  };
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

  const extraFiles: { path: string; content: string; }[] = [];
  for (const locale of LOCALES) {
    const map = payload.translations?.[locale];
    if (map === undefined) continue;
    // Only write if the locale has at least one translation; otherwise
    // skip to avoid creating empty files in the PR.
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'string' && v.length > 0) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) continue;
    extraFiles.push({
      path: translationsPath(locale, type, fileBase),
      content: `${JSON.stringify(filtered, null, 2)}\n`,
    });
  }

  const octokit = await installationClient(cfg);
  try {
    const pr = await submitEntityEdit(octokit, cfg, {
      entityId: entity.id,
      path,
      newContent,
      expectedSha: payload.sha ?? null,
      contributorLogin: session.login,
      extraFiles,
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
      if (req.method === 'GET' && path === '/api/sources') return await handleSources();
      if (req.method === 'GET' && path === '/api/i18n-keys') return await handleI18nKeys();
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
