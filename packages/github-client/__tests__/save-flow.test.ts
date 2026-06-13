/**
 * Tests for the dashboard save flow's orchestration logic: optimistic
 * locking, the no-op short-circuit, the resume-PR path, and the bulk
 * cast-edit conflict collection. github-client was the most complex
 * package with zero coverage.
 *
 * Strategy: mock the `repo-ops` layer (the thin Git-Data-API wrappers)
 * so we exercise save-flow's branching without a live GitHub. The real
 * module is spread into the mock so `OptimisticLockError` keeps its
 * class identity (save-flow throws it; the test asserts `instanceof`).
 */
import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { GitHubAppConfig } from '../src/config.ts';
import type { FileChange, OpenedPR } from '../src/repo-ops.ts';
import * as realRepoOps from '../src/repo-ops.ts';

type GetFile = { path: string; content: string; sha: string; ref: string; } | null;

const state = {
  files: new Map<string, GetFile>(),
  commitResult: { created: true, commitSha: 'commit-sha', changes: [] as FileChange[] },
  openPRResult: { number: 7, htmlUrl: 'https://github.com/o/r/pull/7', headBranch: '' } as OpenedPR,
  calls: {
    getFile: [] as { path: string; ref?: string; }[],
    createBranch: [] as string[],
    commit: [] as { branch: string; files: readonly { path: string; }[]; }[],
    openPR: [] as { title: string; body: string; labels?: readonly string[]; }[],
  },
};

const key = (path: string, ref?: string): string => `${path}@@${ref ?? '<default>'}`;

mock.module('../src/repo-ops.ts', () => ({
  ...realRepoOps,
  getFile: async (_o: unknown, _c: unknown, path: string, ref?: string): Promise<GetFile> => {
    state.calls.getFile.push({ path, ref });
    return state.files.get(key(path, ref)) ?? null;
  },
  createBranch: async (_o: unknown, _c: unknown, branch: string): Promise<string> => {
    state.calls.createBranch.push(branch);
    return branch;
  },
  commitMultipleFiles: async (
    _o: unknown,
    _c: unknown,
    opts: { branch: string; files: readonly { path: string; }[]; },
  ) => {
    state.calls.commit.push({ branch: opts.branch, files: opts.files });
    return state.commitResult;
  },
  openPullRequest: async (
    _o: unknown,
    _c: unknown,
    opts: { title: string; body: string; labels?: readonly string[]; },
  ): Promise<OpenedPR> => {
    state.calls.openPR.push(opts);
    return { ...state.openPRResult, headBranch: 'branch' };
  },
}));

const { submitEntityEdit, submitSourceCastEdit, MultiFileLockError } = await import(
  '../src/save-flow.ts'
);
const { OptimisticLockError } = await import('../src/repo-ops.ts');

// repo-ops is fully mocked, so octokit + config are never touched.
const octokit = {} as Octokit;
const config: GitHubAppConfig = {
  appId: 'id',
  clientId: 'cid',
  clientSecret: 'secret',
  privateKey: 'key',
  webhookSecret: undefined,
  adminUsernames: [],
  dataRepo: { owner: 'o', repo: 'r' },
};

beforeEach(() => {
  state.files.clear();
  state.commitResult = { created: true, commitSha: 'commit-sha', changes: [] };
  state.openPRResult = { number: 7, htmlUrl: 'https://github.com/o/r/pull/7', headBranch: '' };
  state.calls = { getFile: [], createBranch: [], commit: [], openPR: [] };
});

const baseRequest = {
  entityId: 'character:luffy',
  path: 'data/universes/one-piece/entities/character/luffy.json',
  newContent: '{"id":"character:luffy"}',
  expectedSha: 'sha-A',
  contributorLogin: '7IBO',
  contributorId: 1,
};

describe('submitEntityEdit — optimistic lock', () => {
  it('throws when the file SHA on main moved', async () => {
    state.files.set(key(baseRequest.path), {
      path: baseRequest.path,
      content: 'old',
      sha: 'sha-B',
      ref: '<default>',
    });
    await expect(submitEntityEdit(octokit, config, baseRequest)).rejects.toBeInstanceOf(
      OptimisticLockError,
    );
    expect(state.calls.createBranch).toHaveLength(0);
    expect(state.calls.openPR).toHaveLength(0);
  });
});

describe('submitEntityEdit — no-op short-circuit', () => {
  it('opens no PR when content matches main and no extra files changed', async () => {
    state.files.set(key(baseRequest.path), {
      path: baseRequest.path,
      content: baseRequest.newContent,
      sha: 'sha-A',
      ref: '<default>',
    });
    const result = await submitEntityEdit(octokit, config, baseRequest);
    expect(result.noOp).toBe(true);
    expect(result.number).toBe(0);
    expect(state.calls.createBranch).toHaveLength(0);
    expect(state.calls.openPR).toHaveLength(0);
  });
});

describe('submitEntityEdit — fresh PR', () => {
  it('creates a branch and opens a PR for a brand-new entity', async () => {
    // file absent on main → create path
    state.commitResult = { created: true, commitSha: 'c', changes: [] };
    const result = await submitEntityEdit(octokit, config, {
      ...baseRequest,
      expectedSha: null,
      verb: 'create',
    });
    expect(result.noOp).toBe(false);
    expect(result.reused).toBe(false);
    expect(result.number).toBe(7);
    expect(state.calls.createBranch).toHaveLength(1);
    expect(state.calls.createBranch[0]).toMatch(/^create\/character-luffy\//);
    expect(state.calls.openPR).toHaveLength(1);
    expect(state.calls.openPR[0]!.title).toBe('[DATA] Create character:luffy');
    expect(state.calls.openPR[0]!.labels).toContain('new-entity');
  });

  it('labels an edit PR without new-entity', async () => {
    state.files.set(key(baseRequest.path), {
      path: baseRequest.path,
      content: 'different',
      sha: 'sha-A',
      ref: '<default>',
    });
    const result = await submitEntityEdit(octokit, config, baseRequest);
    expect(result.number).toBe(7);
    expect(state.calls.openPR[0]!.title).toBe('[DATA] Edit character:luffy');
    expect(state.calls.openPR[0]!.labels).not.toContain('new-entity');
  });
});

describe('submitEntityEdit — resume PR', () => {
  const existingPR = {
    number: 42,
    htmlUrl: 'https://github.com/o/r/pull/42',
    headBranch: 'edit/x',
  };

  it('appends to the existing branch without creating a branch or PR', async () => {
    state.files.set(key(baseRequest.path, 'edit/x'), {
      path: baseRequest.path,
      content: 'old',
      sha: 'sha-A',
      ref: 'edit/x',
    });
    const result = await submitEntityEdit(octokit, config, { ...baseRequest, existingPR });
    expect(result.reused).toBe(true);
    expect(result.number).toBe(42);
    expect(state.calls.createBranch).toHaveLength(0);
    expect(state.calls.openPR).toHaveLength(0);
    expect(state.calls.commit[0]!.branch).toBe('edit/x');
  });

  it('reports noOp when the resume commit changed nothing', async () => {
    state.files.set(key(baseRequest.path, 'edit/x'), {
      path: baseRequest.path,
      content: 'old',
      sha: 'sha-A',
      ref: 'edit/x',
    });
    state.commitResult = { created: false, changes: [] };
    const result = await submitEntityEdit(octokit, config, { ...baseRequest, existingPR });
    expect(result.reused).toBe(true);
    expect(result.noOp).toBe(true);
  });

  it('throws on a SHA conflict against the PR branch tip', async () => {
    state.files.set(key(baseRequest.path, 'edit/x'), {
      path: baseRequest.path,
      content: 'old',
      sha: 'sha-MOVED',
      ref: 'edit/x',
    });
    await expect(
      submitEntityEdit(octokit, config, { ...baseRequest, existingPR }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });
});

describe('submitSourceCastEdit', () => {
  const castRequest = {
    sourceId: 'manga-chapter:1',
    contributorLogin: '7IBO',
    contributorId: 1,
    files: [
      { path: 'a.json', content: '{"a":1}', expectedSha: 'sha-a' },
      { path: 'b.json', content: '{"b":1}', expectedSha: 'sha-b' },
    ],
  };

  it('returns noOp for an empty file set without touching GitHub', async () => {
    const result = await submitSourceCastEdit(octokit, config, { ...castRequest, files: [] });
    expect(result.noOp).toBe(true);
    expect(state.calls.getFile).toHaveLength(0);
  });

  it('collects every SHA conflict into one MultiFileLockError', async () => {
    state.files.set(key('a.json'), {
      path: 'a.json',
      content: 'x',
      sha: 'sha-MOVED',
      ref: '<default>',
    });
    state.files.set(key('b.json'), {
      path: 'b.json',
      content: 'x',
      sha: 'sha-ALSO',
      ref: '<default>',
    });
    let caught: unknown;
    try {
      await submitSourceCastEdit(octokit, config, castRequest);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MultiFileLockError);
    expect((caught as InstanceType<typeof MultiFileLockError>).conflicts.map((c) => c.path))
      .toEqual([
        'a.json',
        'b.json',
      ]);
    expect(state.calls.createBranch).toHaveLength(0);
  });

  it('opens one PR for the whole bundle on the happy path', async () => {
    state.files.set(key('a.json'), {
      path: 'a.json',
      content: 'x',
      sha: 'sha-a',
      ref: '<default>',
    });
    state.files.set(key('b.json'), {
      path: 'b.json',
      content: 'x',
      sha: 'sha-b',
      ref: '<default>',
    });
    const result = await submitSourceCastEdit(octokit, config, castRequest);
    expect(result.noOp).toBe(false);
    expect(result.number).toBe(7);
    expect(state.calls.createBranch[0]).toMatch(/^cast\/manga-chapter-1\//);
    expect(state.calls.openPR[0]!.title).toBe('[DATA] Update cast of manga-chapter:1');
    expect(state.calls.openPR[0]!.labels).toContain('apparitions');
  });

  it('skips the PR when the commit changed nothing', async () => {
    state.files.set(key('a.json'), {
      path: 'a.json',
      content: 'x',
      sha: 'sha-a',
      ref: '<default>',
    });
    state.files.set(key('b.json'), {
      path: 'b.json',
      content: 'x',
      sha: 'sha-b',
      ref: '<default>',
    });
    state.commitResult = { created: false, changes: [] };
    const result = await submitSourceCastEdit(octokit, config, castRequest);
    expect(result.noOp).toBe(true);
    expect(state.calls.openPR).toHaveLength(0);
  });
});
