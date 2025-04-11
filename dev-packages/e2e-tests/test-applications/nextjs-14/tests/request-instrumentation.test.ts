import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should send a transaction with a fetch span', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /request-instrumentation';
  });

  await page.goto(`/request-instrumentation`);

  await expect(transactionPromise).resolves.toBeDefined();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.request.method': 'GET',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.node_fetch',
      }),
      description: 'GET https://github.com/',
    }),
  );

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.method': 'GET',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.http',
      }),
      description: 'GET https://github.com/',
    }),
  );
});
