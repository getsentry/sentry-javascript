import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should correctly instrument `fetch` for performance tracing', async ({ page }) => {
  await page.route(/^https:\/\/example\.com\//, route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        foo: 'bar',
      }),
    });
  });

  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return transactionEvent.transaction === '/fetch' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/fetch`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: '/fetch',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        data: {
          'http.method': 'GET',
          url: 'https://example.com',
          'http.url': 'https://example.com/',
          'server.address': 'example.com',
          type: 'fetch',
          'http.response_content_length': expect.any(Number),
          'http.response.status_code': 200,
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.browser',
        },
        description: 'GET https://example.com/',
        op: 'http.client',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        status: expect.any(String),
        origin: 'auto.http.browser',
      }),
    ]),
  );
});
