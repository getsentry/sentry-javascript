import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import baseConfig from '../../vite/vite.config';

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
  },
};
