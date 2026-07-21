import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      enabled: false,
    },
    isolate: false,
    include: ['./suites/**/test.ts'],
    // Each test spawns its own `wrangler dev` (cold workerd boot) and waits for envelopes to be
    // delivered — there is no internal runner timeout, so this ceiling covers cold-start + async work +
    // delivery. Cold-start is slow and highly variable on CI, so give it generous headroom to de-flake.
    testTimeout: 60_000,
    // Ensure we can see debug output when DEBUG=true
    ...(process.env.DEBUG
      ? {
          disableConsoleIntercept: true,
          silent: false,
        }
      : {}),
    // By default Vitest uses child processes to run tests but all our tests
    // already run in their own processes. We use threads instead because the
    // overhead is significantly less.
    pool: 'threads',
    // Run tests sequentially to avoid port conflicts with wrangler dev processes
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    sequence: {
      shuffle: true,
    },
    reporters: process.env.DEBUG
      ? ['default', { summary: false }]
      : process.env.GITHUB_ACTIONS
        ? ['dot', 'github-actions']
        : ['verbose'],
  },
});
