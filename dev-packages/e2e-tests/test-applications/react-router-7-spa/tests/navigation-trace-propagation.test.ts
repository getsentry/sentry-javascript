import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

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

  const pageloadSpanPromise = waitForStreamedSpan('react-router-7-spa', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-7-spa', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/products';
  });

  await page.goto('/');
  const pageloadSpan = await pageloadSpanPromise;

  await page.locator('id=navigation-products').click();
  const navigationSpan = await navigationSpanPromise;

  const pageloadTraceId = pageloadSpan.trace_id;
  const navigationTraceId = navigationSpan.trace_id;
  const propagatedTraceId = productsRequestSentryTrace?.split('-')[0];

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(propagatedTraceId).toBeDefined();
  expect(navigationTraceId).not.toEqual(pageloadTraceId);

  // The fetch fired on /products must carry the navigation trace, not the stale pageload trace.
  expect(propagatedTraceId).toEqual(navigationTraceId);
  expect(propagatedTraceId).not.toEqual(pageloadTraceId);
});
