import { expect, test } from '@playwright/test';

test('should receive correct data from instrumented defer response', async ({ page }) => {
  await page.goto('/loader-defer-response/98765');

  const renderedId = await page.waitForSelector('#data-render');

  expect(await renderedId?.textContent()).toBe('98765');
});
