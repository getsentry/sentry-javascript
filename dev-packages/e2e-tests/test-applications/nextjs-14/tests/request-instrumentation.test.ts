import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

test('Should send a transaction with a fetch span', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/request-instrumentation)';
  });

  await page.goto(`/request-instrumentation`);

  expect((await transactionPromise).spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.method': 'GET',
        'sentry.op': 'http.client',
        'next.span_type': 'AppRender.fetch', // This span is created by Next.js own fetch instrumentation
      }),
      description: 'GET http://example.com/',
    }),
  );

  expect((await transactionPromise).spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'http.method': 'GET',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.node.http',
      }),
      description: 'GET http://example.com/',
    }),
  );
});
