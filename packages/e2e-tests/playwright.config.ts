import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: require.resolve('./test-setup.ts'),
  globalTeardown: require.resolve('./test-teardown.ts'),

  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: 'tests',

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  timeout: 5 * 60 * 1000,

  // Reporter to use
  reporter: 'line',
  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  preserveOutput: 'failures-only',
});
