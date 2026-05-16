/**
 * GitHub App user-to-server OAuth helpers.
 *
 * Flow:
 *   1. Dashboard redirects user to authorizeUrl(...).
 *   2. GitHub redirects back to the dashboard's callback with a code.
 *   3. exchangeCode(code) returns the user's login + numeric id.
 *   4. Dashboard issues a signed-cookie session (see
 *      apps/dashboard/api/session.ts) carrying that identity.
 *
 * The access token is fetched once during the exchange — we use it
 * to call `/user` to read the login + id — and then DROPPED. The
 * dashboard never re-uses the user token for write operations
 * (writes go through the GitHub App's installation token instead),
 * so persisting the user token would be a liability without a
 * benefit.
 */
import { createOAuthUserAuth } from '@octokit/auth-oauth-user';
import { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './config.ts';

export type OAuthUser = {
  readonly login: string;
  readonly id: number;
};

export function authorizeUrl(config: GitHubAppConfig, callbackUrl: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  config: GitHubAppConfig,
  code: string,
): Promise<OAuthUser> {
  const auth = createOAuthUserAuth({
    clientType: 'github-app',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
  });
  const result = await auth();
  if (result.type !== 'token') {
    throw new Error(`OAuth exchange returned unexpected type "${result.type}".`);
  }
  const userOctokit = new Octokit({ auth: result.token });
  const { data: user } = await userOctokit.users.getAuthenticated();
  return { login: user.login, id: user.id };
}

export function isAdmin(config: GitHubAppConfig, login: string): boolean {
  return config.adminUsernames.some((u) => u.toLowerCase() === login.toLowerCase());
}
