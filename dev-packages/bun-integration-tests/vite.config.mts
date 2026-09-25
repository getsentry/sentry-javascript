import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';
import { BUN_BUILD_EXCLUDE, NO_AUTO_INSTRUMENTATION, NODE_SUITES_EXCLUDE } from './node-suites/excludes';

const NODE_SUITES_ROOT = fileURLToPath(new URL('../node-integration-tests', import.meta.url));

// All Node suites also run on Bun. The scenarios stay in `node-integration-tests`.
const NODE_SUITES = ['suites/**/test.ts'];

const nodeSuitesTest = {
  root: NODE_SUITES_ROOT,
  include: NODE_SUITES,
  exclude: NODE_SUITES_EXCLUDE,
  // Above the 30 second port timeout of the runner on Bun, so a slow start can still pass.
  testTimeout: 45_000,
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
          env: { RUNTIME: 'bun' },
          // Above the 30 second port timeout of the runner on Bun, so a slow start can still pass.
          testTimeout: 45_000,
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
            // `@sentry/bun` has `bunRuntimeMetricsIntegration` instead of `nodeRuntimeMetricsIntegration`.
            'suites/node-runtime-metrics/test.ts',
          ],
          env: {
            RUNTIME: 'bun',
            RUNTIME_PRELOAD: fileURLToPath(new URL('./node-suites/alias-sentry-bun.ts', import.meta.url)),
            EXPECTED_SDK_NAME: 'sentry.javascript.bun',
          },
        },
      },
      {
        extends: true,
        test: {
          ...nodeSuitesTest,
          // The auto-instrumentation suites, with each scenario bundled by `@sentry/bun/plugin` before
          // it starts, as Bun apps must be built to get these spans.
          // See https://github.com/getsentry/sentry-javascript/issues/23882
          name: 'node-suites-bun-build',
          include: NO_AUTO_INSTRUMENTATION.map(glob => (glob.endsWith('/**') ? `${glob}/test.ts` : glob)),
          exclude: BUN_BUILD_EXCLUDE,
          env: {
            RUNTIME: 'bun',
            RUNTIME_PRELOAD: fileURLToPath(new URL('./node-suites/alias-sentry-bun.ts', import.meta.url)),
            RUNTIME_BUILD_SCRIPT: fileURLToPath(new URL('./node-suites/bun-build.ts', import.meta.url)),
            EXPECTED_SDK_NAME: 'sentry.javascript.bun',
          },
        },
      },
    ],
  },
});
