import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('captures a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const pageLoadTransaction = await transactionPromise;

  expect(pageLoadTransaction).toMatchObject({
    contexts: {
      trace: {
        data: expect.objectContaining({
          'sentry.idle_span_finish_reason': 'idleTimeout',
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.browser',
          'sentry.sample_rate': 1,
          'sentry.source': 'url',
        }),
        op: 'pageload',
        origin: 'auto.pageload.browser',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    event_id: expect.stringMatching(/[a-f0-9]{32}/),
    measurements: expect.any(Object),
    platform: 'javascript',
    release: 'e2e-test',
    request: {
      headers: {
        'User-Agent': expect.any(String),
      },
      url: 'http://localhost:3030/',
    },
    sdk: {
      integrations: expect.any(Array),
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: 'npm:@sentry/browser',
          version: expect.any(String),
        },
      ],
      version: expect.any(String),
    },
    spans: expect.any(Array),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
    type: 'transaction',
  });
});

test('captures a navigation transaction', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageLoadTransactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTransactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageLoadTransactionPromise;

  const linkElement = page.locator('id=navigation-link');

  await linkElement.click();

  const navigationTransaction = await navigationTransactionPromise;

  expect(navigationTransaction).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.browser',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
  });
});
