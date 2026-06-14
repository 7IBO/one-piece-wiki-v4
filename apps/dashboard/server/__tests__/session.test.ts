import { describe, expect, test } from 'bun:test';

// Lazy secret resolution reads this on the first sign() call (inside a
// test body), so setting it at module top-level is enough.
process.env['SESSION_SECRET'] = 'test-secret-at-least-thirty-two-chars-long';

import {
  buildCookie,
  newAnonymousSession,
  newGithubSession,
  parse,
  serialize,
} from '../session.ts';

describe('session cookie HMAC', () => {
  test('round-trips a github session', () => {
    const s = newGithubSession('luffy', 42);
    expect(parse(serialize(s))).toEqual(s);
  });

  test('round-trips an anonymous session', () => {
    const s = newAnonymousSession('Nakama');
    expect(parse(serialize(s))).toEqual(s);
  });

  test('rejects a tampered payload', () => {
    const [payload, sig] = serialize(newAnonymousSession('Nakama')).split('.');
    expect(parse(`${payload}x.${sig}`)).toBeNull();
  });

  test('rejects a tampered signature', () => {
    const [payload] = serialize(newGithubSession('zoro', 1)).split('.');
    expect(parse(`${payload}.deadbeef`)).toBeNull();
  });

  test('rejects an expired session', () => {
    const expired = {
      kind: 'anonymous',
      nickname: 'old',
      expiresAt: Date.now() - 1000,
    } as const;
    expect(parse(serialize(expired))).toBeNull();
  });

  test('rejects malformed cookies', () => {
    expect(parse(null)).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('no-dot-here')).toBeNull();
  });
});

describe('cookie attributes', () => {
  test('sets HttpOnly + SameSite=Lax; no Secure in local dev', () => {
    const cookie = buildCookie(newAnonymousSession('x'));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });
});
