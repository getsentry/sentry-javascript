import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

test('Should send a transaction with a http span', async ({ request }) => {
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
