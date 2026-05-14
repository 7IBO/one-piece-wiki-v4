import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'data', 'schema', 'perf', 'style'],
    ],
    'scope-empty': [0],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};

export default config;
