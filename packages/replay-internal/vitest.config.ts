import type { UserConfig } from 'vitest';
import { defineConfig } from 'vitest/config';

import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...(baseConfig as UserConfig & { test: any }).test,
    coverage: {},
    globals: true,
    setupFiles: ['./test.setup.ts'],
    reporters: ['default'],
    environment: 'jsdom',
  },
});
