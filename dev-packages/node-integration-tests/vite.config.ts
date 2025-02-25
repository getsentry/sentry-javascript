import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    maxConcurrency: 4,
    include: ['./**/test.ts'],
    testTimeout: 15000,
  },
});
