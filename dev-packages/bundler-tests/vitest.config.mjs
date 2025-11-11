import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.*s'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
