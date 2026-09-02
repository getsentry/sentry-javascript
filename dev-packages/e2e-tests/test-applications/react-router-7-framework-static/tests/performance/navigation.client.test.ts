import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - navigation performance', () => {
  test('should create navigation transaction', async ({ page }) => {
    const navigationPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`); // pageload
    await pageloadTxPromise;
    await page.getByRole('link', { name: 'SSR Page' }).click(); // navigation

    const transaction = await navigationPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.navigation.react_router',
            'sentry.op': 'navigation',
            'sentry.segment.name.source': 'route',
            'url.template': '/performance/ssr',
            'url.path': '/performance/ssr',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/),
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance/ssr',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/performance/ssr'),
        headers: expect.any(Object),
      },
      event_id: expect.any(String),
      environment: 'qa',
      sdk: {
        integrations: expect.arrayContaining([expect.any(String)]),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
        packages: [
          { name: 'npm:@sentry/react-router', version: expect.any(String) },
          { name: 'npm:@sentry/browser', version: expect.any(String) },
        ],
      },
      tags: { runtime: 'browser' },
    });
  });

  test('should create navigation transaction when navigating with object `to` prop', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/:param' &&
        transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`); // pageload
    await pageloadTxPromise;
    await page.getByRole('link', { name: 'Object Navigate' }).click(); // navigation with object to

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router',
          data: {
            'sentry.segment.name.source': 'route',
            'url.template': '/performance/with/:param',
            'url.path': '/performance/with/object-nav',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/object-nav\?foo=bar$/),
          },
        },
      },
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });
  });

  test('should create navigation transaction when navigating with search-only object `to` prop', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`); // pageload
    await pageloadTxPromise;
    await page.getByRole('link', { name: 'Search Only Navigate' }).click(); // navigation with search-only object to

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.react_router',
          data: {
            'url.template': '/performance',
            // the initial pageload to `/performance` gets 301-redirected to a trailing slash by react-router-serve
            'url.path': '/performance/',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/\?query=test$/),
          },
        },
      },
      transaction: '/performance',
      type: 'transaction',
    });
  });

  test('should update navigation transaction for dynamic routes', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/:param' &&
        transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`); // pageload
    await pageloadTxPromise;
    await page.getByRole('link', { name: 'With Param Page' }).click(); // navigation

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.navigation.react_router',
            'sentry.op': 'navigation',
            'sentry.segment.name.source': 'route',
            'url.template': '/performance/with/:param',
            'url.path': '/performance/with/sentry',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/performance/with/sentry'),
        headers: expect.any(Object),
      },
      event_id: expect.any(String),
      environment: 'qa',
      sdk: {
        integrations: expect.arrayContaining([expect.any(String)]),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
        packages: [
          { name: 'npm:@sentry/react-router', version: expect.any(String) },
          { name: 'npm:@sentry/browser', version: expect.any(String) },
        ],
      },
      tags: { runtime: 'browser' },
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
          origin: 'auto.navigation.react_router',
          data: {
            'sentry.segment.name.source': 'route',
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router',
            'url.template': '/performance',
            // react-router-serve 301-redirects the bare index route to a trailing slash
            'url.path': '/performance/',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/$/),
          },
        },
      },
      transaction: '/performance',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });
  });
});
