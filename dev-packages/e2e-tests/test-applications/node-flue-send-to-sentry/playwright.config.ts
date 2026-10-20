import { defineConfig } from '@playwright/test';

const port = 3030;

export default defineConfig({
  testDir: './tests',
  // A real OpenRouter turn, then Sentry polls of up to 180s each (EVENT_POLLING_OPTIONS). Spans take about
  // two minutes to become queryable, which falls inside the first poll; the later ones land quickly.
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
