import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  timeout: 12000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  workers: 3,
  webServer: {
    command: '(cd test/integration/ && yarn build && yarn start)',
    port: 3000,
  },
};

export default config;
