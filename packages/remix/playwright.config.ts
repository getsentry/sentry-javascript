import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  fullyParallel: true,
  webServer: {
    command: '(cd test/integration/ && yarn build && yarn start)',
    port: 3000,
  },
};

export default config;
