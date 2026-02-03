import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

interface SpanData {
  'sentry.op'?: string;
  'sentry.origin'?: string;
  'react_router.route.id'?: string;
  'react_router.route.pattern'?: string;
  'react_router.middleware.name'?: string;
  'react_router.middleware.index'?: number;
}

interface Span {
  span_id?: string;
  trace_id?: string;
  data?: SpanData;
  description?: string;
  parent_span_id?: string;
  start_timestamp?: number;
  timestamp?: number;
  op?: string;
  origin?: string;
}

// Middleware names require ESM loader hook on Node 20.19+/22.12+ - see instrument.mjs for setup.
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
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
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
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    const loaderSpan = transaction?.spans?.find(
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.loader',
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

    // Verify the page rendered
    await expect(page.locator('#multi-middleware-title')).toBeVisible();
    await expect(page.locator('#multi-middleware-content')).toHaveText('This route has 3 middlewares');

    // Find all middleware spans
    const middlewareSpans = transaction?.spans?.filter(
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpans).toHaveLength(3);

    // Sort by index to ensure correct order
    const sortedSpans = [...middlewareSpans!].sort(
      (a: Span, b: Span) =>
        (a.data?.['react_router.middleware.index'] ?? 0) - (b.data?.['react_router.middleware.index'] ?? 0),
    );

    // First middleware (index 0)
    expect(sortedSpans[0]).toMatchObject({
      data: expect.objectContaining({
        'sentry.op': 'function.react_router.middleware',
        'react_router.route.id': 'routes/performance/multi-middleware',
        'react_router.route.pattern': '/performance/multi-middleware',
        'react_router.middleware.index': 0,
      }),
    });

    // Second middleware (index 1)
    expect(sortedSpans[1]).toMatchObject({
      data: expect.objectContaining({
        'sentry.op': 'function.react_router.middleware',
        'react_router.route.id': 'routes/performance/multi-middleware',
        'react_router.route.pattern': '/performance/multi-middleware',
        'react_router.middleware.index': 1,
      }),
    });

    // Third middleware (index 2)
    expect(sortedSpans[2]).toMatchObject({
      data: expect.objectContaining({
        'sentry.op': 'function.react_router.middleware',
        'react_router.route.id': 'routes/performance/multi-middleware',
        'react_router.route.pattern': '/performance/multi-middleware',
        'react_router.middleware.index': 2,
      }),
    });

    // Verify execution order: middleware spans should be sequential
    expect(sortedSpans[0]!.start_timestamp).toBeLessThanOrEqual(sortedSpans[1]!.start_timestamp!);
    expect(sortedSpans[1]!.start_timestamp).toBeLessThanOrEqual(sortedSpans[2]!.start_timestamp!);

    // Verify middleware names are correctly resolved via OTEL patching
    expect(sortedSpans[0]!.data?.['react_router.middleware.name']).toBe('multiAuthMiddleware');
    expect(sortedSpans[1]!.data?.['react_router.middleware.name']).toBe('multiLoggingMiddleware');
    expect(sortedSpans[2]!.data?.['react_router.middleware.name']).toBe('multiValidationMiddleware');
  });

  // Note: Remaining tests focus on index tracking. Name resolution is verified above.
  test('should isolate middleware indices between different routes', async ({ page }) => {
    // First visit the route with different middleware
    const txPromise1 = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/other-middleware';
    });

    await page.goto(`/performance/other-middleware`);

    const transaction1 = await txPromise1;

    // Verify the page rendered
    await expect(page.locator('#other-middleware-title')).toBeVisible();

    // Find the middleware span
    const middlewareSpan1 = transaction1?.spans?.find(
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    // The other route should have its own middleware with index 0
    expect(middlewareSpan1).toMatchObject({
      data: expect.objectContaining({
        'sentry.op': 'function.react_router.middleware',
        'react_router.route.id': 'routes/performance/other-middleware',
        'react_router.route.pattern': '/performance/other-middleware',
        'react_router.middleware.index': 0,
      }),
    });

    // Now visit the multi-middleware route
    const txPromise2 = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/multi-middleware';
    });

    await page.goto(`/performance/multi-middleware`);

    const transaction2 = await txPromise2;

    // Find all middleware spans
    const middlewareSpans2 = transaction2?.spans?.filter(
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    // Should have 3 middleware spans with indices 0, 1, 2 (isolated from previous route)
    expect(middlewareSpans2).toHaveLength(3);

    const indices = middlewareSpans2!.map((span: Span) => span.data?.['react_router.middleware.index']).sort();
    expect(indices).toEqual([0, 1, 2]);
  });

  test('should handle visiting same multi-middleware route twice with fresh indices', async ({ page }) => {
    // First visit
    const txPromise1 = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/multi-middleware';
    });

    await page.goto(`/performance/multi-middleware`);
    await txPromise1;

    // Second visit - indices should reset
    const txPromise2 = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/multi-middleware';
    });

    await page.goto(`/performance/multi-middleware`);

    const transaction2 = await txPromise2;

    const middlewareSpans = transaction2?.spans?.filter(
      (span: Span) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpans).toHaveLength(3);

    // Indices should be 0, 1, 2 (reset for new request)
    const indices = middlewareSpans!.map((span: Span) => span.data?.['react_router.middleware.index']).sort();
    expect(indices).toEqual([0, 1, 2]);
  });
});
