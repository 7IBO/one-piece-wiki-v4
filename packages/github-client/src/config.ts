/**
 * Reads the GitHub App config from environment variables. Throws a
 * loud error at startup if any required variable is missing — better
 * to fail fast than to surface a confusing 401 from GitHub later.
 *
 * The maintainer fills these in apps/dashboard/.env.local; see
 * apps/dashboard/.env.example.
 */
import { readFileSync } from 'node:fs';

export type GitHubAppConfig = {
  readonly appId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly privateKey: string;
  readonly webhookSecret: string | undefined;
  readonly adminUsernames: readonly string[];
  readonly dataRepo: { owner: string; repo: string; };
};

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '' || value === 'REPLACE_ME') {
    throw new Error(
      `Missing required env var ${name}. Set it in apps/dashboard/.env.local — see apps/dashboard/.env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '' || value === 'REPLACE_ME') return undefined;
  return value;
}

function readPrivateKey(): string {
  const inlineKey = optional('GITHUB_APP_PRIVATE_KEY');
  if (inlineKey !== undefined) return inlineKey.replace(/\\n/g, '\n');
  const path = required('GITHUB_APP_PRIVATE_KEY_PATH');
  return readFileSync(path, 'utf8');
}

export function loadConfig(): GitHubAppConfig {
  const dataRepoRaw = required('DATA_REPO');
  const [owner, repo] = dataRepoRaw.split('/');
  if (owner === undefined || owner === '' || repo === undefined || repo === '') {
    throw new Error(`DATA_REPO must be in "owner/repo" form (got "${dataRepoRaw}").`);
  }

  return {
    appId: required('GITHUB_APP_ID'),
    clientId: required('GITHUB_APP_CLIENT_ID'),
    clientSecret: required('GITHUB_APP_CLIENT_SECRET'),
    privateKey: readPrivateKey(),
    webhookSecret: optional('GITHUB_APP_WEBHOOK_SECRET'),
    adminUsernames: (optional('ADMIN_GITHUB_USERNAMES') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    dataRepo: { owner, repo },
  };
}
