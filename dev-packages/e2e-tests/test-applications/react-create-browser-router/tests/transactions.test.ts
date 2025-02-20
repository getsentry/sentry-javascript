import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Captures a pageload transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-browser-router', event => {
    return event.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        deviceMemory: expect.any(String),
        effectiveConnectionType: expect.any(String),
        hardwareConcurrency: expect.any(String),
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
    }),
  );
});

test('Captures a navigation transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-browser-router', event => {
    return event.contexts?.trace?.op === 'navigation';
  });

  await page.goto('/');
  const linkElement = page.locator('id=navigation');
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

test('Captures a lazy pageload transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-browser-router', event => {
    return event.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/lazy-loaded-user/5/foo');

  const transactionEvent = await transactionEventPromise;
  expect(transactionEvent.contexts?.trace).toEqual({
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
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/lazy-loaded-user/:id/:innerId',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(await page.innerText('id=content')).toContain('I am a lazy loaded user');

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      // This one is the outer lazy route
      expect.objectContaining({
        op: 'resource.script',
        origin: 'auto.resource.browser.metrics',
      }),
      // This one is the inner lazy route
      expect.objectContaining({
        op: 'resource.script',
        origin: 'auto.resource.browser.metrics',
      }),
    ]),
  );
});

test('Captures a lazy navigation transaction', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('react-create-browser-router', event => {
    return event.contexts?.trace?.op === 'navigation';
  });

  await page.goto('/');
  const linkElement = page.locator('id=lazy-navigation');
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
    op: 'navigation',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.navigation.react.reactrouter_v6',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/lazy-loaded-user/:id/:innerId',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(await page.innerText('id=content')).toContain('I am a lazy loaded user');

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      // This one is the outer lazy route
      expect.objectContaining({
        op: 'resource.script',
        origin: 'auto.resource.browser.metrics',
      }),
      // This one is the inner lazy route
      expect.objectContaining({
        op: 'resource.script',
        origin: 'auto.resource.browser.metrics',
      }),
    ]),
  );
});
