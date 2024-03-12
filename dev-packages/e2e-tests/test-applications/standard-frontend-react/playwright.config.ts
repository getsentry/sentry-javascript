import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

// Fix urls not resolving to localhost on Node v17+
// See: https://github.com/axios/axios/issues/3821#issuecomment-1413727575
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

const testEnv = process.env['TEST_ENV'] || 'production';

if (!testEnv) {
  throw new Error('No test env defined');
}

const reactPort = 3030;
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
    timeout: 5000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    baseURL: `http://localhost:${reactPort}`,
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
      command: `pnpm wait-port ${eventProxyPort} && pnpm start`,
      port: reactPort,
      env: {
        PORT: reactPort.toString(),
      },
    },
  ],
};

export default config;
