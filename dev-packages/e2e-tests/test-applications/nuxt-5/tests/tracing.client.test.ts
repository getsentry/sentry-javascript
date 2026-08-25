import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import type { Span } from '@sentry/nuxt';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return transactionEvent.transaction === '/test-param/:param()';
  });

  await page.goto(`/test-param/1234`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.segment.name.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'params.param': '1234',
          'url.template': '/test-param/:param()',
          'url.path': '/test-param/1234',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/),
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

test('sends a navigation root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/test-param/:param()'
    );
  });

  await page.goto(`/`);
  await page.getByText('Fetch Param').click();

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.segment.name.source': 'route',
          'sentry.origin': 'auto.navigation.vue',
          'sentry.op': 'navigation',
          'params.param': '1234',
          'url.template': '/test-param/:param()',
          'url.path': '/test-param/1234',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/),
        },
        op: 'navigation',
        origin: 'auto.navigation.vue',
      },
    },
    transaction: '/test-param/:param()',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return transactionEvent.transaction === '/client-error';
  });

  await page.goto(`/client-error`);

  const rootSpan = await transactionPromise;
  const errorButtonSpan = rootSpan.spans.find((span: Span) => span.description === 'Vue <ErrorButton>');

  const expected = {
    data: { 'sentry.origin': 'auto.ui.vue', 'sentry.op': 'ui.mount' },
    description: 'Vue <ErrorButton>',
    op: 'ui.mount',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.vue',
  };

  expect(errorButtonSpan).toMatchObject(expected);
});
