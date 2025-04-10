import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  test: {
    ...baseConfig.test,
    coverage: {},
    globals: true,
    setupFiles: ['./setup-test.ts'],
    environment: 'jsdom',
  },
});
