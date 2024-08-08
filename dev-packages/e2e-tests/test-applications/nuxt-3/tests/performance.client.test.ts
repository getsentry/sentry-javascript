import { expect, test } from '@nuxt/test-utils/playwright';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-3', async transactionEvent => {
    return transactionEvent.transaction === '/test-param/:param()';
  });

  await page.goto(`/test-param/1234`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'params.param': '1234',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: '/test-param/:param()',
    transaction_info: {
      source: 'route',
    },
  });
});
