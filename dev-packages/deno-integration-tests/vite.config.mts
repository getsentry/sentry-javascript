import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';
import { NODE_SUITES_EXCLUDE } from './node-suites/excludes';

// Runs all Node suites on Deno. The scenarios stay in `node-integration-tests`, and the
// Deno-only suites in `suites/` run with `deno test`.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    root: fileURLToPath(new URL('../node-integration-tests', import.meta.url)),
    coverage: {
      enabled: false,
    },
    isolate: false,
    include: ['suites/**/test.ts'],
    exclude: NODE_SUITES_EXCLUDE,
    env: {
      RUNTIME: 'deno',
      DENO_IMPORT_MAP: fileURLToPath(new URL('./node-suites/import-map.json', import.meta.url)),
    },
    // Above the 30 second port timeout of the runner on Deno, so a slow start can still pass.
    testTimeout: 45_000,
    ...(process.env.DEBUG
      ? {
          disableConsoleIntercept: true,
          silent: false,
        }
      : {}),
    pool: 'threads',
    reporters: process.env.DEBUG
      ? ['default', { summary: false }]
      : process.env.GITHUB_ACTIONS
        ? ['dot', 'github-actions']
        : ['verbose'],
  },
});
