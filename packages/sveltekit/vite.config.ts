import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import baseConfig from '@sentry-internal/vitest-config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: ['./test/vitest.setup.ts'],
    alias: [
      {
        find: '$app/stores',
        replacement: resolve(fileURLToPath(dirname(import.meta.url)), '/.empty.js'),
      },
    ],
    coverage: {
      ...baseConfig.test.coverage,
      exclude: ['build', '.eslintrc.js', 'vite.config.ts', 'rollup.*', 'stryker*', 'test/*'],
    },
  },
};
