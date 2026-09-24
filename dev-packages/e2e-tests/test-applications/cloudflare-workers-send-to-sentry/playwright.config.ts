import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // The worker is deployed once for the whole run and deleted again afterwards.
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
  /* Spans take ~2min to become queryable via the trace endpoint. */
  timeout: 210_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 6 : '100%',
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
});
