import { expect, test } from '@playwright/test';

test('the app boots under the Sentry --import entry', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#home')).toBeVisible();
});
