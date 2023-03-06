import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  // Use 5 workers on CI, else use defaults (based on available CPU cores)
  // Note that 5 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 5 : undefined,
  webServer: {
    command: '(cd test/integration/ && yarn build && yarn start)',
    port: 3000,
  },
};

export default config;
