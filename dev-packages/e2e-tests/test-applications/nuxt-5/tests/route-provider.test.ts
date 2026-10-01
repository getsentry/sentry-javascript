import { expect, test } from '@playwright/test';

// The route provider reads the router off the Nuxt app, so this fails if the plugin never registers it.
test('resolves the parameterized route through the route provider', async ({ page }) => {
  await page.goto('/route-provider/123');

  await expect(page.locator('#resolved-route')).toHaveText('/route-provider/:id()');
});
