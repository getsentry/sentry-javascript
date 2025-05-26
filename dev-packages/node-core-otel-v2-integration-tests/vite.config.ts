import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    isolate: false,
    coverage: {
      enabled: false,
    },
    include: ['./**/test.ts'],
    testTimeout: 15000,
  },
});
