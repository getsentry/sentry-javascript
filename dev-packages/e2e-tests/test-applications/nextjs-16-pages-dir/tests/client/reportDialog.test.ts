import { expect, test } from '@playwright/test';

test('should show a dialog', async ({ page }) => {
  // *= means "containing"
  const dialogScriptSelector = 'head > script[src*="/api/embed/error-page"]';

  await page.goto('/reportDialog');

  expect(await page.locator(dialogScriptSelector).count()).toEqual(0);

  await page.click('#open-report-dialog');

  const dialogScript = await page.waitForSelector(dialogScriptSelector, { state: 'attached' });
  const dialogScriptSrc = await (await dialogScript.getProperty('src')).jsonValue();

  expect(dialogScriptSrc).toMatch(/^http.*\/api\/embed\/error-page\/\?.*/);
});
