import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Captures a pageload transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-memory-router', event => {
    return event.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/user/:id',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.idle_span_finish_reason': 'idleTimeout',
        'sentry.op': 'pageload',
        'sentry.origin': 'auto.pageload.react.reactrouter_v6',
        'sentry.sample_rate': 1,
        'sentry.source': 'route',
      }),
      op: 'pageload',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      origin: 'auto.pageload.react.reactrouter_v6',
      status: 'ok',
    }),
  );
});

test('Captures a navigation transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-memory-router', event => {
    return event.contexts?.trace?.op === 'navigation';
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation-button');
  await linkElement.click();

  const transactionEvent = await transactionEventPromise;
  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.idle_span_finish_reason': 'idleTimeout',
      'sentry.op': 'navigation',
      'sentry.origin': 'auto.navigation.react.reactrouter_v6',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
    }),
    links: [
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        sampled: true,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    ],
    op: 'navigation',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.navigation.react.reactrouter_v6',
    status: 'ok',
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
