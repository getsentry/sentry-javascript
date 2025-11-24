import { expect, test } from '@playwright/test';

test('Should render cached component', async ({ page }) => {
  await page.goto('/cache');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
});
