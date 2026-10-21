import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Should send a fetch span', async ({ page }) => {
  // The fetch spans are children of the segment span, which ends last.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-14', 'GET /request-instrumentation');

  await page.goto(`/request-instrumentation`);

  const spans = await spansPromise;

  // `http.client` span names are low cardinality under span streaming, so the name is the method and
  // host rather than the full URL.
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'GET github.com',
      attributes: expect.objectContaining({
        'http.request.method': { value: 'GET', type: 'string' },
        'sentry.op': { value: 'http.client', type: 'string' },
        'sentry.origin': { value: 'auto.http.node_fetch', type: 'string' },
        'url.full': { value: 'https://github.com/', type: 'string' },
      }),
    }),
  );

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'GET github.com',
      attributes: expect.objectContaining({
        'http.request.method': { value: 'GET', type: 'string' },
        'sentry.op': { value: 'http.client', type: 'string' },
        'sentry.origin': { value: 'auto.http.client', type: 'string' },
        'url.full': { value: 'https://github.com/', type: 'string' },
      }),
    }),
  );
});
