import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// we have more thorough tests for tanstack-router in a separate e2e test
// so here we just do a basic check to verify that the integration is automatically enabled if tracing is enabled
test('sends a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('tanstackstart-react', async transactionEvent => {
    console.log('transactionEvent', transactionEvent);
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.react.tanstackstart_react',
          'sentry.op': 'pageload',
        },
        op: 'pageload',
        origin: 'auto.pageload.react.tanstackstart_react',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'loading-home',
      }),
    ]),
  });
});
