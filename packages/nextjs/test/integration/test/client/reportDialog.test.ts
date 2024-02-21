import { expect, test } from '@playwright/test';

test('should show a dialog', async ({ page }) => {
  await page.goto('/reportDialog');

  await page.click('button');

  const dialogScriptSelector = 'head > script[src^="https://dsn.ingest.sentry.io/api/embed/error-page"]';

  const dialogScript = await page.waitForSelector(dialogScriptSelector, { state: 'attached' });
  const dialogScriptSrc = await (await dialogScript.getProperty('src')).jsonValue();

  expect(dialogScriptSrc).toMatch(/^https:\/\/dsn\.ingest\.sentry\.io\/api\/embed\/error-page\/\?.*/);
});
