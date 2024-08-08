import { expect, test } from '@playwright/test';

import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should send a transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('cloudflare-remix', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /';
  });

  await page.goto(`/`);

  await expect(transactionPromise).resolves.toBeDefined();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.method': 'GET',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.node_fetch',
      }),
      description: 'GET http://example.com/',
    }),
  );

  expect(transactionEvent.spans).toContainEqual(
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
