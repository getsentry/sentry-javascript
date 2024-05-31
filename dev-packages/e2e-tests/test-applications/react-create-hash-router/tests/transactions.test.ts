import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Captures a pageload transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-hash-router', event => {
    return event.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const transactionEvent = await transactionEventPromise;
  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      deviceMemory: expect.any(String),
      effectiveConnectionType: expect.any(String),
      hardwareConcurrency: expect.any(String),
      'sentry.idle_span_finish_reason': 'idleTimeout',
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.react.reactrouter_v6',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
    },
    op: 'pageload',
    span_id: expect.any(String),
    trace_id: expect.any(String),
    origin: 'auto.pageload.react.reactrouter_v6',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser',
    },
    description: 'domContentLoadedEvent',
    op: 'browser',
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser',
    },
    description: 'connect',
    op: 'browser',
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser',
    },
    description: 'request',
    op: 'browser',
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser',
    },
    description: 'response',
    op: 'browser',
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    origin: 'auto.ui.browser.metrics',
  });
});

test('Captures a navigation transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-hash-router', event => {
    return event.contexts?.trace?.op === 'navigation';
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionEventPromise;
  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      deviceMemory: expect.any(String),
      effectiveConnectionType: expect.any(String),
      hardwareConcurrency: expect.any(String),
      'sentry.idle_span_finish_reason': 'idleTimeout',
      'sentry.op': 'navigation',
      'sentry.origin': 'auto.navigation.react.reactrouter_v6',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
    }),
    op: 'navigation',
    span_id: expect.any(String),
    trace_id: expect.any(String),
    origin: 'auto.navigation.react.reactrouter_v6',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/user/:id',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.spans).toEqual([]);
});
