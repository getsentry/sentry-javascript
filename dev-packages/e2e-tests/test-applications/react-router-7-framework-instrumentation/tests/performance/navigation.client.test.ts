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
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);
    await pageloadTxPromise;

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
            'url.template': '/performance/ssr',
            'url.path': '/performance/ssr',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/),
          },
        },
      },
      transaction: '/performance/ssr',
      type: 'transaction',
    });
  });

  test('should resolve relative navigate targets against the current URL', async ({ page }) => {
    // Wait for the pageload transaction so we know the client has hydrated and the router is
    // instrumented before triggering the relative navigation (avoids a brittle fixed sleep).
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);
    await pageloadTxPromise;

    const navigationTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    await page.getByRole('button', { name: 'Relative SSR Navigate' }).click();

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
            'url.template': '/performance/ssr',
            'url.path': '/performance/ssr',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/),
          },
        },
      },
      transaction: '/performance/ssr',
      type: 'transaction',
    });
  });

  test('should parameterize navigation transaction for dynamic routes', async ({ page }) => {
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);
    await pageloadTxPromise;

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
            'url.template': '/performance/with/:param',
            'url.path': '/performance/with/sentry',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
          },
        },
      },
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });
  });

  test('should send multiple navigation transactions in sequence', async ({ page }) => {
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);
    await pageloadTxPromise;

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

  test('should create navigation transaction for navigate(-1) with correct url attributes', async ({ page }) => {
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);
    await pageloadTxPromise;

    const forwardNavPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    await page.getByRole('link', { name: 'SSR Page' }).click();
    await forwardNavPromise;

    const backNavPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.getByRole('button', { name: 'History Back Navigate' }).click();

    const transaction = await backNavPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router.instrumentation_api',
          data: {
            'sentry.source': 'route',
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
            'navigation.type': 'router.back',
            'url.template': '/performance',
            // react-router-serve 301-redirects the bare index route to a trailing slash in prod, while
            // the dev server serves it without - accept both.
            'url.path': expect.stringMatching(/^\/performance\/?$/),
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/?$/),
          },
        },
      },
      transaction: '/performance',
      type: 'transaction',
      transaction_info: { source: 'route' },
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
