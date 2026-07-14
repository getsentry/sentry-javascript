import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('starts the client without a removed $app/stores module error', async ({ page }) => {
  const pageErrors: string[] = [];
  const pageLoadTransactionPromise = waitForTransaction(
    'sveltekit-3-preview',
    event => event.contexts?.trace?.op === 'pageload',
  );
  const navigationTransactionPromise = waitForTransaction(
    'sveltekit-3-preview',
    event => event.contexts?.trace?.op === 'navigation',
  );

  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(pageErrors).toEqual([]);
  await expect(page.locator('body')).toHaveClass(/hydrated/);
  const pageLoadTransaction = await pageLoadTransactionPromise;

  await page.getByRole('link', { name: 'Target' }).click();
  await expect(page).toHaveURL(/\/target$/);
  const navigationTransaction = await navigationTransactionPromise;

  expect(pageLoadTransaction.contexts?.trace).toMatchObject({
    op: 'pageload',
    origin: 'auto.pageload.sveltekit',
  });
  expect(navigationTransaction.contexts?.trace).toMatchObject({
    op: 'navigation',
    origin: 'auto.navigation.sveltekit',
  });
  expect(navigationTransaction.transaction).toBe('/target');
  expect(navigationTransaction.transaction_info?.source).toBe('route');
  expect(navigationTransaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'ui.sveltekit.routing',
        origin: 'auto.ui.sveltekit',
      }),
    ]),
  );
});
