import { expect, test } from '@playwright/test';

test('uses the current SDK after restoring the build cache', async ({ page }) => {
  await page.goto('/');

  await expect
    .poll(() =>
      page.evaluate(() => {
        return (globalThis as typeof globalThis & { _sentryBuildCacheProbe?: string })._sentryBuildCacheProbe;
      }),
    )
    .toBe('next-webpack-sdk-probe-after');
});
