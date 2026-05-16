/**
 * Phase 4.2 dashboard API.
 *
 * Read endpoints (no auth):
 *   GET  /api/schemas
 *   GET  /api/sources
 *   GET  /api/i18n-keys
 *   GET  /api/entities/:type
 *   GET  /api/entities/:type/:slug         { data, sha }
 *
 * Auth (ADR-017 — stateless signed-cookie sessions):
 *   GET  /api/auth/login/github             302 to GitHub OAuth
 *   GET  /api/auth/callback/github          exchange + set cookie
 *   POST /api/auth/anonymous {nickname}     validate + set cookie
 *   POST /api/auth/sign-out                 clear cookie
 *   GET  /api/auth/me                       { kind, login|nickname, displayName } or 401
 *
 * Write endpoints (require a session — anonymous or GitHub):
 *   POST /api/uploads/presign               mint R2 PUT URL
 *   POST /api/entities/:type/:slug          opens a PR with the edit
 *
 * Admin endpoints (require GitHub session in ADMIN_GITHUB_USERNAMES):
 *   POST /api/admin/promote {prNumber}
 *   POST /api/admin/reject  {prNumber}
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
  listOpenContributions,
  loadConfig,
  type OpenContribution,
  OptimisticLockError,
  submitEntityEdit,
} from '@onepiece-wiki/github-client';
import {
  buildEntitySchema,
  loadEntities,
  loadSchemas,
  validateCatalogue,
} from '@onepiece-wiki/schema-engine';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promoteAndMergePR, rejectAndCleanupPR } from './admin-promote.ts';
import { type DashboardSession, readDashboardSession } from './auth.ts';
import { ALLOWED_IMAGE_TYPES, presignRead, presignUpload, r2Config } from './r2.ts';
import { buildCookie, clearCookie, newAnonymousSession, newGithubSession } from './session.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const UNIVERSE = 'one-piece';
const PORT = Number(process.env['DASHBOARD_API_PORT'] ?? '4101');
const PUBLIC_BASE_URL = process.env['DASHBOARD_PUBLIC_URL'] ?? 'http://localhost:4100';
const OAUTH_CALLBACK_URL = `${PUBLIC_BASE_URL}/api/auth/callback/github`;

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

// Set once when we detect the GitHub App is not installed on the data
// repo (a normal early-stage state). After that, getFile/openPR calls
// short-circuit and the API stops spamming the console with 404s on
// every entity load.
let githubInstallMissing = false;

function looksLikeMissingInstallation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  if (!m.includes('Not Found') && !m.includes('404')) return false;
  // The App-installation lookup hits one of several Octokit endpoints
  // whose error message mentions `installation` somewhere — either in
  // the request path (/repos/.../installation) or the docs link
  // (#get-a-repository-installation-for-the-authenticated-app).
  return m.includes('installation');
}

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

/**
 * Pull the most recent value_key from an entity's most "name-like"
 * property. Tries `name` first, then `title_key` (used by chapters).
 * Works whether the property is historical (array) or not.
 */
function nameKeyFor(data: Record<string, unknown>): string | null {
  const props = data['properties'];
  if (props === null || typeof props !== 'object') return null;
  for (const candidate of ['name', 'title_key'] as const) {
    const raw = (props as Record<string, unknown>)[candidate];
    if (raw === null || raw === undefined) continue;
    const entries = Array.isArray(raw) ? raw : [raw];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry !== null && typeof entry === 'object') {
        const v = (entry as Record<string, unknown>)['value_key']
          ?? (entry as Record<string, unknown>)['value'];
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
  }
  return null;
}

const SOURCE_TYPE_IDS: ReadonlySet<string> = new Set([
  'manga-chapter',
  'anime-episode',
  'film',
  'sbs',
  'databook',
]);

/**
 * Synthetic display fallback when no `name`/`title_key` translation
 * exists. Source-type entities (chapters, episodes, films…) get
 * `null` here so the source picker can render `number — title`
 * cleanly (the type label lives outside the input). Non-source
 * entities fall back to a pretty-printed slug so the picker has
 * something readable.
 */
function syntheticDisplayName(
  entity: { id: string; type: string; data: Record<string, unknown>; },
): { en: string | null; fr: string | null; } {
  if (SOURCE_TYPE_IDS.has(entity.type)) {
    return { en: null, fr: null };
  }
  const slug = String(entity.data['slug'] ?? '');
  if (slug !== '') {
    const pretty = slug
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    return { en: pretty, fr: pretty };
  }
  return { en: null, fr: null };
}

/**
 * Pre-load every entity's en/fr display name. Loaded once per request
 * via snapshot(). Keyed by entity id. Falls back to `null` per locale
 * if the translation is missing — callers should default to slug.
 */
async function buildDisplayNames(
  snap: CatalogueSnapshot,
): Promise<Map<string, { en: string | null; fr: string | null; }>> {
  const map = new Map<string, { en: string | null; fr: string | null; }>();
  // Group by (type, fileBase) so we read each translations file once.
  const tasks: Promise<void>[] = [];
  for (const entity of snap.entities.values()) {
    const fileBase = entity.id.split(':')[1] ?? '';
    const key = nameKeyFor(entity.data);
    tasks.push((async () => {
      const fallback = syntheticDisplayName(entity);
      if (key === null) {
        map.set(entity.id, fallback);
        return;
      }
      const trs = await readTranslationsFor(entity.type, fileBase);
      map.set(entity.id, {
        en: trs.en[key] ?? fallback.en,
        fr: trs.fr[key] ?? fallback.fr,
      });
    })());
  }
  await Promise.all(tasks);
  return map;
}

async function handleSchemas(): Promise<Response> {
  const snap = await snapshot();
  return json({
    entityTypes: Object.fromEntries(snap.validated.entityTypes),
    propertyTypes: Object.fromEntries(snap.validated.propertyTypes),
    relationTypes: Object.fromEntries(snap.validated.relationTypes),
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
  const names = await buildDisplayNames(snap);
  const sources = [...snap.entities.values()]
    .filter((e) => SOURCE_TYPES.has(e.type))
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
}

/**
 * Bulk-edit "table" view payload. Returns every entity of the given
 * type with its full `data` and per-locale translations bundled in.
 * Deliberately skips per-entity GitHub SHA lookups — fetching one
 * blob per entity would scale poorly for a 1000-row table and is
 * unnecessary in practice: the save endpoint accepts `sha: null` and
 * the table view trades optimistic-locking for bulk speed (the
 * single-entity editor still uses SHA-locked saves).
 */
async function handleTableEntities(type: string): Promise<Response> {
  const snap = await snapshot();
  const ofType = [...snap.entities.values()].filter((e) => e.type === type);
  // Read each entity's translations in parallel — they're disk reads
  // from the local checkout, not network calls.
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
}

async function handleGetEntity(type: string, slug: string): Promise<Response> {
  const snap = await snapshot();
  const entity = await findEntity(snap, type, slug);
  if (entity === undefined) return notFound(`No entity of type ${type} with slug ${slug}`);

  const fileBase = entity.id.split(':')[1] ?? slug;

  let sha: string | null = null;
  if (config !== null && !githubInstallMissing) {
    try {
      const octokit = await installationClient(config);
      const file = await getFile(octokit, config, dataPath(type, fileBase));
      sha = file?.sha ?? null;
    } catch (err) {
      if (looksLikeMissingInstallation(err)) {
        githubInstallMissing = true;
        process.stderr.write(
          `[dashboard API] GitHub App not installed on ${config.dataRepo.owner}/${config.dataRepo.repo}.\n`
            + `  → Install it from https://github.com/settings/apps to enable SHA tracking and the save flow.\n`
            + `  Read endpoints continue to work; this warning is shown once.\n`,
        );
      } else {
        process.stderr.write(
          `[dashboard API] getFile failed for ${entity.id}: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }
    }
  }

  const translations = await readTranslationsFor(type, fileBase);

  return json({ id: entity.id, type, slug, data: entity.data, sha, translations });
}

/**
 * Validate + normalize a self-chosen anonymous nickname. Returns
 * the trimmed value if acceptable, null if absent / empty, or a
 * string error message if the value violates the rules.
 *
 * Rules:
 *  - 1-32 chars after trim
 *  - Letters / digits / dash / underscore / dot / space only
 *    (deliberately no @ to avoid being mistaken for a GitHub handle)
 *  - No control chars, no HTML
 */
function normalizeNickname(raw: unknown): string | null | { error: string; } {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return { error: 'nickname must be a string' };
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 32) return { error: 'nickname too long (max 32 chars)' };
  if (!/^[\p{L}\p{N}._\- ]+$/u.test(trimmed)) {
    return { error: 'nickname may contain letters, digits, dash, underscore, dot, space only' };
  }
  return trimmed;
}

async function handleSaveEntity(
  cfg: GitHubAppConfig,
  session: DashboardSession,
  type: string,
  slug: string,
  req: Request,
): Promise<Response> {
  // BLOCKED_GITHUB_USERNAMES kill-switch. The OAuth callback also
  // rejects blocked logins at session issuance, but checking again
  // here defends against a blocked login that managed to grab a
  // cookie before being added to the list — they keep the cookie
  // but every write fails.
  if (session.kind === 'github' && isBlockedLogin(session.login)) {
    return new Response(JSON.stringify({ error: `User @${session.login} is blocked.` }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

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
  // Nickname now lives on the session (anonymous sign-in set it once);
  // we no longer read it from the request body. Validate the stored
  // value defensively in case a future bug lets an invalid value
  // reach the DB.
  let anonymousNickname: string | null = null;
  if (session.kind === 'anonymous') {
    const checked = normalizeNickname(session.nickname);
    if (checked !== null && typeof checked === 'object') return badRequest(checked.error);
    anonymousNickname = checked;
  }

  const snap = await snapshot();
  const entity = await findEntity(snap, type, slug);
  if (entity === undefined) return notFound(`No entity of type ${type} with slug ${slug}`);

  if (payload.data['id'] !== entity.id) {
    return badRequest(`data.id must equal "${entity.id}".`);
  }
  if (payload.data['type'] !== type) return badRequest(`data.type must equal "${type}".`);
  if (payload.data['slug'] !== slug) return badRequest(`data.slug must equal "${slug}".`);

  // Server-side schema validation — same Zod validator the CLI uses
  // in `bun run validate`. An edit that passes here is guaranteed to
  // pass CI once the PR opens. Without this check the API would
  // happily open a PR for malformed data (wrong value type, missing
  // required property, unknown property id, …) and the contributor
  // would only see the failure as a red X on the PR minutes later.
  const entitySchema = buildEntitySchema(type, snap.validated);
  if (entitySchema === undefined) {
    return badRequest(`No schema registered for entity type "${type}".`);
  }
  const validation = entitySchema.safeParse(payload.data);
  if (!validation.success) {
    // Return structured issues so the dashboard can highlight the
    // exact field(s) in red instead of dumping a sentence at the
    // top of the form. Each issue: { path: ['properties','bounty',0,'value'],
    // message: 'Expected number, received string' }.
    const issues = validation.error.errors.map((issue) => ({
      path: issue.path.map((p) => String(p)),
      message: issue.message,
    }));
    const summary = issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return json(
      {
        error: `Entity validation failed: ${summary}`,
        code: 'validation_failed',
        issues,
      },
      400,
    );
  }

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

  // The dashboard bot is always the sole commit author. The
  // contributor (GitHub login OR anonymous nickname) is surfaced
  // only in the PR body's "Contributors" section — no
  // `Co-authored-by` trailer (revised per ADR-016). Anonymous
  // nicknames are bold plain text with NO `@` so they can never be
  // mistaken for a GitHub handle.
  const octokit = await installationClient(cfg);
  try {
    const pr = await submitEntityEdit(octokit, cfg, {
      entityId: entity.id,
      path,
      newContent,
      expectedSha: payload.sha ?? null,
      contributorLogin: session.kind === 'github' ? session.login : null,
      contributorId: session.kind === 'github' ? session.userId : null,
      ...(anonymousNickname !== null ? { anonymousNickname } : {}),
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

/**
 * JSON projection the frontend reads at `/api/auth/me`. Stable shape
 * decoupled from the cookie's internal layout so we can change the
 * cookie format without breaking clients.
 */
function projectMe(session: DashboardSession): {
  kind: 'github' | 'anonymous';
  login?: string;
  nickname?: string;
  displayName: string;
} {
  if (session.kind === 'github') {
    return {
      kind: 'github',
      login: session.login,
      displayName: session.login,
    };
  }
  return {
    kind: 'anonymous',
    nickname: session.nickname,
    displayName: session.nickname,
  };
}

/**
 * OAuth `state` pool. We mint a random string per `/api/auth/login/github`
 * call, hand it to GitHub as the `state` parameter, then check the
 * callback returns the same value. Stops CSRF where an attacker tries
 * to trick a victim into completing GitHub's auth on the attacker's
 * behalf. Entries auto-expire after 5 minutes so the set doesn't grow.
 */
const oauthStates = new Set<string>();

function mintOAuthState(): string {
  const state = randomBytes(16).toString('hex');
  oauthStates.add(state);
  setTimeout(() => oauthStates.delete(state), 5 * 60 * 1000);
  return state;
}

function consumeOAuthState(state: string | null): boolean {
  if (state === null) return false;
  return oauthStates.delete(state);
}

/**
 * Comma-separated env var → Set<string>. Used by both
 * BLOCKED_GITHUB_USERNAMES and BLOCKED_IPS. Trims + lowercases
 * entries so casing / whitespace mistakes in the env don't
 * silently weaken the blocklist.
 */
function parseBlocklistEnv(name: string): ReadonlySet<string> {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== ''));
}

const blockedLogins = parseBlocklistEnv('BLOCKED_GITHUB_USERNAMES');
const blockedIps = parseBlocklistEnv('BLOCKED_IPS');

function isBlockedLogin(login: string): boolean {
  return blockedLogins.has(login.trim().toLowerCase());
}

function isBlockedIp(ip: string): boolean {
  return blockedIps.has(ip.trim().toLowerCase());
}

/**
 * Best-effort client IP. Prefer the first hop of X-Forwarded-For
 * (set by reverse proxies / Vercel) since the connecting socket
 * is the proxy itself in deployed environments. Fall back to the
 * raw connection address when no header is present (local dev).
 */
function clientIp(req: Request, fallback: string): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff !== null) {
    const first = xff.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return fallback;
}

/**
 * Cheap in-memory token bucket. One counter per (bucket, key),
 * windowed by the hour. Resets on server restart — acceptable for
 * Phase 7.2 (single-instance dev/early-prod); upgrade to a shared
 * store (KV / Redis) when the dashboard scales horizontally.
 */
type RateBucket = { hourStartMs: number; count: number; };
const rateState = new Map<string, RateBucket>();

function rateLimitHit(bucket: string, key: string, limitPerHour: number): boolean {
  const composite = `${bucket}:${key}`;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const current = rateState.get(composite);
  if (current === undefined || now - current.hourStartMs >= hourMs) {
    rateState.set(composite, { hourStartMs: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > limitPerHour;
}

const ANON_WRITE_LIMIT = Number(process.env['ANON_WRITE_LIMIT_PER_HOUR'] ?? '10');
const ANON_UPLOAD_LIMIT = Number(process.env['ANON_UPLOAD_LIMIT_PER_HOUR'] ?? '20');

function handleAuthMe(session: DashboardSession | null): Response {
  if (session === null) return unauthorized('Not signed in.');
  return json(projectMe(session));
}

/**
 * `GET /api/auth/login/github` — 302 to GitHub's authorize URL with
 * an anti-CSRF state. The browser comes back to
 * `/api/auth/callback/github` after the user approves.
 */
function handleGithubLogin(cfg: GitHubAppConfig): Response {
  const state = mintOAuthState();
  const url = authorizeUrl(cfg, OAUTH_CALLBACK_URL, state);
  return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * `GET /api/auth/callback/github?code&state` — finishes the OAuth
 * dance: validates `state`, exchanges the code for the user's login +
 * numeric id, rejects blocked logins, mints a `github`-kind session
 * cookie, then 302s back to the home page.
 */
async function handleGithubCallback(cfg: GitHubAppConfig, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code === null || state === null) return badRequest('Missing code or state.');
  if (!consumeOAuthState(state)) return badRequest('Invalid OAuth state.');

  const user = await exchangeCode(cfg, code);
  if (isBlockedLogin(user.login)) {
    return new Response(`User @${user.login} is blocked.`, {
      status: 403,
      headers: { 'content-type': 'text/plain' },
    });
  }
  const session = newGithubSession(user.login, user.id);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${PUBLIC_BASE_URL}/`,
      'set-cookie': buildCookie(session),
    },
  });
}

/**
 * `POST /api/auth/anonymous {nickname}` — validate the self-chosen
 * pseudo (1-32 chars, restricted alphabet — see `normalizeNickname`),
 * mint an `anonymous`-kind session cookie, return the projection the
 * frontend reads from `/api/auth/me`.
 */
async function handleAnonymousSignIn(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body === null || typeof body !== 'object') {
    return badRequest('Body must be { nickname }.');
  }
  const raw = (body as { nickname?: unknown; }).nickname;
  const nick = normalizeNickname(raw);
  if (nick === null) return badRequest('nickname is required.');
  if (typeof nick === 'object') return badRequest(nick.error);
  const session = newAnonymousSession(nick);
  return new Response(JSON.stringify(projectMe(session)), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': buildCookie(session),
    },
  });
}

function handleSignOut(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearCookie() },
  });
}

/**
 * List the current session's open contributions (PRs labelled
 * `via-dashboard` whose body mentions the contributor). Used by the
 * "Vos contributions en cours" home section so a returning user
 * sees their in-flight edits without re-typing anything — the
 * identity is on the cookie. Returns `[]` for read-only visitors
 * rather than 401 so the home page renders cleanly even when no
 * session is present.
 */
async function handleMyContributions(
  cfg: GitHubAppConfig,
  session: DashboardSession | null,
): Promise<Response> {
  if (session === null) return json({ contributions: [] as OpenContribution[] });
  // Anonymous users with no nickname (signed in but skipped the input
  // — possible if a future flow short-circuits) get nothing back; the
  // body match would be ambiguous.
  if (session.kind === 'anonymous' && session.nickname === '') {
    return json({ contributions: [] as OpenContribution[] });
  }
  try {
    const octokit = await installationClient(cfg);
    const list = await listOpenContributions(
      octokit,
      cfg,
      session.kind === 'github'
        ? { kind: 'github', login: session.login }
        : { kind: 'anonymous', nickname: session.nickname },
    );
    return json({ contributions: list });
  } catch (err) {
    // Treat a failed search as "no results" rather than 500 — the
    // home page should keep rendering even when GitHub is grumpy.
    process.stderr.write(
      `[contributions] search failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return json({ contributions: [] as OpenContribution[] });
  }
}

/**
 * Mint a presigned PUT URL on R2 for the browser to upload an image
 * directly. Auth-gated to admins so randoms can't burn through the
 * bucket quota. Returns { uploadUrl, stagingUrl, key, expiresIn,
 * maxBytes }. The `stagingUrl` is the `staging://<key>` placeholder
 * the dashboard stores on the entity JSON until the merge workflow
 * rewrites it to the canonical public URL (see ADR-015 / Phase 7.1).
 */
async function handlePresignUpload(req: Request): Promise<Response> {
  const cfg = r2Config();
  if (cfg === null) {
    return serviceUnavailable(
      'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.',
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body === null || typeof body !== 'object') {
    return badRequest('Body must be { filename, contentType, sizeBytes }.');
  }
  const { filename, contentType, sizeBytes } = body as {
    filename?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
  };
  if (typeof filename !== 'string' || filename === '') {
    return badRequest('filename must be a non-empty string.');
  }
  if (typeof contentType !== 'string' || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    return badRequest(
      `contentType must be one of: ${[...ALLOWED_IMAGE_TYPES].join(', ')}.`,
    );
  }
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return badRequest('sizeBytes must be a positive integer.');
  }
  try {
    const result = await presignUpload(cfg, { filename, contentType, sizeBytes });
    return json(result);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Resolve a `staging://<key>` placeholder to a short-lived signed
 * GET URL on R2 and 302 to it. The dashboard's `<img src>` hits
 * this route for staged images so:
 *   - the signed URL never lands in HTML markup or referrer
 *     headers (it lives only in the redirect Location header)
 *   - the URL expires after 60s so a leaked preview link goes
 *     stale almost immediately
 *
 * Auth: any authenticated user. The staged bytes are nominally
 * private; without a session the route returns 401 so the public
 * web cannot enumerate `pending/` keys.
 */
async function handlePreviewImage(
  session: DashboardSession | null,
  key: string,
): Promise<Response> {
  if (session === null) return unauthorized('Sign in to preview staged images.');
  const cfg = r2Config();
  if (cfg === null) {
    return serviceUnavailable(
      'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.',
    );
  }
  if (key === '' || key.includes('..')) return badRequest('Invalid key.');
  try {
    const signed = await presignRead(cfg, key, 60);
    return new Response(null, { status: 302, headers: { location: signed } });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Admin-only: approve a PR carrying staged images. Promotes the
 * staged R2 objects, rewrites `staging://` URLs on the PR head
 * branch, and squash-merges. See `admin-promote.ts` for the
 * detailed flow.
 *
 * Body: `{ prNumber: number }`.
 */
async function handleAdminPromote(
  cfg: GitHubAppConfig,
  session: DashboardSession,
  req: Request,
): Promise<Response> {
  if (session.kind !== 'github' || !isAdmin(cfg, session.login)) {
    return new Response(JSON.stringify({ error: 'Admin only.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  const r2 = r2Config();
  if (r2 === null) {
    return serviceUnavailable(
      'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.',
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const prNumber = (body as { prNumber?: unknown; }).prNumber;
  if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
    return badRequest('prNumber must be a positive integer.');
  }
  try {
    const octokit = await installationClient(cfg);
    const outcome = await promoteAndMergePR({
      octokit,
      cfg,
      r2,
      prNumber,
      approverLogin: session.login,
    });
    return json(outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[admin-promote] PR #${prNumber} failed: ${message}\n`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/**
 * Admin-only: reject a PR (close without merging) + delete the
 * staged R2 objects it introduced. Body: `{ prNumber: number }`.
 */
async function handleAdminReject(
  cfg: GitHubAppConfig,
  session: DashboardSession,
  req: Request,
): Promise<Response> {
  if (session.kind !== 'github' || !isAdmin(cfg, session.login)) {
    return new Response(JSON.stringify({ error: 'Admin only.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  const r2 = r2Config();
  if (r2 === null) {
    return serviceUnavailable(
      'R2 not configured. Set R2_* vars in apps/dashboard/.env.local.',
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return badRequest(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const prNumber = (body as { prNumber?: unknown; }).prNumber;
  if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
    return badRequest('prNumber must be a positive integer.');
  }
  try {
    const octokit = await installationClient(cfg);
    const outcome = await rejectAndCleanupPR({ octokit, cfg, r2, prNumber });
    return json(outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[admin-reject] PR #${prNumber} failed: ${message}\n`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const session = readDashboardSession(req);

    // Connecting-socket fallback for the rare local case where
    // X-Forwarded-For isn't set. In deployed env the reverse
    // proxy always supplies XFF, so this is just a safety net.
    const socketIp = server.requestIP(req)?.address ?? '0.0.0.0';
    const ip = clientIp(req, socketIp);

    // Anonymous abuse kill-switch — global, before any routing.
    // Reading a blocked IP's GET is still allowed (read endpoints
    // are public anyway); only write paths are gated below via
    // the rate limiter + the explicit isBlockedIp() guard.
    if (isBlockedIp(ip)) {
      // Don't reveal anything about the block — return a generic
      // 403 to make scraping the blocklist boring.
      if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Forbidden.' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    /**
     * Stable rate-limit bucket key. GitHub identity is the login
     * (immutable across sign-outs); anonymous identity is the
     * self-chosen nickname (changeable, but a contributor reusing
     * the same nickname keeps the same bucket — which is the right
     * UX for someone with a stable pseudo). Falls back to IP when
     * no session at all (read-only traffic that shouldn't hit
     * write paths anyway).
     */
    function rateLimitKey(): string {
      if (session === null) return `ip:${ip}`;
      if (session.kind === 'github') return `gh:${session.login.toLowerCase()}`;
      return `anon:${session.nickname.toLowerCase()}`;
    }

    function isAdminSession(): boolean {
      return session !== null
        && session.kind === 'github'
        && config !== null
        && isAdmin(config, session.login);
    }

    try {
      // ── Auth (stateless signed cookies — ADR-017) ──
      if (req.method === 'GET' && path === '/api/auth/login/github') {
        if (config === null) return serviceUnavailable(`Auth disabled: ${configError}`);
        return handleGithubLogin(config);
      }
      if (req.method === 'GET' && path === '/api/auth/callback/github') {
        if (config === null) return serviceUnavailable(`Auth disabled: ${configError}`);
        return await handleGithubCallback(config, url);
      }
      if (req.method === 'POST' && path === '/api/auth/anonymous') {
        return await handleAnonymousSignIn(req);
      }
      if (req.method === 'POST' && path === '/api/auth/sign-out') {
        return handleSignOut();
      }
      if (req.method === 'GET' && path === '/api/auth/me') return handleAuthMe(session);

      if (req.method === 'GET' && path === '/api/me/contributions') {
        if (config === null) return json({ contributions: [] });
        return await handleMyContributions(config, session);
      }

      if (req.method === 'POST' && path === '/api/uploads/presign') {
        // Anonymous + contributor + admin all may upload (to staging).
        // Admin gets no rate-limit; everyone else is bucketed.
        if (!isAdminSession()) {
          if (rateLimitHit('upload', rateLimitKey(), ANON_UPLOAD_LIMIT)) {
            return new Response(
              JSON.stringify({
                error: `Rate limit reached (${ANON_UPLOAD_LIMIT}/hour). Try again later.`,
              }),
              { status: 429, headers: { 'content-type': 'application/json' } },
            );
          }
        }
        return await handlePresignUpload(req);
      }

      // GET /api/preview/<key>... — signed redirect for staged R2
      // objects. The key may contain slashes (e.g. pending/foo.png)
      // so we slice off the route prefix manually rather than using
      // a one-segment regex.
      if (req.method === 'GET' && path.startsWith('/api/preview/')) {
        const key = decodeURIComponent(path.slice('/api/preview/'.length));
        return await handlePreviewImage(session, key);
      }

      // POST /api/admin/promote — approve a PR carrying staged
      // images (promote bytes pending/→images/, rewrite URLs,
      // squash-merge). Admin-only.
      if (req.method === 'POST' && path === '/api/admin/promote') {
        if (config === null) return serviceUnavailable(`Disabled: ${configError}`);
        if (session === null) return unauthorized('Sign in first.');
        return await handleAdminPromote(config, session, req);
      }

      // POST /api/admin/reject — close PR + delete staged objects.
      if (req.method === 'POST' && path === '/api/admin/reject') {
        if (config === null) return serviceUnavailable(`Disabled: ${configError}`);
        if (session === null) return unauthorized('Sign in first.');
        return await handleAdminReject(config, session, req);
      }

      if (req.method === 'GET' && path === '/api/schemas') return await handleSchemas();
      if (req.method === 'GET' && path === '/api/sources') return await handleSources();
      if (req.method === 'GET' && path === '/api/i18n-keys') return await handleI18nKeys();
      const listMatch = /^\/api\/entities\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && listMatch !== null) {
        return await handleListEntities(listMatch[1]!);
      }

      // Match BEFORE the per-entity regex so `/api/entities/foo/table`
      // doesn't end up looking up a `foo` entity with slug "table".
      const tableMatch = /^\/api\/entities\/([^/]+)\/table$/.exec(path);
      if (req.method === 'GET' && tableMatch !== null) {
        return await handleTableEntities(tableMatch[1]!);
      }

      const entityMatch = /^\/api\/entities\/([^/]+)\/([^/]+)$/.exec(path);
      if (entityMatch !== null) {
        const [, type = '', slug = ''] = entityMatch;
        if (req.method === 'GET') return await handleGetEntity(type, slug);
        if (req.method === 'POST') {
          if (config === null) return serviceUnavailable(`Save disabled: ${configError}`);
          // A session is required to save — even the anonymous flow
          // creates a session at /login. This simplifies attribution
          // (the contributor identity is always on the session) and
          // closes a fingerprinting hole (no more nicknames smuggled
          // in the request body).
          if (session === null) {
            return unauthorized('Sign in (anonymous or GitHub) before saving.');
          }
          if (!isAdminSession()) {
            if (rateLimitHit('save', rateLimitKey(), ANON_WRITE_LIMIT)) {
              return new Response(
                JSON.stringify({
                  error: `Rate limit reached (${ANON_WRITE_LIMIT}/hour). Try again later.`,
                }),
                { status: 429, headers: { 'content-type': 'application/json' } },
              );
            }
          }
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
