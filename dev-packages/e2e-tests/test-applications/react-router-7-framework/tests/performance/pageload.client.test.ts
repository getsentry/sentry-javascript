import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - pageload performance', () => {
  test('should send pageload transaction', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.pageload.react_router',
            'sentry.op': 'pageload',
            'sentry.source': 'route',
            'url.template': '/performance',
            // react-router-serve 301-redirects the bare index route to a trailing slash
            'url.path': '/performance/',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/$/),
          },
          op: 'pageload',
          origin: 'auto.pageload.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance',
      type: 'transaction',
      transaction_info: { source: 'route' },
      measurements: expect.any(Object),
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/performance'),
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

  test('should update pageload transaction for dynamic routes', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/:param' &&
        transactionEvent.contexts?.trace?.op === 'pageload'
      );
    });

    await page.goto(`/performance/with/sentry`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.pageload.react_router',
            'sentry.op': 'pageload',
            'sentry.source': 'route',
            'url.template': '/performance/with/:param',
            'navigation.route.id': 'routes/performance/dynamic-param',
            'url.path': '/performance/with/sentry',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
          },
          op: 'pageload',
          origin: 'auto.pageload.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
      measurements: expect.any(Object),
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

  test('should send pageload transaction for prerendered pages', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/static' && transactionEvent.contexts?.trace?.op === 'pageload'
      );
    });

    await page.goto(`/performance/static`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      transaction: '/performance/static',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.pageload.react_router',
            'sentry.op': 'pageload',
            'sentry.source': 'route',
            'url.template': '/performance/static',
            // react-router-serve 301-redirects prerendered routes to a trailing slash
            'url.path': '/performance/static/',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/static\/$/),
          },
          op: 'pageload',
          origin: 'auto.pageload.react_router',
        },
      },
    });
  });
});
