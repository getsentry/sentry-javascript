import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with component tracking init spans', async ({ page }) => {
  const transactionPromise = waitForTransaction('svelte-5', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const pageloadTransaction = await transactionPromise;

  expect(pageloadTransaction).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.browser',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
  });

  expect(pageloadTransaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'ui.mount',
        description: '<App>',
        data: {
          'sentry.op': 'ui.mount',
          'sentry.origin': 'auto.ui.svelte',
        },
      }),
      expect.objectContaining({
        op: 'ui.mount',
        description: '<Counter>',
        data: {
          'sentry.op': 'ui.mount',
          'sentry.origin': 'auto.ui.svelte',
        },
      }),
    ]),
  );
});
