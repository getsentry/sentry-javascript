import type { PlaywrightTestConfig } from '@playwright/test';
import * as path from 'path';

const config: PlaywrightTestConfig = {
  retries: 0, // We do not accept flakes.
  timeout: 12000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  workers: 3,
  webServer: {
    cwd: path.join(__dirname, 'test', 'integration'),
    command: 'yarn start',
    port: 3000,
  },
};

export default config;
