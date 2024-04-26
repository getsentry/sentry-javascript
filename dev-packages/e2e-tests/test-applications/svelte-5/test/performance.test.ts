import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('sends a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('svelte-5', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
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
});
