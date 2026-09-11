import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

// Note(lforst): I officially declare bancruptcy on this test. I tried a million ways to make it work but it kept flaking.
// Sometimes the request span was included in the handler span, more often it wasn't. I have no idea why. Maybe one day we will
// figure it out. Today is not that day.
test.skip('Should send a http span', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-pages-dir', 'GET /api/request-instrumentation');

  await request.get('/api/request-instrumentation');

  expect(await spansPromise).toContainEqual(
    expect.objectContaining({
      name: 'GET https://example.com/',
      attributes: expect.objectContaining({
        'http.request.method': { value: 'GET', type: 'string' },
        'sentry.op': { value: 'http.client', type: 'string' },
        'sentry.origin': { value: 'auto.http.client', type: 'string' },
      }),
    }),
  );
});
