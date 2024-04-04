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

  // TODO: Uncomment the below when fixed. For whatever reason that we now have accepted, spans created with Node.js' http.get() will not attach themselves to transactions.
  // More info: https://github.com/getsentry/sentry-javascript/pull/11016/files#diff-10fa195789425786c6e5e769380be18790768f0b76319ee41bbb488d9fe50405R4
  // expect((await transactionPromise).spans).toContainEqual(
  //   expect.objectContaining({
  //     data: expect.objectContaining({
  //       'http.method': 'GET',
  //       'sentry.op': 'http.client',
  //       'sentry.origin': 'auto.http.otel.http',
  //     }),
  //     description: 'GET http://example.com/',
  //   }),
  // );
});
