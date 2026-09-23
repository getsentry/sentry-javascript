import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// Runs the Node suites below on Deno. The scenarios stay in `node-integration-tests`, and the
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
    include: [
      'suites/public-api/**/test.ts',
      'suites/client-reports/**/test.ts',
      'suites/featureFlags/**/test.ts',
      'suites/express/tracing/**/test.ts',
      'suites/tracing/httpIntegration/test.ts',
      'suites/tracing/httpIntegration-streamed/test.ts',
    ],
    // Single tests that fail on Deno are skipped with `test.skipIf` on `RUNTIME` in the Node suite.
    exclude: ['**/node_modules/**'],
    env: {
      RUNTIME: 'deno',
      DENO_IMPORT_MAP: fileURLToPath(new URL('./node-suites/import-map.json', import.meta.url)),
    },
    testTimeout: 15_000,
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
