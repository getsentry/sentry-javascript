import { expect, test } from '@playwright/test';

test('runs the application', async ({ page }) => {
  await page.goto(`/`);

  await page.waitForTimeout(1000);

  await expect(page.locator('div')).toContainText('Hello World!');
});
