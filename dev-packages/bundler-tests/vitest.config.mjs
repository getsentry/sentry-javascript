import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.*s'],
    timeout: 10000,
    hookTimeout: 10000,
  },
});
