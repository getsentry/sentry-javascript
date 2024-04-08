import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

// Note(lforst): I officially declare bancruptcy on this test. I tried a million ways to make it work but it kept flaking.
// Sometimes the request span was included in the handler span, more often it wasn't. I have no idea why. Maybe one day we will
// figure it out. Today is not that day.
test.skip('Should send a transaction with a http span', async ({ request }) => {
  const transactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/request-instrumentation';
  });

  await request.get('/api/request-instrumentation');

  expect((await transactionPromise).spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.method': 'GET',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.http',
      }),
      description: 'GET http://example.com/',
    }),
  );
});
