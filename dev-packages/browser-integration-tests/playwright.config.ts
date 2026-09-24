import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  workers: process.env.CI ? 6 : undefined,
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

  reporter: process.env.CI ? [['list'], ['github'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',

  globalSetup: require.resolve('./playwright.setup.ts'),
  globalTeardown: require.resolve('./playwright.teardown.ts'),
};

export default config;
