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
        // In a real build the `sentrySvelteKit()` Vite plugin resolves this per SvelteKit version.
        // Unit tests target the Svelte 4 (`$app/stores`) variant; the Svelte 5 rune variant is
        // covered by the `sveltekit-3` e2e app (runes need the Svelte compiler, not vitest).
        find: 'sentry-sveltekit-tracing',
        replacement: resolve(dirname(fileURLToPath(import.meta.url)), 'src/client/svelte4BrowserTracing.ts'),
      },
    ],
  },
};
