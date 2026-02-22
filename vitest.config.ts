import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
});
