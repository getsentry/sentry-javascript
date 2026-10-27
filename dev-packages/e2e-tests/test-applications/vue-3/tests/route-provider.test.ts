import { expect, test } from '@playwright/test';

// The route provider reads the router off the app passed to `Sentry.init`, so this fails if it can't
// find it there.
test('resolves the parameterized route through the route provider', async ({ page }) => {
  await page.goto('/route-provider/123');

  await expect(page.locator('#resolved-route')).toHaveText('/route-provider/:id');
});
