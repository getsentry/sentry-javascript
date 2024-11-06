import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
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

  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',

  globalSetup: require.resolve('./playwright.setup.ts'),
  globalTeardown: require.resolve('./playwright.teardown.ts'),
};

export default config;
