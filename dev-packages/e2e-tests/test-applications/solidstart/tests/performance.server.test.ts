import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a server action transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart', transactionEvent => {
    return transactionEvent?.transaction === 'getPrefecture';
  });

  await page.goto('/users/6');

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: 'getPrefecture',
    tags: { runtime: 'node' },
    transaction_info: { source: 'url' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'function.server_action',
        origin: 'manual',
      },
    },
  });
});
