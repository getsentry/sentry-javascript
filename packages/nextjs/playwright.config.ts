import type { PlaywrightTestConfig } from '@playwright/test';
import * as path from 'path';

const config: PlaywrightTestConfig = {
  retries: 0, // We do not accept flakes.
  use: {
    baseURL: 'http://localhost:3000',
  },
  fullyParallel: true,
  webServer: {
    cwd: path.join(__dirname, 'test', 'integration'),
    command: 'yarn start',
    port: 3000,
  },
};

export default config;
