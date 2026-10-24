import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  // A test that passes on retry is reported as flaky in the job summary and in the weekly flaky test report.
  // `test:detect-flaky` passes `--retries=0`, so it still fails on the first flaky run.
  retries: process.env.CI ? 1 : 0,
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  // Use 3 workers on CI, else use defaults (based on available CPU cores)
  // Note that 3 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 3 : undefined,
  testMatch: /test.ts/,

  use: {
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
    {
      name: 'webkit',
      use: devices['Desktop Safari'],
    },
    {
      name: 'firefox',
      grep: /@firefox/i,
      use: devices['Desktop Firefox'],
    },
  ],

  reporter: process.env.CI
    ? [['list'], ['github'], ['junit', { outputFile: 'results.junit.xml' }], ['json', { outputFile: 'results.json' }]]
    : 'list',

  globalSetup: require.resolve('./playwright.setup.ts'),
  globalTeardown: require.resolve('./playwright.teardown.ts'),
};

export default config;
