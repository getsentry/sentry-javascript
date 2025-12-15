import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a server function transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function')).toBeVisible();

  await page.getByText('Call server function').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'server.fetch',
        op: 'function.tanstackstart',
        origin: 'auto.function.tanstackstart.serverFn',
        data: {
          'sentry.op': 'function.tanstackstart',
          'sentry.origin': 'auto.function.tanstackstart.serverFn',
        },
      }),
    ]),
  );
});
