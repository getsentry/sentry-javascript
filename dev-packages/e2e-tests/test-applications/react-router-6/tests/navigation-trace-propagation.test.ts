import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('propagates the navigation trace (not the stale pageload trace) for a fetch in a route mount effect', async ({
  page,
}) => {
  // Intercept the /products data fetch and capture the tracing header the SDK attached.
  let productsRequestSentryTrace: string | undefined;
  await page.route('**/api/products', async route => {
    productsRequestSentryTrace = route.request().headers()['sentry-trace'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  const pageloadTxnPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/products';
  });

  await page.goto('/');
  const pageloadTxn = await pageloadTxnPromise;

  await page.locator('id=navigation-products').click();
  const navigationTxn = await navigationTxnPromise;

  const pageloadTraceId = pageloadTxn.contexts?.trace?.trace_id;
  const navigationTraceId = navigationTxn.contexts?.trace?.trace_id;
  const propagatedTraceId = productsRequestSentryTrace?.split('-')[0];

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(propagatedTraceId).toBeDefined();
  expect(navigationTraceId).not.toEqual(pageloadTraceId);

  // The fetch fired on /products must carry the navigation trace, not the stale pageload trace.
  expect(propagatedTraceId).toEqual(navigationTraceId);
  expect(propagatedTraceId).not.toEqual(pageloadTraceId);
});
