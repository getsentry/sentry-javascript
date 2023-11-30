import { expect, test } from '@playwright/test';
import { Transaction } from '@sentry/types';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should correctly instrument `fetch` for performance tracing', async ({ page }) => {
  await page.route('http://example.com/**/*', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        foo: 'bar',
      }),
    });
  });

  const transaction = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/fetch',
    envelopeType: 'transaction',
  });

  expect(transaction[0]).toMatchObject({
    transaction: '/fetch',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  // @ts-expect-error - We know that `spans` is inside Transaction envelopes
  expect(transaction[0].spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        data: {
          'http.method': 'GET',
          url: 'http://example.com',
          type: 'fetch',
          'http.response_content_length': expect.any(Number),
          'http.response.status_code': 200,
        },
        description: 'GET http://example.com',
        op: 'http.client',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        status: expect.any(String),
      }),
    ]),
  );

  expect(await countEnvelopes(page, { url: '/fetch', envelopeType: 'transaction', timeout: 2500 })).toBe(1);
});
