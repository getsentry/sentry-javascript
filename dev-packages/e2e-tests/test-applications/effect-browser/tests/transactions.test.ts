import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('captures a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('effect-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

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
  const pageLoadTransactionPromise = waitForTransaction('effect-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTransactionPromise = waitForTransaction('effect-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto('/');
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

test('captures Effect spans with correct parent-child structure', async ({ page }) => {
  const pageloadPromise = waitForTransaction('effect-browser', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload';
  });

  const transactionPromise = waitForTransaction('effect-browser', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'ui.action.click' &&
      transactionEvent.spans?.some(span => span.description === 'custom-effect-span')
    );
  });

  await page.goto('/');
  await pageloadPromise;

  const effectSpanButton = page.locator('id=effect-span-button');
  await effectSpanButton.click();

  await expect(page.locator('id=effect-span-result')).toHaveText('Span sent!');

  const transactionEvent = await transactionPromise;
  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'custom-effect-span',
      data: expect.objectContaining({
        'sentry.op': 'internal',
      }),
    }),
  );

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'nested-span',
    }),
  );

  const parentSpan = spans.find(s => s.description === 'custom-effect-span');
  const nestedSpan = spans.find(s => s.description === 'nested-span');
  expect(nestedSpan?.parent_span_id).toBe(parentSpan?.span_id);
});
