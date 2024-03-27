import os from 'os';
import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

// Fix urls not resolving to localhost on Node v17+
// See: https://github.com/axios/axios/issues/3821#issuecomment-1413727575
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const nextPort = 3030;
const eventProxyPort = 3031;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  /* Maximum time one test can run for. */
  timeout: 150_000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 10000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Defaults to half the number of CPUs. The tests are not really CPU-bound but rather I/O-bound with all the polling we do so we increase the concurrency to the CPU count. */
  workers: os.cpus().length,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* `next dev` is incredibly buggy with the app dir */
  retries: testEnv === 'development' ? 3 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${nextPort}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'pnpm ts-node-script start-event-proxy.ts',
      port: eventProxyPort,
    },
    {
      command:
        testEnv === 'development'
          ? `pnpm wait-port ${eventProxyPort} && pnpm next dev -p ${nextPort}`
          : `pnpm wait-port ${eventProxyPort} && pnpm next start -p ${nextPort}`,
      port: nextPort,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
};

export default config;
