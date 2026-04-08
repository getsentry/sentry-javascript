import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Known React Router limitation: route.lazy hooks only work in Data Mode (createBrowserRouter).
// Framework Mode uses bundler code-splitting which doesn't trigger the lazy hook.
// See: https://github.com/remix-run/react-router/blob/main/decisions/0002-lazy-route-modules.md
// Using test.fail() to auto-detect when React Router fixes this upstream.
test.describe('server - instrumentation API lazy loading', () => {
  test.fail('should instrument lazy route loading with instrumentation API origin', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/lazy-route';
    });

    await page.goto(`/performance/lazy-route`);

    const transaction = await txPromise;

    // Verify the lazy route content is rendered
    await expect(page.locator('#lazy-route-title')).toBeVisible();
    await expect(page.locator('#lazy-route-content')).toHaveText('This route was lazily loaded');

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
      transaction: 'GET /performance/lazy-route',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });

    // Find the lazy span
    const lazySpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.lazy',
    );

    expect(lazySpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.lazy',
      },
      description: 'Lazy Route Load',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      op: 'function.react_router.lazy',
      origin: 'auto.function.react_router.instrumentation_api',
    });
  });

  test('should include loader span after lazy loading completes', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/lazy-route';
    });

    await page.goto(`/performance/lazy-route`);

    const transaction = await txPromise;

    // Find the loader span that runs after lazy loading
    const loaderSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.loader',
    );

    expect(loaderSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.loader',
      },
      description: '/performance/lazy-route',
      op: 'function.react_router.loader',
      origin: 'auto.function.react_router.instrumentation_api',
    });
  });

  test.fail('should have correct span ordering: lazy before loader', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/lazy-route';
    });

    await page.goto(`/performance/lazy-route`);

    const transaction = await txPromise;

    const lazySpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.lazy',
    );

    const loaderSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.loader',
    );

    expect(lazySpan).toBeDefined();
    expect(loaderSpan).toBeDefined();

    // Lazy span should start before or at the same time as loader
    // (lazy loading must complete before loader can run)
    expect(lazySpan!.start_timestamp).toBeLessThanOrEqual(loaderSpan!.start_timestamp);
  });
});
