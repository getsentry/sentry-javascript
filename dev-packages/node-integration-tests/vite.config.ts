import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    isolate: false,
    coverage: {
      enabled: false,
    },
    include: ['./**/test.ts'],
    testTimeout: 15000,
    // Retry only on PRs, so flaky tests keep failing on develop, where the weekly flaky test report looks for them.
    retry: process.env.GITHUB_EVENT_NAME === 'pull_request' ? 1 : 0,
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
    reporters: process.env.DEBUG
      ? [['default', { summary: false }]]
      : process.env.GITHUB_ACTIONS
        ? ['dot', 'github-actions']
        : ['verbose'],
  },
});
