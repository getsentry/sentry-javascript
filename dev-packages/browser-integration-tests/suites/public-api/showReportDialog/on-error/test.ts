import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('calls `onError` when the dialog script is blocked', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Registered after `getLocalTestUrl` so it takes precedence over the fixture's ingest route
  await page.route(/\/api\/embed\/error-page\//, route => route.abort('blockedbyclient'));

  await page.goto(url);

  const errorMessage = await page.waitForFunction(() => (window as any)._reportDialogError);

  expect(await errorMessage.jsonValue()).toBe('Failed to load the report dialog script');
});
