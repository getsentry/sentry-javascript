import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// When `useInstrumentationAPI: true` is set and the instrumentations array is passed to
// HydratedRouter, React Router invokes the navigate hook on the client and the navigation span
// is created via the instrumentation API (origin: `auto.navigation.react_router.instrumentation_api`).
// The legacy `instrumentHydratedRouter()` subscribe callback still runs and updates the span
// name to its parameterized form (so `sentry.source` ends up as `route`).
//
// See: https://github.com/remix-run/react-router/discussions/13749

test.describe('client - hybrid navigation (instrumentation API span + legacy parameterization)', () => {
  test('should create navigation span via instrumentation API and parameterize via legacy subscribe', async ({
    page,
  }) => {
    // First load the performance page
    await page.goto(`/performance`);
    await page.waitForTimeout(1000);

    const navigationTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    // Click on the SSR link to navigate
    await page.getByRole('link', { name: 'SSR Page' }).click();

    const transaction = await navigationTxPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
          data: {
            'sentry.source': 'route',
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
            'navigation.type': 'router.navigate',
          },
        },
      },
      transaction: '/performance/ssr',
      type: 'transaction',
    });
  });

  test('should parameterize navigation transaction for dynamic routes', async ({ page }) => {
    await page.goto(`/performance`);
    await page.waitForTimeout(1000);

    const navigationTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/:param' &&
        transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    await page.getByRole('link', { name: 'With Param Page' }).click();

    const transaction = await navigationTxPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
          data: {
            'sentry.source': 'route',
          },
        },
      },
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });
  });

  test('should send multiple navigation transactions in sequence', async ({ page }) => {
    await page.goto(`/performance`);
    await page.waitForTimeout(1000);

    // First navigation: /performance -> /performance/ssr
    const firstNavPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    await page.getByRole('link', { name: 'SSR Page' }).click();

    const firstNav = await firstNavPromise;

    expect(firstNav).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
        },
      },
      transaction: '/performance/ssr',
      type: 'transaction',
    });

    // Second navigation: /performance/ssr -> /performance
    const secondNavPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.getByRole('link', { name: 'Back to Performance' }).click();

    const secondNav = await secondNavPromise;

    expect(secondNav).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
        },
      },
      transaction: '/performance',
      type: 'transaction',
    });
  });
});

// Tests for instrumentation API navigation - expected to fail until React Router fixes upstream
test.describe('client - instrumentation API navigation (upstream limitation)', () => {
  test.fixme('should send navigation transaction with instrumentation API origin', async ({ page }) => {
    // First load the performance page
    await page.goto(`/performance`);

    // Wait for the navigation transaction
    const navigationTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' &&
        transactionEvent.contexts?.trace?.data?.['sentry.origin'] === 'auto.navigation.react_router.instrumentation_api'
      );
    });

    // Click on the SSR link to navigate
    await page.getByRole('link', { name: 'SSR Page' }).click();

    const transaction = await navigationTxPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
            'sentry.source': 'url',
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
        },
      },
      transaction: '/performance/ssr',
      type: 'transaction',
      transaction_info: { source: 'url' },
    });
  });

  test.fixme('should send navigation transaction on parameterized route', async ({ page }) => {
    // First load the performance page
    await page.goto(`/performance`);

    // Wait for the navigation transaction
    const navigationTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/sentry' &&
        transactionEvent.contexts?.trace?.data?.['sentry.origin'] === 'auto.navigation.react_router.instrumentation_api'
      );
    });

    // Click on the With Param link to navigate
    await page.getByRole('link', { name: 'With Param Page' }).click();

    const transaction = await navigationTxPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
            'sentry.source': 'url',
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
        },
      },
      transaction: '/performance/with/sentry',
      type: 'transaction',
      transaction_info: { source: 'url' },
    });
  });
});
