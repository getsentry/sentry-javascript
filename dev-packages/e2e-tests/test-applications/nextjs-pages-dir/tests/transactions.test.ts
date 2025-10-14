import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const packageJson = require('../package.json');

test('Sends a pageload transaction', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  const pageloadTransactionEventPromise = waitForTransaction('nextjs-pages-dir', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        react: {
          version: expect.any(String),
        },
        trace: {
          // Next.js >= 15 propagates a trace ID to the client via a meta tag. Also, only dev mode emits a meta tag because
          // the requested page is static and only in dev mode SSR is kicked off.
          parent_span_id: nextjsMajor >= 15 && isDevMode ? expect.any(String) : undefined,
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          op: 'pageload',
          origin: 'auto.pageload.nextjs.pages_router_instrumentation',
          data: expect.objectContaining({
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
            'sentry.source': 'route',
          }),
        },
      },
      request: {
        headers: {
          'User-Agent': expect.any(String),
        },
        url: 'http://localhost:3030/',
      },
    }),
  );
});
