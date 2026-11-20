import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';
import {
  BUN_BUILD_BEFORE_1_4_EXCLUDE,
  BUN_BUILD_EXCLUDE,
  BUN_RUN_EXCLUDE,
  NO_AUTO_INSTRUMENTATION,
  NODE_SUITES_EXCLUDE,
  SENTRY_BUN_BEFORE_1_4_EXCLUDE,
  SENTRY_BUN_EXCLUDE,
  SENTRY_NODE_EXCLUDE,
} from './node-suites/excludes';

const NODE_SUITES_ROOT = fileURLToPath(new URL('../node-integration-tests', import.meta.url));

// All Node suites also run on Bun. The scenarios stay in `node-integration-tests`.
const NODE_SUITES = ['suites/**/test.ts'];

// Before Bun 1.4.6, `bun run` cannot load the modules that the instrumentation transforms.
const [bunMajor = 0, bunMinor = 0, bunPatch = 0] = execFileSync('bun', ['--version'], { encoding: 'utf8' })
  .trim()
  .split(/[.-]/)
  .map(Number);
const BUN_BEFORE_1_4 = bunMajor < 1 || (bunMajor === 1 && bunMinor < 4);
const BUN_RUN_INSTRUMENTS = bunMajor > 1 || (bunMajor === 1 && (bunMinor > 4 || (bunMinor === 4 && bunPatch >= 6)));

const AUTO_INSTRUMENTATION_SUITES = NO_AUTO_INSTRUMENTATION.map(glob =>
  glob.endsWith('/**') ? `${glob}/test.ts` : glob,
);

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
    isolate: false,
    testTimeout: 20_000,
    ...(process.env.DEBUG
      ? {
          disableConsoleIntercept: true,
          silent: false,
        }
      : {}),
    pool: 'threads',
    maxWorkers: process.env.CI ? 4 : undefined,
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
          maxWorkers: 2,
          // Vitest requires projects with a different `maxWorkers` to run in their own group.
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          ...nodeSuitesTest,
          name: 'node-suites',
          exclude: [...NODE_SUITES_EXCLUDE, ...SENTRY_NODE_EXCLUDE],
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
            ...SENTRY_BUN_EXCLUDE,
            ...(BUN_BEFORE_1_4 ? SENTRY_BUN_BEFORE_1_4_EXCLUDE : []),
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
          include: AUTO_INSTRUMENTATION_SUITES,
          exclude: [...BUN_BUILD_EXCLUDE, ...(BUN_BEFORE_1_4 ? BUN_BUILD_BEFORE_1_4_EXCLUDE : [])],
          env: {
            RUNTIME: 'bun',
            RUNTIME_PRELOAD: fileURLToPath(new URL('./node-suites/alias-sentry-bun.ts', import.meta.url)),
            RUNTIME_BUILD_SCRIPT: fileURLToPath(new URL('./node-suites/bun-build.ts', import.meta.url)),
            EXPECTED_SDK_NAME: 'sentry.javascript.bun',
          },
        },
      },
      ...(BUN_RUN_INSTRUMENTS
        ? [
            {
              extends: true,
              test: {
                ...nodeSuitesTest,
                // The auto-instrumentation suites, run unbuilt with `@sentry/bun/import` preloaded.
                name: 'node-suites-bun-run',
                // The bundled project uses the same Docker fixtures.
                sequence: { groupOrder: 2 },
                include: AUTO_INSTRUMENTATION_SUITES,
                exclude: BUN_RUN_EXCLUDE,
                env: {
                  RUNTIME: 'bun',
                  RUNTIME_PRELOAD: fileURLToPath(new URL('./node-suites/bun-run.ts', import.meta.url)),
                  EXPECTED_SDK_NAME: 'sentry.javascript.bun',
                },
              },
            },
          ]
        : []),
    ],
  },
});
