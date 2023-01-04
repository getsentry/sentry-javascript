import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  retries: 2,
  timeout: 12000,
  workers: 3,
};
export default config;
