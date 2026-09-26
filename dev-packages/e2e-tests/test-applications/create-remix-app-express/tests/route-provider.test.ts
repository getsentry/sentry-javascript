import { expect, test } from '@playwright/test';

// The route provider is backed by the manifest the Vite plugin injects into the client bundle, so this
// fails if that manifest never reaches the browser.
test('resolves the parameterized route through the route provider', async ({ page }) => {
  await page.goto('/route-provider/123');

  await expect(page.locator('#resolved-route')).toHaveText('/route-provider/:id');
});
