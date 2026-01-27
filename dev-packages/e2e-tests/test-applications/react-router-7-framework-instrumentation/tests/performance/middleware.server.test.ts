import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Note: React Router middleware instrumentation now works in Framework Mode.
// Previously this was a known limitation (see: https://github.com/remix-run/react-router/discussions/12950)
test.describe('server - instrumentation API middleware', () => {
  test('should instrument server middleware with instrumentation API origin', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/with-middleware';
    });

    await page.goto(`/performance/with-middleware`);

    const transaction = await txPromise;

    // Verify the middleware route content is rendered
    await expect(page.locator('#middleware-route-title')).toBeVisible();
    await expect(page.locator('#middleware-route-content')).toHaveText('This route has middleware');

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.react_router.instrumentation_api',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
        },
      },
      spans: expect.any(Array),
      transaction: 'GET /performance/with-middleware',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });

    // Find the middleware span
    const middlewareSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.middleware',
      },
      description: '/performance/with-middleware',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      op: 'function.react_router.middleware',
      origin: 'auto.function.react_router.instrumentation_api',
    });
  });

  test('should have middleware span run before loader span', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/with-middleware';
    });

    await page.goto(`/performance/with-middleware`);

    const transaction = await txPromise;

    const middlewareSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    const loaderSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.loader',
    );

    expect(middlewareSpan).toBeDefined();
    expect(loaderSpan).toBeDefined();

    // Middleware should start before loader
    expect(middlewareSpan!.start_timestamp).toBeLessThanOrEqual(loaderSpan!.start_timestamp);
  });
});
