import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  // Use 3 workers on CI, else use defaults (based on available CPU cores)
  // Note that 3 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 3 : undefined,

  globalSetup: require.resolve('./playwright.setup.ts'),
};

export default config;
