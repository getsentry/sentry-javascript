import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.*s'],
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
