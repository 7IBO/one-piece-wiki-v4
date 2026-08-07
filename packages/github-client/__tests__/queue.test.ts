/**
 * Contributor recovery from the PR body's Contributors bullet (W-B
 * admin queue) — must round-trip the exact shapes save-flow.ts writes.
 */
import { describe, expect, it } from 'bun:test';
import { parseContributorBullet } from '../src/repo-ops.ts';

describe('parseContributorBullet', () => {
  it('parses the GitHub-login bullet', () => {
    const body = '**Contributors**\n- @7IBO\n\n**Entity:** `character:luffy`';
    expect(parseContributorBullet(body)).toEqual({ kind: 'github', login: '7IBO' });
  });

  it('parses the anonymous-nickname bullet', () => {
    const body = '**Contributors**\n- **Nami Fan 42** _(anonymous contributor)_\n';
    expect(parseContributorBullet(body)).toEqual({
      kind: 'anonymous',
      nickname: 'Nami Fan 42',
    });
  });

  it('returns null for the bare anonymous bullet and foreign bodies', () => {
    expect(parseContributorBullet('**Contributors**\n- _Anonymous contributor_\n')).toBeNull();
    expect(parseContributorBullet('Fixes #12 — refactor')).toBeNull();
  });

  it('ignores @mentions that are not a Contributors bullet', () => {
    expect(parseContributorBullet('Thanks @someone for the report!')).toBeNull();
  });
});
