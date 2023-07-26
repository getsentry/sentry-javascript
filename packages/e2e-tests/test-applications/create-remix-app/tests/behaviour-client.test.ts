import { test, expect } from '@playwright/test';

test('Boots up correctly', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading')).toHaveText('Welcome to Remix');
});
