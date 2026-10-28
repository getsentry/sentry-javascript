import { defineConfig } from '@playwright/test';

const port = 3030;

export default defineConfig({
  testDir: './tests',
  /*
   * Each Sentry poll can take up to 180s. The first poll also waits the ~2min until the span can be
   * queried, so the later polls usually pass at once. This leaves room for two full polls.
   */
  timeout: 400_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Every test spends most of its time polling Sentry, so run them all at once.
  workers: '100%',
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: 'pnpm start',
    port,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
