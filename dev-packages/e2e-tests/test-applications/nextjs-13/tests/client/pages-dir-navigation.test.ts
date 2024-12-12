import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should report a navigation transaction for pages router navigations', async ({ page }) => {
  test.skip(process.env.TEST_ENV === 'development', 'Test is flakey in dev mode');
  const navigationTransactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === '/[param]/navigation-target-page' &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  await page.goto('/foo/navigation-start-page');
  await page.click('#navigation-link');

  expect(await navigationTransactionPromise).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/foo/navigation-start-page', to: '/foo/navigation-start-page' },
        timestamp: expect.any(Number),
      },
      { category: 'ui.click', message: 'body > div#__next > a#navigation-link', timestamp: expect.any(Number) },
      {
        category: 'navigation',
        data: { from: '/foo/navigation-start-page', to: '/foo/navigation-target-page' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      trace: {
        data: {
          'sentry.idle_span_finish_reason': 'idleTimeout',
          'sentry.op': 'navigation',
          'sentry.origin': 'auto.navigation.nextjs.pages_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'navigation',
        origin: 'auto.navigation.nextjs.pages_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    platform: 'javascript',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/foo\/navigation-target-page$/),
    },
    spans: expect.arrayContaining([]),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/[param]/navigation-target-page',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
