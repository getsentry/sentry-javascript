import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

// Fix urls not resolving to localhost on Node v17+
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

const emberPort = 4020;
const eventProxyPort = 3031;

const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
  use: {
    baseURL: `http://localhost:${emberPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm ts-node-script start-event-proxy.ts',
      port: eventProxyPort,
    },
    {
      command: `pnpm start`,
      port: emberPort,
    },
  ],
};

export default config;
