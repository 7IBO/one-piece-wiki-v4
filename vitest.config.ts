import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.{test,spec}.ts', 'packages/*/__tests__/**/*.{test,spec}.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
