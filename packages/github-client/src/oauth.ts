/**
 * GitHub App user-to-server OAuth helpers.
 *
 * Flow:
 *   1. Dashboard redirects user to authorizeUrl(...).
 *   2. GitHub redirects back to the dashboard's callback with a code.
 *   3. exchangeCode(code) returns the user's access token.
 *   4. fetchAuthenticatedUser(token) returns the GitHub login + id, so
 *      the dashboard can check it against ADMIN_GITHUB_USERNAMES before
 *      issuing a session cookie.
 */
import { createOAuthUserAuth } from '@octokit/auth-oauth-user';
import { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './config.ts';

export type OAuthUser = {
  readonly login: string;
  readonly id: number;
  readonly accessToken: string;
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
  const accessToken = result.token;
  const userOctokit = new Octokit({ auth: accessToken });
  const { data: user } = await userOctokit.users.getAuthenticated();
  return { login: user.login, id: user.id, accessToken };
}

export function isAdmin(config: GitHubAppConfig, login: string): boolean {
  return config.adminUsernames.some((u) => u.toLowerCase() === login.toLowerCase());
}
