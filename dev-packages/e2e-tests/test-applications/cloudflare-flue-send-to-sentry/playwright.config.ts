import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // The worker is deployed once for the whole run and deleted again afterwards.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  /* A real model turn, then ~2min until its spans are queryable, then the trace itself. */
  timeout: 300_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Every test spends most of its time polling Sentry, so run them all at once.
  workers: '100%',
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
});
