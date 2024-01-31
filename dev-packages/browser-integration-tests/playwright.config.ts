import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  // We always use the 'list' reporter here, expect for the esm environment on CI
  // otherwise, a failed test will report to github for each env/bundle we run it in, leading to a messy UI
  reporter: process.env.CI && process.env.PW_BUNDLE === 'esm' ? 'github' : 'list',
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  // Use 3 workers on CI, else use defaults (based on available CPU cores)
  // Note that 3 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 3 : undefined,
  testMatch: /test.ts/,

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

  globalSetup: require.resolve('./playwright.setup.ts'),
};

export default config;
