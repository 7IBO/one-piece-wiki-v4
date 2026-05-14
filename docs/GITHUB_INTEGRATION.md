# GitHub Integration

Every edit submitted via the dashboard becomes a Pull Request on the data
repository. This document defines how that integration works, what
permissions are required, and how conflicts are handled.

## GitHub App vs OAuth

Choice: **GitHub App**.

Rationale:

- Acts on behalf of the wiki, not on behalf of individual users
- Can carry attribution to the human contributor via the commit message
  without requiring per-user OAuth tokens
- Higher rate limits than OAuth (5000 → 15000 requests/hour)
- Permissions are scoped to the data repo, not the user's whole account
- Stable: if a contributor leaves, the App keeps working

## App setup

A single GitHub App is registered for the project. Permissions:

- **Contents**: Read & Write (commits, branches, files)
- **Pull Requests**: Read & Write (create, label, comment)
- **Metadata**: Read
- **Issues**: Read & Write (for related issue management)

The App is installed on the data repository. Its credentials are stored
as Vercel environment variables:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PKCS#8 RSA)
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_DATA_REPO` (e.g. `owner/onepiece-wiki-data`)

## Authentication of contributors

Phase 1: admin-only.

- User authenticates via GitHub OAuth (separate from the App)
- Server checks the user's GitHub username against `ADMIN_GITHUB_USERNAMES`
  env var
- If allowed, a JWT session cookie is issued

Phase 7: GitHub OAuth opens to any GitHub user, with moderation queue.

## Octokit client

Wrapped in `packages/github-client`. Public surface:

```ts
export interface GithubClient {
  getFile(path: string): Promise<{ content: string; sha: string }>;
  writeFile(branch: string, path: string, content: string, message: string): Promise<void>;
  createBranch(name: string, fromSha: string): Promise<void>;
  openPR(input: {
    title: string;
    body: string;
    head: string;
    base: string;
    labels?: string[];
  }): Promise<{ number: number; url: string }>;
  getDefaultBranchSha(): Promise<string>;
}
```

Implementation handles:

- App authentication (installation token, refreshed automatically)
- Retries with exponential backoff on rate limits
- Idempotency: if a branch with the same name exists, return it rather
  than fail

## Branch naming

Branches for edits coming from the dashboard:

```
edit/<entity-id-sanitized>/<nano-id-8>
```

Examples:
- `edit/character-luffy/k3F2aBx7`
- `edit/manga-chapter-1044/m9q2P1r4`

Sanitization: replace `:` and other special characters with `-`.

For schema-changing PRs:

```
schema/<scope>/<slug>
```

Examples:
- `schema/add-title-entity-type`
- `schema/character-add-haki-color`

## Commit messages

The single commit per submission carries:

```
<conventional-type>(<scope>): <subject>

<body explaining the change>

Authored-by: <github-username> via dashboard
Co-Authored-By: <name> <email>
```

Example:

```
data(onepiece): update character:luffy bounty after Wano

Add bounty entry of 3,000,000,000 berries as of chapter 1053,
issued after the defeat of Kaido.

Authored-by: shanks-fan99 via dashboard
Co-Authored-By: shanks-fan99 <shanks.fan99@example.com>
```

## Pull request body

Generated automatically from the change:

```markdown
## What

Edit to `character:luffy` submitted via the dashboard.

## Changes

- Added bounty entry: 3,000,000,000 ฿ (since manga-chapter:1053)

## Source(s) cited

- manga-chapter:1053

## Contributor

@shanks-fan99 via dashboard at 2026-05-14T13:42:08Z

## Validation

- [ ] Schema validation passes
- [ ] References resolve
- [ ] Build succeeds
```

The checkboxes are filled by CI.

## Labels

Standard labels:

- `edit` — content edit
- `new-entity` — creates a new entity
- `via-dashboard` — submitted via the editing UI
- `vocabulary` — adds/edits a vocabulary value
- `schema-additive` — schema change that is rétro-compatible (safe)
- `schema-breaking` — schema change with migration (gated)
- `narrative` — touches narrative files
- `translation` — touches translation files
- `bot:claude-code` — opened by Claude Code (when relevant)

Labels are applied at PR creation by the dashboard.

## CI on PRs

`.github/workflows/pr.yml` runs:

1. **Install** (Bun)
2. **Lint** (oxlint)
3. **Format check** (oxfmt or dprint)
4. **Typecheck** (`bun run typecheck`)
5. **Schema check** (`bun run schema:check`)
6. **Validate data** (`bun run validate`)
7. **Reference check** (`bun run check:references`)
8. **Test** (`bun run test`)
9. **Build data** (`bun run build:data`)
10. **Build apps** (`bun run build`)

Any failure marks the PR red and blocks merge.

## Conflict handling

The dashboard implements **optimistic locking** via the file SHA.

Flow:

1. On edit page load, server fetches file + records SHA (`baseSha`)
2. UI loads with `baseSha` in form state
3. On submit, client sends `baseSha`
4. Server fetches current SHA on `main`:
   - If unchanged: proceed
   - If changed: return `409 Conflict` with the new content
5. UI shows the conflict: "Someone else edited this entity. Here's the
   diff. Merge manually or discard your changes."

This is the dashboard's only concurrency control. It is sufficient for
phase 1 (admin-only, low contention). When contention grows, a finer
diff/merge UI is added.

## Merge strategy

PRs are merged with **squash** so the data repo has a clean linear
history. The squash commit subject matches the PR title.

## Bot interactions

Claude Code, when used to maintain the data repo, opens PRs the same way:

- Through the GitHub App credentials (when running in CI)
- Or through a separate Personal Access Token (when running locally)
- Always with the `bot:claude-code` label
- Always with a human reviewer required before merge

## Webhook handling

In phase 1, no webhooks are consumed.

In phase 6+, a webhook on `pull_request` events:

- When a PR labeled `via-dashboard` is merged, the dashboard's draft
  store can mark the corresponding draft as published

In phase 7+, a webhook on `issues`:

- Open issues become contributor-facing TODOs in the dashboard

## Rate limiting

GitHub App: 15000 requests/hour. Plenty for phase 1 (~hundreds of PRs/
month). Implementation includes:

- Bun-level cache for `getFile` calls (60s TTL on `main` reads)
- Backoff on 429 responses
- Quota dashboard endpoint (`/api/quota`) for admin visibility

## Audit and accountability

Because every change is a PR:

- Authorship is preserved
- Diff is reviewable
- Reverting is trivial (`git revert`)
- Forking is trivial
- Bots and humans are visible the same way

This is the major advantage over a CMS-backed wiki.

## Local development

For local development without hitting GitHub on every save:

- A `LOCAL_FS_MODE=true` env var makes the dashboard write to the local
  `/data` directory instead of GitHub
- A `git diff` view in the dashboard shows pending local changes
- A "publish" button optionally still opens a real PR

This keeps the inner loop fast.

## Secrets management

- `.env.example` documents required env vars
- Local: `.env.local` (gitignored)
- Production: Vercel environment variables, scoped to the dashboard project
- Rotation: GitHub App key rotation is logged in `/docs/DECISIONS.md`
