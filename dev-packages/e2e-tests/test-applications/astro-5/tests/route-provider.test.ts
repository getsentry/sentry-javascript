import { expect, test } from '@playwright/test';

// The route provider reads the route the middleware renders into the page, so this fails if that route
// never reaches the browser.
test('resolves the parameterized route through the route provider', async ({ page }) => {
  await page.goto('/route-provider/123');
  await page.locator('#resolve-route').click();

  await expect(page.locator('#resolved-route')).toHaveText('/route-provider/[id]');
});
