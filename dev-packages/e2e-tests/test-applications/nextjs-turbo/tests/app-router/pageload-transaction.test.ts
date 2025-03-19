import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should record pageload transactions (this test verifies that the client SDK is initialized)', async ({
  page,
}) => {
  const pageloadTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === '/pageload-transaction';
  });

  await page.goto(`/pageload-transaction`);

  const pageloadTransaction = await pageloadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
});
