import { defineConfig } from '@playwright/test';

const port = 3030;

export default defineConfig({
  testDir: './tests',
  /*
   * Spans take ~2min to become queryable via the trace endpoint, and each poll has its own 180s
   * budget. The first test polls twice in a row (the model span, then its parent), so the ceiling
   * has to hold two polls back to back.
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
