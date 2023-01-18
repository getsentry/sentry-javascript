import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 2,
  timeout: 12000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  workers: 3,
  webServer: {
    command: 'yarn test:integration:prepare',
    port: 3000,
  },
};

export default config;
