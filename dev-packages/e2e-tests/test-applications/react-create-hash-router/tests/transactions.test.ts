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
      'lcp.element': 'body > div#root > input#exception-button[type="button"]',
      'lcp.id': 'exception-button',
      'lcp.size': 1650,
      'sentry.idle_span_finish_reason': 'idleTimeout',
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.react.reactrouter_v6',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
      'performance.timeOrigin': expect.any(Number),
      'performance.activationStart': expect.any(Number),
      'lcp.renderTime': expect.any(Number),
      'lcp.loadTime': expect.any(Number),
    },
    op: 'pageload',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
      'sentry.op': 'browser.domContentLoadedEvent',
    },
    description: page.url(),
    op: 'browser.domContentLoadedEvent',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser.connect',
    },
    description: page.url(),
    op: 'browser.connect',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser.request',
    },
    description: page.url(),
    op: 'browser.request',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.browser.metrics',
  });
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.ui.browser.metrics',
      'sentry.op': 'browser.response',
    },
    description: page.url(),
    op: 'browser.response',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
