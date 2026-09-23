import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

const NODE_SUITES_ROOT = fileURLToPath(new URL('../node-integration-tests', import.meta.url));

// Node suites that also run on Bun. The scenarios stay in `node-integration-tests`.
const NODE_SUITES = [
  'suites/public-api/**/test.ts',
  'suites/client-reports/**/test.ts',
  'suites/featureFlags/**/test.ts',
];

// Single tests that fail on Bun are skipped with `test.skipIf` on `RUNTIME` in the Node suite.
const NODE_SUITES_EXCLUDE = ['**/node_modules/**'];

const nodeSuitesTest = {
  root: NODE_SUITES_ROOT,
  include: NODE_SUITES,
  exclude: NODE_SUITES_EXCLUDE,
  testTimeout: 15_000,
};

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      enabled: false,
    },
    isolate: false,
    testTimeout: 20_000,
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
    projects: [
      {
        extends: true,
        test: {
          name: 'bun',
          include: ['./suites/**/test.ts'],
          poolOptions: {
            threads: {
              singleThread: true,
            },
          },
        },
      },
      {
        extends: true,
        test: {
          ...nodeSuitesTest,
          name: 'node-suites',
          env: { RUNTIME: 'bun' },
        },
      },
      {
        extends: true,
        test: {
          ...nodeSuitesTest,
          name: 'node-suites-sentry-bun',
          exclude: [
            ...NODE_SUITES_EXCLUDE,
            // The scenario creates a `NodeClient` itself, which sends `sentry.javascript.node`.
            'suites/public-api/logs/test.ts',
          ],
          env: {
            RUNTIME: 'bun',
            RUNTIME_PRELOAD: fileURLToPath(new URL('./node-suites/alias-sentry-bun.ts', import.meta.url)),
            EXPECTED_SDK_NAME: 'sentry.javascript.bun',
          },
        },
      },
    ],
  },
});
