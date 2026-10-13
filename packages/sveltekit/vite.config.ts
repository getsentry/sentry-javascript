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
      {
        find: '$app/state',
        replacement: resolve(fileURLToPath(dirname(import.meta.url)), '/.empty.js'),
      },
      {
        // Unit tests target the Svelte 4 variant; the Svelte 5 rune variant is covered by e2e.
        find: '@sentry/sveltekit/browser-tracing-variant',
        replacement: resolve(dirname(fileURLToPath(import.meta.url)), 'src/client/svelte4BrowserTracing.ts'),
      },
    ],
  },
};
