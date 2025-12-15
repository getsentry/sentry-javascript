import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a server function transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /';
  });

  await page.goto('/');

  await expect(page.locator('button').filter({ hasText: 'Break server function' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break server function' }).click();

  const transactionEvent = await transactionEventPromise;

  // TODO: verify correct span data
  expect(Array.isArray(transactionEvent?.spans)).toBe(true);
  expect(transactionEvent?.spans?.length).toBeGreaterThan(0);
});
