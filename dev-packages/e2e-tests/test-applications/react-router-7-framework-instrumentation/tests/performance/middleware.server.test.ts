import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

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

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: expect.objectContaining({
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.middleware',
        'react_router.route.id': 'routes/performance/with-middleware',
        'react_router.route.pattern': '/performance/with-middleware',
        'react_router.middleware.index': 0,
      }),
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      op: 'function.react_router.middleware',
      origin: 'auto.function.react_router.instrumentation_api',
    });

    // Middleware name is available via OTEL patching of createRequestHandler
    expect(middlewareSpan!.data?.['react_router.middleware.name']).toBe('authMiddleware');
    expect(middlewareSpan!.description).toBe('middleware authMiddleware');
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
    expect(middlewareSpan!.start_timestamp).toBeLessThanOrEqual(loaderSpan!.start_timestamp!);
  });

  test('should track multiple middlewares with correct indices', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/multi-middleware';
    });

    await page.goto(`/performance/multi-middleware`);

    const transaction = await txPromise;

    await expect(page.locator('#multi-middleware-title')).toBeVisible();
    await expect(page.locator('#multi-middleware-content')).toHaveText('This route has 3 middlewares');

    const middlewareSpans = transaction?.spans?.filter(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpans).toHaveLength(3);

    const sortedSpans = [...middlewareSpans!].sort(
      (a: any, b: any) =>
        (a.data?.['react_router.middleware.index'] ?? 0) - (b.data?.['react_router.middleware.index'] ?? 0),
    );

    expect(sortedSpans.map((s: any) => s.data?.['react_router.middleware.index'])).toEqual([0, 1, 2]);
    expect(sortedSpans.map((s: any) => s.data?.['react_router.middleware.name'])).toEqual([
      'multiAuthMiddleware',
      'multiLoggingMiddleware',
      'multiValidationMiddleware',
    ]);
  });
});
