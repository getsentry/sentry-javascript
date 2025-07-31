import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-3-min', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/test-param/:param()'
    );
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

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-3-min', async transactionEvent => {
    return transactionEvent.transaction === '/client-error';
  });

  await page.goto(`/client-error`);

  const rootSpan = await transactionPromise;
  const errorButtonSpan = rootSpan.spans.find(span => span.description === 'Vue <ErrorButton>');

  const expected = {
    data: { 'sentry.origin': 'auto.ui.vue', 'sentry.op': 'ui.vue.mount' },
    description: 'Vue <ErrorButton>',
    op: 'ui.vue.mount',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.vue',
  };

  expect(errorButtonSpan).toMatchObject(expected);
});
