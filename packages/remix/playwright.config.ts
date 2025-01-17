import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Run tests inside of a single file in parallel
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
  // Use 3 workers on CI, else use defaults (based on available CPU cores)
  // Note that 3 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 3 : undefined,
  webServer: {
    command: `(cd test/integration/ && yarn build && yarn ${process.env.USE_OTEL === '1' ? 'start:otel' : 'start'})`,
    port: 3000,
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
};

export default config;
