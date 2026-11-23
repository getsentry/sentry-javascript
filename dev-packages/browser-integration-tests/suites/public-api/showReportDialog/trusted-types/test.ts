import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('loads the dialog script on pages that enforce Trusted Types', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Registered after `getLocalTestUrl` so it takes precedence over the fixture's ingest route
  await page.route(/\/api\/embed\/error-page\//, route =>
    route.fulfill({ contentType: 'text/javascript', body: '', headers: { 'Access-Control-Allow-Origin': '*' } }),
  );

  await page.goto(url);

  await page.waitForFunction(() => (window as any)._reportDialogLoaded);
  expect(await page.evaluate(() => (window as any)._violations)).toEqual([]);
});
